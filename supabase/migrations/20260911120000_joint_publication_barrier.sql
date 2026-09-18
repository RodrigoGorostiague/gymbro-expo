-- Publication is a server-owned barrier, independent of app lifetime.
alter table public.joint_workout_participants add column terminal_reason text
  check (terminal_reason in ('cancelled', 'expired'));
update public.joint_workout_participants set terminal_reason = 'cancelled'
where status = 'declined' and joined_at is not null;

create or replace function private.finalize_joint_workout(workout_id_input uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare workout public.joint_workouts%rowtype;
begin
  perform private.lock_joint_workout_lifecycle();
  select * into workout from public.joint_workouts where id = workout_id_input for update;
  if not found then raise exception 'joint workout unavailable'; end if;
  if workout.created_at + interval '24 hours' <= statement_timestamp() then
    update public.joint_workout_participants set status = 'declined', terminal_reason = 'expired',
      finished_at = coalesce(finished_at, statement_timestamp())
    where joint_workout_id = workout.id and status = 'active';
    update public.workout_start_activities set closed_at = coalesce(closed_at, statement_timestamp())
    where joint_workout_id = workout.id and closed_at is null;
  end if;
  if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout.id and status = 'active') then
    return 'waiting';
  end if;
  update public.joint_workout_participants set status = 'declined', finished_at = coalesce(finished_at, statement_timestamp())
  where joint_workout_id = workout.id and status = 'invited';
  update public.joint_workouts set completed_at = coalesce(completed_at, statement_timestamp()) where id = workout.id;
  -- Empty merged source groups are historical identities, not workouts to publish.
  if not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout.id and joined_at is not null) then
    return 'closed';
  end if;
  insert into public.joint_workout_posts(joint_workout_id) values(workout.id) on conflict (joint_workout_id) do update
    set last_activity_at = greatest(joint_workout_posts.last_activity_at, excluded.last_activity_at)
    where workout.completed_at is null;
  return 'published';
end;
$$;
revoke all on function private.finalize_joint_workout(uuid) from public, anon, authenticated;

create or replace function public.reconcile_joint_workout_publications()
returns integer language plpgsql security definer set search_path = '' as $$
declare candidate record; processed integer := 0;
begin
  perform private.lock_joint_workout_lifecycle();
  for candidate in select workout.id from public.joint_workouts workout
    where (workout.completed_at is null and workout.created_at <= statement_timestamp() - interval '24 hours')
      or (not exists (select 1 from public.joint_workout_participants p where p.joint_workout_id = workout.id and p.status = 'active')
        and not exists (select 1 from public.joint_workout_posts post where post.joint_workout_id = workout.id)
        and exists (select 1 from public.joint_workout_participants p where p.joint_workout_id = workout.id and p.joined_at is not null))
    order by workout.created_at limit 500
  loop
    perform private.finalize_joint_workout(candidate.id);
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;
revoke all on function public.reconcile_joint_workout_publications() from public, anon, authenticated;
grant execute on function public.reconcile_joint_workout_publications() to service_role;

