-- Durable review is created in the same transaction as the immutable attempt,
-- including online/offline finalizers which bypass the public finalizer wrapper.
create table private.workout_completion_reviews (
  owner_id uuid not null,
  attempt_id text not null,
  publication_key text,
  joint_workout_id uuid,
  recap_input jsonb,
  confirmed_at timestamptz,
  primary key(owner_id, attempt_id),
  foreign key(owner_id, attempt_id) references public.experience_attempts(owner_id, attempt_id) on delete cascade
);
create table private.workout_record_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  attempt_id text not null,
  payload jsonb not null,
  selected boolean not null default false,
  foreign key(owner_id, attempt_id) references private.workout_completion_reviews on delete cascade
);
create index workout_record_drafts_owner_attempt on private.workout_record_drafts(owner_id,attempt_id);
revoke all on private.workout_completion_reviews, private.workout_record_drafts from public, anon, authenticated;

create function private.prepare_workout_completion_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.workout_completion_reviews(owner_id,attempt_id,publication_key,joint_workout_id)
  values(new.owner_id,new.attempt_id,new.snapshot->>'recapPublicationKey',nullif(new.snapshot->>'jointWorkoutId','')::uuid);
  -- Every comparable improvement is a separate choice, even at different rep/load partitions.
  insert into private.workout_record_drafts(owner_id,attempt_id,payload)
  select new.owner_id,new.attempt_id,jsonb_build_object(
    'exercise_name',coalesce(catalog.canonical_name,exercise.value->>'recordedName','Ejercicio'),
    'variant',improvement.variant,'record_type',improvement.record_type,
    'partition',improvement.partition_value,'previous_score',improvement.previous_value,
    'best_score',improvement.new_value,'score_unit',improvement.unit)
  from private.contextual_record_improvements(new.owner_id,new.snapshot) improvement
  left join public.exercises catalog on catalog.id=improvement.exercise_id
  left join lateral (select value from jsonb_array_elements(new.snapshot->'exercises')
    where value->>'exerciseId'=improvement.exercise_id and value->>'variant'=improvement.variant limit 1) exercise on true;
  -- Preserve existing bodyweight record support, without the old global LIMIT 1.
  insert into private.workout_record_drafts(owner_id,attempt_id,payload)
  select new.owner_id,new.attempt_id,jsonb_build_object('exercise_name',catalog.canonical_name,
    'record_type','bodyweight_score','previous_score',prior.best,'best_score',score.score,'score_unit',score.unit || '-reps')
  from public.experience_exercise_best_scores(new.snapshot) score
  join public.exercises catalog on lower(catalog.id)=score.exercise_key
  join lateral (select max(previous.score) best,bool_or(history.completed_at<new.completed_at) earlier from public.experience_attempts history
    cross join lateral public.experience_exercise_best_scores(history.snapshot) previous
    where history.owner_id=new.owner_id and history.attempt_id<>new.attempt_id
      and history.completed_at<=now() and previous.exercise_key=score.exercise_key
      and previous.mode=score.mode and previous.unit=score.unit) prior on prior.best<score.score and prior.earlier
  where score.mode='bodyweight' and new.completed_at<=now();
  return new;
end;
$$;
create trigger prepare_workout_completion_review after insert on public.experience_attempts
for each row execute function private.prepare_workout_completion_review();
revoke all on function private.prepare_workout_completion_review() from public,anon,authenticated;