create or replace function public.finish_joint_workout(workout_id uuid, visibility_input public.joint_workout_visibility, completed_workout_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); remaining integer; affected integer; is_initiator boolean;
begin
  perform private.lock_joint_workout_lifecycle();
  if not private.is_valid_joint_completed_workout(completed_workout_input) then raise exception 'invalid joint completed workout'; end if;
  update public.joint_workout_participants set status = 'completed', visibility = visibility_input,
    completed_workout = completed_workout_input, terminal_reason = null, finished_at = statement_timestamp(), last_seen_at = statement_timestamp()
  where joint_workout_id = workout_id and participant_id = actor and (status = 'active' or (status = 'declined' and terminal_reason = 'expired'));
  get diagnostics affected = row_count;
  if affected = 0 then
    if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'completed') then
      perform private.finalize_joint_workout(workout_id);
      update public.workout_start_activities set closed_at = statement_timestamp() where author_id = actor and joint_workout_id = workout_id and closed_at is null;
      return;
    end if;
    raise exception 'joint workout participant unavailable';
  end if;
  update public.workout_start_activities set closed_at = statement_timestamp() where author_id = actor and joint_workout_id = workout_id and closed_at is null;
  select initiator_id = actor into is_initiator from public.joint_workouts where id = workout_id for update;
  if is_initiator then
    update public.joint_workout_participants set status = 'declined', finished_at = coalesce(finished_at, statement_timestamp()), last_seen_at = statement_timestamp() where joint_workout_id = workout_id and status = 'invited';
  end if;
  perform private.finalize_joint_workout(workout_id);
  if exists (select 1 from public.community_activities where author_id = actor and kind in ('first_joint_workout', 'joint_workout_completed')) then
    perform private.publish_community_activity(actor, 'joint_workout_completed', format('joint-workout:%s', workout_id), '{}'::jsonb);
  else
    perform private.publish_community_activity(actor, 'first_joint_workout', 'first-joint-workout', '{}'::jsonb);
  end if;
end;
$$;
create or replace function public.leave_joint_workout(workout_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  owner uuid;
  participant_status public.joint_workout_participant_status;
begin
  perform private.lock_joint_workout_lifecycle();
  -- Match finish_joint_workout: participant rows are always locked before the workout row.
  select status into participant_status
  from public.joint_workout_participants
  where joint_workout_id = workout_id and participant_id = actor
  for update;
  if participant_status is null then
    if not exists (select 1 from public.joint_workouts where id = workout_id) then raise exception 'joint workout unavailable'; end if;
    raise exception 'joint workout participant unavailable';
  end if;

  select initiator_id into owner from public.joint_workouts where id = workout_id for update;
  if owner is null then raise exception 'joint workout unavailable'; end if;

  if participant_status in ('completed', 'declined') then
    perform private.finalize_joint_workout(workout_id);
    update public.workout_start_activities set closed_at = statement_timestamp()
    where author_id = actor and joint_workout_id = workout_id and closed_at is null;
    return;
  end if;
  if participant_status <> 'active' then raise exception 'joint workout participant unavailable'; end if;

  update public.joint_workout_participants
  set status = 'declined', terminal_reason = 'cancelled', finished_at = coalesce(finished_at, statement_timestamp()), last_seen_at = statement_timestamp()
  where joint_workout_id = workout_id and participant_id = actor and status = 'active';
  update public.workout_start_activities set closed_at = statement_timestamp()
  where author_id = actor and joint_workout_id = workout_id and closed_at is null;

  if owner = actor then
    update public.joint_workout_participants
    set status = 'declined', finished_at = coalesce(finished_at, statement_timestamp())
    where joint_workout_id = workout_id and status = 'invited';
  end if;

  if not exists (
    select 1 from public.joint_workout_participants
    where joint_workout_id = workout_id and status = 'active'
  ) then
    update public.joint_workout_participants
    set status = 'declined', finished_at = coalesce(finished_at, statement_timestamp())
    where joint_workout_id = workout_id and status = 'invited';
    update public.joint_workouts set completed_at = coalesce(completed_at, statement_timestamp()) where id = workout_id;
  end if;
  perform private.finalize_joint_workout(workout_id);
end;
$$;
create or replace function public.respond_joint_workout_invite(workout_id uuid, accepted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  source_activity public.workout_start_activities%rowtype;
  source_workout_id uuid;
  source_active_count integer;
  target_count integer;
begin
  perform private.lock_joint_workout_lifecycle();
  if accepted is null then raise exception 'invalid joint workout response'; end if;
  if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor
    and ((accepted and status in ('active', 'completed') and joined_at is not null) or (not accepted and status = 'declined'))) then return; end if;
  perform 1 from public.joint_workouts where id = workout_id and completed_at is null for update;
  if not found then raise exception 'joint workout unavailable'; end if;
  perform private.expire_joint_workout_invitations(actor, workout_id);
  if not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'invited') then
    raise exception 'joint workout invite unavailable';
  end if;
  if not accepted then
    update public.joint_workout_participants set status = 'declined', finished_at = coalesce(finished_at, statement_timestamp()), last_seen_at = statement_timestamp()
    where joint_workout_id = workout_id and participant_id = actor and status = 'invited';
    return;
  end if;
  if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and joined_at is not null and status <> 'active') then
    raise exception 'joint workout membership frozen after a participant finishes';
  end if;
  if not exists (select 1 from private.active_workout_activity(actor)) then raise exception 'active workout required'; end if;

  select * into source_activity from private.active_workout_activity(actor);
  source_workout_id := source_activity.joint_workout_id;
  if source_workout_id is not null and source_workout_id <> workout_id then
    if exists (select 1 from public.joint_workout_participants where joint_workout_id in (source_workout_id, workout_id) and joined_at is not null and status <> 'active') then
      raise exception 'joint workout membership frozen after a participant finishes';
    end if;
    perform 1 from public.joint_workouts where id = source_workout_id and completed_at is null for update;
    if not found or not exists (select 1 from public.joint_workout_participants where joint_workout_id = source_workout_id and participant_id = actor and status = 'active') then
      raise exception 'joint workout invite unavailable';
    end if;
    select count(*) into source_active_count from public.joint_workout_participants where joint_workout_id = source_workout_id and status = 'active';
    select count(*) into target_count from (
      select participant_id from public.joint_workout_participants where joint_workout_id = workout_id and status <> 'declined'
      union select participant_id from public.joint_workout_participants where joint_workout_id = source_workout_id and status = 'active'
    ) occupied;
    if target_count > 4 then raise exception 'joint workout participant limit reached'; end if;
    if exists (
      select 1 from public.joint_workout_participants source
      join public.joint_workout_participants destination on destination.participant_id = source.participant_id
      where source.joint_workout_id = source_workout_id and source.status = 'active'
        and destination.joint_workout_id = workout_id and destination.status = 'completed'
    ) then raise exception 'joint workout completed participant conflict'; end if;
    -- Merging cannot extend the oldest execution beyond its original 24-hour deadline.
    update public.joint_workouts destination set created_at = least(destination.created_at, source.created_at)
    from public.joint_workouts source where destination.id = workout_id and source.id = source_workout_id;
    -- Move exact attempt mappings even when finalization already closed presence.
    update public.workout_start_activities activity set joint_workout_id = workout_id
    where activity.joint_workout_id = source_workout_id and exists (
      select 1 from public.joint_workout_participants member where member.joint_workout_id = source_workout_id
        and member.participant_id = activity.author_id and member.status = 'active');
    -- A source member may also have an invitation in the destination group.
    update public.joint_workout_participants destination
    set status = 'active', joined_at = source.joined_at, last_seen_at = statement_timestamp()
    from public.joint_workout_participants source
    where destination.joint_workout_id = workout_id and source.joint_workout_id = source_workout_id
      and destination.participant_id = source.participant_id and source.status = 'active';
    delete from public.joint_workout_participants source where source.joint_workout_id = source_workout_id
      and source.status = 'active' and exists (select 1 from public.joint_workout_participants destination
        where destination.joint_workout_id = workout_id and destination.participant_id = source.participant_id);
    update public.joint_workout_participants set joint_workout_id = workout_id, visibility = 'circle', last_seen_at = statement_timestamp()
    where joint_workout_id = source_workout_id and status = 'active';
    update public.joint_workout_participants set status = 'declined', finished_at = coalesce(finished_at, statement_timestamp()), last_seen_at = statement_timestamp()
    where joint_workout_id = source_workout_id and status = 'invited';
    update public.joint_workouts set completed_at = statement_timestamp() where id = source_workout_id;
  end if;

  update public.joint_workout_participants
  set status = 'active', routine_snapshot = null, visibility = 'circle', joined_at = coalesce(joined_at, statement_timestamp()), last_seen_at = statement_timestamp()
  where joint_workout_id = workout_id and participant_id = actor and status = 'invited';
  update public.workout_start_activities set joint_workout_id = workout_id where id = source_activity.id;