-- Keep unrelated milestones, but never publish the old automatically chosen PR for a new review.
create or replace function private.publish_community_activity(author uuid, activity_kind text, activity_source_key text, activity_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if activity_kind='personal_record' and exists(select 1 from private.workout_completion_reviews review
    where review.owner_id=author and activity_source_key='personal-record:' || review.attempt_id) then return; end if;
  insert into public.community_activities(author_id,kind,source_key,payload)
  values(author,activity_kind,activity_source_key,activity_payload) on conflict(author_id,source_key) do nothing;
end;
$$;

alter function public.create_workout_recap(jsonb) rename to create_workout_recap_before_review;
revoke all on function public.create_workout_recap_before_review(jsonb) from public,anon,authenticated;
create function public.create_workout_recap(input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid:=public.require_actor();
begin
  if exists(select 1 from private.workout_completion_reviews where owner_id=actor
    and publication_key=input->>'publication_key' and confirmed_at is null) then
    raise exception 'workout publication requires review';
  end if;
  return public.create_workout_recap_before_review(input);
end;
$$;
revoke all on function public.create_workout_recap(jsonb) from public,anon;
grant execute on function public.create_workout_recap(jsonb) to authenticated;

create function private.completion_recap_input(actor uuid, input jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare profile public.profiles%rowtype; payload jsonb:=input->'share_payload';
begin
  select * into profile from public.profiles where id=actor;
  if not profile.share_routine_template then payload:=null;
  else
    if not profile.share_mesocycle_template then payload:=payload-'mesocycle'; end if;
    if not profile.share_performed_set_details then payload:=payload-'performedSets'; end if;
  end if;
  -- Match the existing recap publisher's safe fallback for unavailable legacy templates.
  if payload is not null and not private.is_valid_recap_share_payload(payload) then payload:=null; end if;
  return (input-'share_payload') || case when payload is null then '{}'::jsonb else jsonb_build_object('share_payload',payload) end;
end;
$$;
revoke all on function private.completion_recap_input(uuid,jsonb) from public,anon,authenticated;

create function public.stage_workout_completion(attempt_id_input text, recap_input jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid:=public.require_actor(); review private.workout_completion_reviews%rowtype;
begin
  select * into review from private.workout_completion_reviews where owner_id=actor and attempt_id=attempt_id_input for update;
  if not found then
    if not exists(select 1 from public.experience_attempts where owner_id=actor and attempt_id=attempt_id_input) then
      raise exception 'completion not confirmed';
    end if;
    return false; -- Only confirmed historical attempts retain their existing behavior.
  end if;
  if review.confirmed_at is not null or review.joint_workout_id is not null then return true; end if;
  if jsonb_typeof(recap_input) is distinct from 'object' or review.publication_key is null
    or recap_input->>'publication_key' is distinct from review.publication_key
    or jsonb_typeof(recap_input->'exercise_details'->'exercises') is distinct from 'array'
    or pg_column_size(recap_input)>1048576 then raise exception 'invalid completion preview'; end if;
  update private.workout_completion_reviews set recap_input=private.completion_recap_input(actor,stage_workout_completion.recap_input)
    where owner_id=actor and attempt_id=attempt_id_input;
  return true;
end;
$$;
revoke all on function public.stage_workout_completion(text,jsonb) from public,anon;
grant execute on function public.stage_workout_completion(text,jsonb) to authenticated;

alter function public.get_workout_completion_preview(text) rename to get_workout_completion_preview_before_review;
revoke all on function public.get_workout_completion_preview_before_review(text) from public,anon,authenticated;
create function public.get_workout_completion_preview(attempt_id_input text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid:=public.require_actor(); review private.workout_completion_reviews%rowtype;
  profile public.profiles%rowtype; base jsonb; records jsonb; recap jsonb; input jsonb;
begin
  base:=public.get_workout_completion_preview_before_review(attempt_id_input);
  select * into review from private.workout_completion_reviews where owner_id=actor and attempt_id=attempt_id_input;
  if not found then return base || jsonb_build_object('review_required',false,'records','[]'::jsonb); end if;
  select * into profile from public.profiles where id=actor;
  select coalesce(jsonb_agg(jsonb_build_object('id',draft.id,'kind','personal_record','payload',draft.payload,
    'selected',draft.selected,'author_alias',profile.alias,'author_avatar_id',profile.avatar_id,
    'author_frame_id',profile.equipped_frame_id,'author_title_id',profile.equipped_title_id,
    'author_theme_id',profile.presentation_theme_id,'created_at',coalesce(review.confirmed_at,now()))
    order by draft.payload->>'exercise_name',draft.payload->>'variant',draft.payload->>'record_type',draft.id),'[]'::jsonb)
    into records from private.workout_record_drafts draft where draft.owner_id=actor and draft.attempt_id=attempt_id_input;
  recap:=base->'recap';
  if review.confirmed_at is null and profile.auto_share_completed_workouts and review.recap_input is not null then
    input:=private.completion_recap_input(actor,review.recap_input);
    recap:=(input-'exercise_details'-'share_payload'-'publication_key') || jsonb_build_object(
      'id','preview:' || attempt_id_input,'author_alias',profile.alias,'author_avatar_id',profile.avatar_id,
      'author_frame_id',profile.equipped_frame_id,'author_title_id',profile.equipped_title_id,'author_theme_id',profile.presentation_theme_id,
      'is_author',true,'created_at',now(),'template_available',coalesce(input->'share_payload' ? 'routine',false),
      'mesocycle_available',coalesce(input->'share_payload' ? 'mesocycle',false),
      'muscle_group_ids',coalesce((select jsonb_agg(distinct muscle.value) from jsonb_array_elements(input->'exercise_details'->'exercises') exercise(value)
        cross join lateral jsonb_array_elements(exercise.value->'muscle_group_ids') muscle(value)),'[]'::jsonb),
      'muscle_distribution',coalesce((select jsonb_agg(jsonb_build_object('id',id,'value',count)) from (
        select muscle.id,count(*) from jsonb_array_elements(input->'exercise_details'->'exercises') exercise(value)
        cross join lateral (select distinct value#>>'{}' id from jsonb_array_elements(exercise.value->'muscle_group_ids')) muscle group by muscle.id) distribution),'[]'::jsonb));
  end if;
  return base || jsonb_build_object('review_required',review.confirmed_at is null,'records',records,'recap',recap,
    'activities',coalesce((select jsonb_agg(item.value-'selected') from jsonb_array_elements(records) item(value) where exists(select 1 from public.community_activities activity where activity.id=(item.value->>'id')::uuid)),'[]'::jsonb),
    'sharing_enabled',profile.auto_share_completed_workouts,'joint',review.joint_workout_id is not null,
    'status',case when review.confirmed_at is null then 'review' else base->>'status' end);
end;
$$;
revoke all on function public.get_workout_completion_preview(text) from public,anon;
grant execute on function public.get_workout_completion_preview(text) to authenticated;

-- A group's existing publication barrier also waits for each completed participant's review.
alter function private.finalize_joint_workout(uuid) rename to finalize_joint_workout_before_review;
create function private.finalize_joint_workout(workout_id_input uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_joint_workout_lifecycle();
  if exists(select 1 from private.workout_completion_reviews where joint_workout_id=workout_id_input and confirmed_at is null) then return 'waiting'; end if;
  return private.finalize_joint_workout_before_review(workout_id_input);
end;
$$;
revoke all on function private.finalize_joint_workout(uuid),private.finalize_joint_workout_before_review(uuid) from public,anon,authenticated;

create function public.confirm_workout_completion(attempt_id_input text, selected_record_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=public.require_actor(); review private.workout_completion_reviews%rowtype; profile public.profiles%rowtype;
begin
  perform private.lock_joint_workout_lifecycle();
  select * into review from private.workout_completion_reviews where owner_id=actor and attempt_id=attempt_id_input for update;
  if not found then raise exception 'completion review unavailable'; end if;
  -- Lost response / repeated taps return the original outcome, never publish a new selection.
  if review.confirmed_at is not null then return public.get_workout_completion_preview(attempt_id_input); end if;
  if selected_record_ids is null or exists(select 1 from unnest(selected_record_ids) requested(id) where requested.id is null or not exists(
    select 1 from private.workout_record_drafts draft where draft.id=requested.id and draft.owner_id=actor and draft.attempt_id=attempt_id_input))
    or cardinality(selected_record_ids)<>(select count(distinct id) from unnest(selected_record_ids) id) then raise exception 'invalid record selection'; end if;
  select * into profile from public.profiles where id=actor for share;
  update private.workout_completion_reviews set confirmed_at=statement_timestamp() where owner_id=actor and attempt_id=attempt_id_input;
  update private.workout_record_drafts set selected=id=any(selected_record_ids) where owner_id=actor and attempt_id=attempt_id_input;
  if profile.auto_share_completed_workouts then
    if review.joint_workout_id is null then
      if review.recap_input is null then raise exception 'completion preview not ready'; end if;
      perform public.create_workout_recap_before_review(private.completion_recap_input(actor,review.recap_input));
    end if;
    insert into public.community_activities(id,author_id,kind,source_key,payload)
    select id,actor,'personal_record','selected-record:' || id,payload from private.workout_record_drafts
      where owner_id=actor and attempt_id=attempt_id_input and selected on conflict(author_id,source_key) do nothing;
  end if;
  if review.joint_workout_id is not null then perform private.finalize_joint_workout(review.joint_workout_id); end if;
  return public.get_workout_completion_preview(attempt_id_input);
end;
$$;
revoke all on function public.confirm_workout_completion(text,uuid[]) from public,anon;
grant execute on function public.confirm_workout_completion(text,uuid[]) to authenticated;

create function public.list_pending_workout_reviews()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('attempt_id',review.attempt_id,'routine_name',attempt.snapshot->>'recordedRoutineName')),'[]'::jsonb)
  from private.workout_completion_reviews review join public.experience_attempts attempt using(owner_id,attempt_id)
  where review.owner_id=public.require_actor() and review.confirmed_at is null
$$;
revoke all on function public.list_pending_workout_reviews() from public,anon;
grant execute on function public.list_pending_workout_reviews() to authenticated;
notify pgrst,'reload schema';