end;
$$;
-- Keep the immutable import payload with the completed joint workout, while preserving
-- the existing server-owned participant visibility policy for both the workout and payload.
create or replace function private.is_valid_joint_completed_workout(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare exercise jsonb; set_value jsonb; muscle jsonb;
begin
  if jsonb_typeof(value) <> 'object' or not value ?& array['routineName', 'durationSeconds', 'exercises']
    or exists (select 1 from jsonb_object_keys(value) key where key <> all(array['routineName', 'durationSeconds', 'exercises', 'sharePayload']))
    or jsonb_typeof(value -> 'routineName') <> 'string' or char_length(btrim(value ->> 'routineName')) not between 1 and 120
    or jsonb_typeof(value -> 'durationSeconds') <> 'number' or (value ->> 'durationSeconds')::numeric <> trunc((value ->> 'durationSeconds')::numeric) or (value ->> 'durationSeconds')::integer not between 0 and 2147483647
    or jsonb_typeof(value -> 'exercises') <> 'array' or jsonb_array_length(value -> 'exercises') > 100
    or (value ? 'sharePayload' and not private.is_valid_recap_share_payload(value -> 'sharePayload')) then return false; end if;
  for exercise in select element.value from jsonb_array_elements(value -> 'exercises') as element(value) loop
    if jsonb_typeof(exercise) <> 'object' or not exercise ?& array['name', 'muscleGroupIds', 'sets']
      or exists (select 1 from jsonb_object_keys(exercise) key where key <> all(array['name', 'muscleGroupIds', 'sets']))
      or jsonb_typeof(exercise -> 'name') <> 'string' or char_length(btrim(exercise ->> 'name')) not between 1 and 120
      or jsonb_typeof(exercise -> 'muscleGroupIds') <> 'array' or jsonb_typeof(exercise -> 'sets') <> 'array' or jsonb_array_length(exercise -> 'sets') > 100 then return false; end if;
    for muscle in select element.value from jsonb_array_elements(exercise -> 'muscleGroupIds') as element(value) loop
      if jsonb_typeof(muscle) <> 'string' or char_length(btrim(muscle #>> '{}')) not between 1 and 120 then return false; end if;
    end loop;
    for set_value in select element.value from jsonb_array_elements(exercise -> 'sets') as element(value) loop
      if jsonb_typeof(set_value) <> 'object' or not set_value ?& array['weight', 'reps', 'completed']
        or exists (select 1 from jsonb_object_keys(set_value) key where key <> all(array['weight', 'reps', 'completed']))
        or jsonb_typeof(set_value -> 'weight') <> 'number' or (set_value ->> 'weight')::numeric not between 0 and 10000
        or jsonb_typeof(set_value -> 'reps') <> 'number' or (set_value ->> 'reps')::numeric <> trunc((set_value ->> 'reps')::numeric) or (set_value ->> 'reps')::integer not between 0 and 1000
        or jsonb_typeof(set_value -> 'completed') <> 'boolean' then return false; end if;
    end loop;
  end loop;
  return true;
end;
$$;

create or replace function private.can_view_joint_post(viewer uuid, workout uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.joint_workouts where id = workout and completed_at is not null)
    and not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout and status = 'active')
    and (private.has_joined_joint_workout(viewer, workout)
    or exists (
      select 1
      from public.joint_workout_participants participant
      where participant.joint_workout_id = workout
        and participant.status = 'completed'
        and private.is_current_joint_connection(viewer, participant.participant_id)
    )
)
$$;
create or replace function public.list_joint_workout_posts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', workout.id, 'created_at', post.created_at, 'updated_at', post.last_activity_at, 'completed_at', workout.completed_at,
    'participants', (select jsonb_agg(jsonb_build_object('id', participant.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id,
      'equipped_frame_id', profile.equipped_frame_id, 'equipped_title_id', profile.equipped_title_id, 'presentation_theme_id', profile.presentation_theme_id,
      'status', participant.status, 'terminal_reason', participant.terminal_reason) order by participant.joined_at nulls last)
      from public.joint_workout_participants participant join public.profiles profile on profile.id = participant.participant_id where participant.joint_workout_id = workout.id and participant.joined_at is not null)) order by post.last_activity_at desc, post.joint_workout_id desc)
  from public.joint_workout_posts post join public.joint_workouts workout on workout.id = post.joint_workout_id where private.can_view_joint_post(actor, workout.id)), '[]'::jsonb);
end;
$$;
create or replace function public.get_joint_workout_detail(workout_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); result jsonb;
begin
  if not exists (select 1 from public.joint_workout_posts where joint_workout_id = workout_id)
    or not private.can_view_joint_post(actor, workout_id) then
    raise exception 'joint workout unavailable';
  end if;

  select jsonb_build_object('id', workout.id, 'initiator_id', workout.initiator_id,
    'suggested_routine', case when workout.initiator_id = actor then workout.suggested_routine else null end,
    'created_at', post.created_at, 'completed_at', workout.completed_at, 'participants', (
    select jsonb_agg(jsonb_build_object('id', participant.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id,
      'equipped_frame_id', profile.equipped_frame_id, 'equipped_title_id', profile.equipped_title_id, 'presentation_theme_id', profile.presentation_theme_id,
      'status', participant.status, 'terminal_reason', participant.terminal_reason, 'visibility', participant.visibility,
      'relationship_kind', (select relationship.kind from public.relationships relationship where relationship.member_low = least(actor, participant.participant_id) and relationship.member_high = greatest(actor, participant.participant_id)),
      'workout', case when participant.status = 'completed' and (private.has_joined_joint_workout(actor, workout.id) or private.can_view_joint_participant(actor, participant.participant_id, participant.visibility)) then participant.completed_workout - 'sharePayload' else null end,
      'share_payload', case when participant.status = 'completed' and (private.has_joined_joint_workout(actor, workout.id) or private.can_view_joint_participant(actor, participant.participant_id, participant.visibility)) then participant.completed_workout -> 'sharePayload' else null end,
      'can_invite_bro', participant.participant_id <> actor and not private.is_current_joint_connection(actor, participant.participant_id)) order by participant.joined_at nulls last)
    from public.joint_workout_participants participant join public.profiles profile on profile.id = participant.participant_id
    where participant.joint_workout_id = workout.id and participant.joined_at is not null
  )) into result
  from public.joint_workouts workout join public.joint_workout_posts post on post.joint_workout_id = workout.id
  where workout.id = workout_id;
  return result;
end;
$$;

create or replace function public.get_joint_workout_publication_status(workout_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); publication_state text;
begin
  perform private.lock_joint_workout_lifecycle();
  if not private.has_joined_joint_workout(actor, workout_id) then raise exception 'joint workout unavailable'; end if;
  publication_state := private.finalize_joint_workout(workout_id);
  return jsonb_build_object('state', publication_state, 'workout_id', workout_id,
    'waiting_count', (select count(*) from public.joint_workout_participants where joint_workout_id = workout_id and status = 'active'),
    'expires_at', (select created_at + interval '24 hours' from public.joint_workouts where id = workout_id));
end;
$$;
revoke all on function public.get_joint_workout_publication_status(uuid) from public, anon;
grant execute on function public.get_joint_workout_publication_status(uuid) to authenticated;

-- Bounded backfill; the scheduled reconciler drains remaining historical rows.
select public.reconcile_joint_workout_publications();

-- Versioned RPC keeps old app clients compatible while exposing the barrier state.
create or replace function public.finish_joint_workout_attempt_with_status(owner_input uuid, attempt_id_input text, captured_workout_id uuid, visibility_input public.joint_workout_visibility, completed_workout_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare canonical uuid;
begin
  perform private.lock_joint_workout_lifecycle();
  if public.require_actor() <> owner_input or owner_input is null then raise exception 'joint workout owner mismatch'; end if;
  canonical := coalesce(public.resolve_joint_workout_attempt(attempt_id_input), captured_workout_id);
  perform public.finish_joint_workout(canonical, visibility_input, completed_workout_input);
  return public.get_joint_workout_publication_status(canonical);
end;
$$;
revoke all on function public.finish_joint_workout_attempt_with_status(uuid,text,uuid,public.joint_workout_visibility,jsonb) from public, anon;
grant execute on function public.finish_joint_workout_attempt_with_status(uuid,text,uuid,public.joint_workout_visibility,jsonb) to authenticated;

create or replace function public.add_joint_workout_participant(workout_id uuid, target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); owner uuid; participant_count integer;
begin
  perform private.lock_joint_workout_lifecycle();
  select initiator_id into owner from public.joint_workouts where id = workout_id and completed_at is null for update;
  if owner is null or owner <> actor then raise exception 'joint workout invite unavailable'; end if;
  if not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'active') then raise exception 'joint workout invite unavailable'; end if;
  if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and joined_at is not null and status <> 'active') then
    raise exception 'joint workout membership frozen after a participant finishes';
  end if;
  perform public.lock_pair(actor, target);
  if not private.is_current_joint_connection(actor, target) then raise exception 'joint workout connection unavailable'; end if;
  if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = target) then raise exception 'joint workout participant already exists'; end if;
  select count(*) into participant_count from public.joint_workout_participants where joint_workout_id = workout_id and status <> 'declined';
  if participant_count >= 4 then raise exception 'joint workout participant limit reached'; end if;
  insert into public.joint_workout_participants (joint_workout_id, participant_id, status) values (workout_id, target, 'invited');
end;
$$;

create or replace function public.invite_active_workout_member(target uuid, suggested_routine_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  target_activity public.workout_start_activities%rowtype;
  actor_activity public.workout_start_activities%rowtype;
  workout_id uuid;
  participant_count integer;
  source_active_count integer;
begin
  perform private.lock_joint_workout_lifecycle();
  select * into actor_activity from private.active_workout_activity(actor);
  select * into target_activity from private.active_workout_activity(target);
  if actor_activity.id is null or target_activity.id is null then raise exception 'active workout required'; end if;
  perform public.lock_pair(actor, target);
  if not private.is_current_joint_connection(actor, target) then raise exception 'joint workout connection unavailable'; end if;

  if exists (select 1 from public.joint_workout_participants where joint_workout_id = target_activity.joint_workout_id and joined_at is not null and status <> 'active') then
    raise exception 'joint workout membership frozen after a participant finishes';
  end if;
  workout_id := actor_activity.joint_workout_id;
  if workout_id is null then
    if not private.is_valid_recap_template_routine(suggested_routine_input) then raise exception 'invalid joint workout routine'; end if;
    insert into public.joint_workouts (initiator_id, suggested_routine)
    values (actor, suggested_routine_input) returning id into workout_id;
    insert into public.joint_workout_participants (joint_workout_id, participant_id, routine_snapshot, status, joined_at)
    values (workout_id, actor, null, 'active', now());
    update public.workout_start_activities set joint_workout_id = workout_id where id = actor_activity.id;
  end if;

  if not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'active') then
    raise exception 'joint workout participant unavailable';
  end if;
  if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and joined_at is not null and status <> 'active') then
    raise exception 'joint workout membership frozen after a participant finishes';
  end if;
  if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = target) then
    if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = target and status <> 'declined') then return workout_id; end if;
    raise exception 'joint workout participant already exists';
  end if;
  select count(*) into participant_count from public.joint_workout_participants where joint_workout_id = workout_id and status <> 'declined';
  select count(*) into source_active_count from public.joint_workout_participants where joint_workout_id = target_activity.joint_workout_id and status = 'active';
  if participant_count + greatest(source_active_count, 1) > 4 then raise exception 'joint workout participant limit reached'; end if;
  insert into public.joint_workout_participants (joint_workout_id, participant_id, status) values (workout_id, target, 'invited');
  return workout_id;
end;
$$;
