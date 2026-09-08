-- Serialize lifecycle transitions before row/pair locks, including legacy entrypoints.
-- This deliberately trades joint-write throughput for a single deadlock-free order.
create or replace function private.lock_joint_workout_lifecycle()
returns void language sql volatile security definer set search_path = '' as $$
  select pg_advisory_xact_lock(820260908, 1)
$$;
revoke all on function private.lock_joint_workout_lifecycle() from public, anon, authenticated;

-- Durable owner + attempt mapping survives presence closure and group merges.
alter table public.workout_start_activities add column attempt_id text;
create unique index workout_start_activities_attempt on public.workout_start_activities(author_id, attempt_id) where attempt_id is not null;

-- Only backfill an unambiguous exact captured group; never associate the latest
-- presence merely because it belongs to the same owner.
update public.workout_start_activities activity
set attempt_id = state.active_workout_draft ->> 'attemptId'
from public.training_states state
where state.owner_id = activity.author_id and activity.attempt_id is null
  and state.active_workout_draft ->> 'attemptId' is not null
  and state.active_workout_draft ->> 'jointWorkoutId' = activity.joint_workout_id::text
  and (select count(*) from public.workout_start_activities sibling
    where sibling.author_id = activity.author_id and sibling.joint_workout_id = activity.joint_workout_id) = 1
  and exists (select 1 from public.joint_workout_participants member
    where member.joint_workout_id = activity.joint_workout_id and member.participant_id = activity.author_id
      and member.joined_at is not null and member.status in ('active', 'completed'));



create or replace function private.expire_joint_workout_invitations(actor uuid, workout_id_input uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_joint_workout_lifecycle();
  update public.joint_workout_participants participant
  set status = 'declined', finished_at = coalesce(participant.finished_at, statement_timestamp())
  where participant.status = 'invited'
    and participant.last_seen_at <= statement_timestamp() - interval '2 hours'
    and (
      participant.joint_workout_id = workout_id_input
      or (workout_id_input is null and exists (
        select 1 from public.joint_workout_participants membership
        where membership.joint_workout_id = participant.joint_workout_id
          and membership.participant_id = actor
      ))
    );

  update public.joint_workouts workout
  set completed_at = coalesce(workout.completed_at, statement_timestamp())
  where workout.completed_at is null
    and (
      workout.id = workout_id_input
      or (workout_id_input is null and exists (
        select 1 from public.joint_workout_participants membership
        where membership.joint_workout_id = workout.id
          and membership.participant_id = actor
      ))
    )
    and not exists (
      select 1 from public.joint_workout_participants participant
      where participant.joint_workout_id = workout.id
        and participant.status in ('active', 'invited')
    );
end;
$$;

create or replace function public.create_joint_workout(target uuid, suggested_routine_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); workout_id uuid;
begin
  perform private.lock_joint_workout_lifecycle();
  perform public.lock_pair(actor, target);
  if not private.is_current_joint_connection(actor, target) then raise exception 'joint workout connection unavailable'; end if;
  if not private.is_valid_recap_template_routine(suggested_routine_input) then raise exception 'invalid joint workout routine'; end if;
  insert into public.joint_workouts (initiator_id, suggested_routine) values (actor, suggested_routine_input) returning id into workout_id;
  insert into public.joint_workout_participants (joint_workout_id, participant_id, routine_snapshot, status, joined_at)
  values (workout_id, actor, suggested_routine_input, 'active', now()), (workout_id, target, null, 'invited', null);
  return workout_id;
end;
$$;

create or replace function public.add_joint_workout_participant(workout_id uuid, target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); owner uuid; participant_count integer;
begin
  perform private.lock_joint_workout_lifecycle();
  select initiator_id into owner from public.joint_workouts where id = workout_id and completed_at is null for update;
  if owner is null or owner <> actor then raise exception 'joint workout invite unavailable'; end if;
  if not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'active') then raise exception 'joint workout invite unavailable'; end if;
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
  if not exists (select 1 from private.active_workout_activity(actor)) then raise exception 'active workout required'; end if;

  select * into source_activity from private.active_workout_activity(actor);
  source_workout_id := source_activity.joint_workout_id;
  if source_workout_id is not null and source_workout_id <> workout_id then
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
    update public.workout_start_activities set closed_at = statement_timestamp()
    where author_id = actor and joint_workout_id = workout_id and closed_at is null;
    return;
  end if;
  if participant_status <> 'active' then raise exception 'joint workout participant unavailable'; end if;

  update public.joint_workout_participants
  set status = 'declined', finished_at = coalesce(finished_at, statement_timestamp()), last_seen_at = statement_timestamp()
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
end;
$$;

create or replace function public.finish_joint_workout(workout_id uuid, visibility_input public.joint_workout_visibility, completed_workout_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); remaining integer; affected integer; is_initiator boolean;
begin
  perform private.lock_joint_workout_lifecycle();
  if not private.is_valid_joint_completed_workout(completed_workout_input) then raise exception 'invalid joint completed workout'; end if;
  update public.joint_workout_participants set status = 'completed', visibility = visibility_input,
    completed_workout = completed_workout_input, finished_at = statement_timestamp(), last_seen_at = statement_timestamp()
  where joint_workout_id = workout_id and participant_id = actor and status = 'active';
  get diagnostics affected = row_count;
  if affected = 0 then
    if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'completed') then
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
  insert into public.joint_workout_posts (joint_workout_id) values (workout_id)
  on conflict (joint_workout_id) do update set last_activity_at = greatest(joint_workout_posts.last_activity_at, excluded.last_activity_at);
  select count(*) into remaining from public.joint_workout_participants where joint_workout_id = workout_id and status = 'active';
  if remaining = 0 then
    update public.joint_workout_participants set status = 'declined', finished_at = coalesce(finished_at, statement_timestamp()), last_seen_at = statement_timestamp()
    where joint_workout_id = workout_id and status = 'invited';
    update public.joint_workouts set completed_at = coalesce(completed_at, statement_timestamp()) where id = workout_id;
  end if;
  if exists (select 1 from public.community_activities where author_id = actor and kind in ('first_joint_workout', 'joint_workout_completed')) then
    perform private.publish_community_activity(actor, 'joint_workout_completed', format('joint-workout:%s', workout_id), '{}'::jsonb);
  else
    perform private.publish_community_activity(actor, 'first_joint_workout', 'first-joint-workout', '{}'::jsonb);
  end if;
end;
$$;

create or replace function public.touch_joint_workout_presence(workout_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  perform private.lock_joint_workout_lifecycle();
  update public.joint_workout_participants set last_seen_at = now()
  where joint_workout_id = workout_id and participant_id = actor and status = 'active';
  if not found then raise exception 'joint workout participant unavailable'; end if;
end;
$$;

create or replace function public.update_joint_workout_live_progress(
  workout_id uuid,
  state_input public.joint_workout_live_state,
  completed_exercises_input integer,
  total_exercises_input integer,
  completed_sets_input integer,
  total_sets_input integer,
  rest_seconds_input integer default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  perform private.lock_joint_workout_lifecycle();
  if completed_exercises_input < 0 or total_exercises_input < 0 or completed_exercises_input > total_exercises_input
    or completed_sets_input < 0 or total_sets_input < 0 or completed_sets_input > total_sets_input
    or total_exercises_input > 100 or total_sets_input > 1_000
    or (state_input = 'resting' and (rest_seconds_input is null or rest_seconds_input not between 1 and 3_600))
    or (state_input <> 'resting' and rest_seconds_input is not null) then
    raise exception 'invalid joint workout live progress';
  end if;

  update public.joint_workout_participants
  set live_state = state_input,
      completed_exercises = completed_exercises_input,
      total_exercises = total_exercises_input,
      completed_sets = completed_sets_input,
      total_sets = total_sets_input,
      rest_ends_at = case when state_input = 'resting' then now() + make_interval(secs => rest_seconds_input) else null end,
      live_updated_at = now(),
      last_seen_at = now()
  where joint_workout_id = workout_id and participant_id = actor and status = 'active';

  if not found then raise exception 'joint workout participant unavailable'; end if;
end;
$$;

create or replace function public.publish_workout_start_activity(input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  routine text;
  joint_id uuid;
  captured_attempt text;
begin
  perform private.lock_joint_workout_lifecycle();
  if input is null or jsonb_typeof(input) <> 'object'
    or not input ? 'routine_name'
    or exists (select 1 from jsonb_object_keys(input) key where key <> all(array['routine_name', 'joint_workout_id', 'attempt_id']))
    or jsonb_typeof(input -> 'routine_name') <> 'string' then
    raise exception 'invalid workout start activity';
  end if;

  captured_attempt := input ->> 'attempt_id';
  if captured_attempt is not null then
    if not exists (select 1 from public.training_states where owner_id = actor and active_workout_draft ->> 'attemptId' = captured_attempt) then
      raise exception 'active workout attempt unavailable';
    end if;
    -- A retry must never reopen a finished attempt or replace its canonical group.
    if exists (select 1 from public.workout_start_activities where author_id = actor and attempt_id = captured_attempt) then return; end if;
  end if;
  routine := btrim(input ->> 'routine_name');
  if char_length(routine) not between 1 and 120 then raise exception 'invalid workout start activity'; end if;
  if input ? 'joint_workout_id' then
    begin
      joint_id := (input ->> 'joint_workout_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid workout start activity';
    end;
    if not exists (
      select 1 from public.joint_workout_participants participant
      where participant.joint_workout_id = joint_id
        and participant.participant_id = actor
        and participant.status = 'active'
    ) then raise exception 'joint workout participant unavailable'; end if;
  end if;

  update public.workout_start_activities
  set closed_at = now()
  where author_id = actor and closed_at is null;

  insert into public.workout_start_activities (author_id, routine_name, joint_workout_id, expires_at, attempt_id)
  values (actor, routine, joint_id, now() + interval '2 hours', captured_attempt);
end;
$$;

create or replace function public.finalize_training_attempt(attempt_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  result jsonb;
  attempt_id_input text;
  mesocycle_id_value text;
  planned_count integer;
  completed_count integer;
  base_xp integer;
  bonus_xp integer;
  progress public.experience_progress%rowtype;
  xp_left integer;
  rank_before text;
  prior_receipt jsonb;
  next_receipt jsonb;
begin
  perform private.lock_joint_workout_lifecycle();
  result := public.finalize_training_attempt_without_mesocycle_xp(attempt_input);
  attempt_id_input := result -> 'attempt' ->> 'id';
  mesocycle_id_value := result -> 'attempt' -> 'lineage' ->> 'mesocycleId';
  if mesocycle_id_value is null then return result; end if;

  select count(*) into planned_count from public.reward_planned_session_ids(actor, mesocycle_id_value, null);
  select count(*) into completed_count
  from public.reward_attempts
  where owner_id = actor and mesocycle_id = mesocycle_id_value and adherence >= .7;
  if planned_count = 0 or completed_count < planned_count
    or exists (select 1 from public.experience_ledger_entries where owner_id = actor and idempotency_key = format('mesocycle:%s:xp-completion', mesocycle_id_value)) then
    return result;
  end if;

  select coalesce(sum(entry.amount), 0)::integer into base_xp
  from public.experience_ledger_entries entry
  join public.experience_attempts attempt on attempt.owner_id = entry.owner_id and attempt.attempt_id = entry.attempt_id
  join public.reward_attempts reward on reward.owner_id = attempt.owner_id and reward.attempt_id = attempt.attempt_id
  where entry.owner_id = actor
    and entry.kind <> 'mesocycle_completion'
    and reward.mesocycle_id = mesocycle_id_value
    and reward.adherence >= .7;
  bonus_xp := floor(base_xp * .25)::integer + 150;

  select * into progress from public.experience_progress where owner_id = actor for update;
  rank_before := public.experience_rank(progress.level);
  xp_left := bonus_xp;
  while xp_left > 0 loop
    if progress.xp_into_level + xp_left < public.experience_xp_for_level(progress.level) then
      progress.xp_into_level := progress.xp_into_level + xp_left;
      xp_left := 0;
    else
      xp_left := xp_left - (public.experience_xp_for_level(progress.level) - progress.xp_into_level);
      progress.xp_into_level := 0;
      progress.level := progress.level + 1;
    end if;
  end loop;
  insert into public.experience_ledger_entries(owner_id, idempotency_key, attempt_id, amount, kind, breakdown)
  values (actor, format('mesocycle:%s:xp-completion', mesocycle_id_value), attempt_id_input, bonus_xp, 'mesocycle_completion',
    jsonb_build_object('base_xp', base_xp, 'rate', .25, 'fixed_xp', 150));
  progress.total_xp := progress.total_xp + bonus_xp;
  update public.experience_progress set level = progress.level, xp_into_level = progress.xp_into_level, total_xp = progress.total_xp where owner_id = actor;
  if public.experience_rank(progress.level) is distinct from rank_before then
    insert into public.community_activities(author_id, kind, source_key, payload)
    values (actor, 'rank_up', format('rank-up:%s', public.experience_rank(progress.level)), jsonb_build_object('level', progress.level, 'rank', public.experience_rank(progress.level)))
    on conflict (author_id, source_key) do nothing;
  end if;

  prior_receipt := result -> 'experience_receipt';
  next_receipt := prior_receipt || jsonb_build_object(
    'earned_xp', coalesce((prior_receipt ->> 'earned_xp')::integer, 0) + bonus_xp,
    'entries', coalesce(prior_receipt -> 'entries', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'kind', 'mesocycle_completion', 'amount', bonus_xp,
      'breakdown', jsonb_build_object('base_xp', base_xp, 'rate', .25, 'fixed_xp', 150)
    )),
    'progress', public.experience_progress_payload(progress)
  );
  update public.experience_receipts set receipt = next_receipt where owner_id = actor and attempt_id = attempt_id_input;
  return result || jsonb_build_object('experience_receipt', next_receipt, 'experience_progress', next_receipt -> 'progress');
end;
$$;

create or replace function public.close_workout_start_activity()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_joint_workout_lifecycle();
  update public.workout_start_activities set closed_at = statement_timestamp()
  where author_id = public.require_actor() and closed_at is null;
end;
$$;

create or replace function public.resolve_joint_workout_attempt(attempt_id_input text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); result uuid;
begin
  perform private.lock_joint_workout_lifecycle();
  select joint_workout_id into result from public.workout_start_activities
  where author_id = actor and attempt_id = attempt_id_input;
  if found then return result; end if;
  -- Legacy fallback is exact captured identity, never the owner's latest group.
  select (attempt ->> 'jointWorkoutId')::uuid into result
  from public.training_states state cross join lateral jsonb_array_elements(state.attempts) attempt
  where state.owner_id = actor and attempt ->> 'id' = attempt_id_input;
  if result is not null and private.is_joint_workout_member(actor, result) then return result; end if;
  return null;
end;
$$;
revoke all on function public.resolve_joint_workout_attempt(text) from public, anon;
grant execute on function public.resolve_joint_workout_attempt(text) to authenticated;

create or replace function private.has_joined_joint_workout(viewer uuid, workout uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.joint_workout_participants
    where joint_workout_id = workout and participant_id = viewer and joined_at is not null)
$$;
revoke all on function private.has_joined_joint_workout(uuid, uuid) from public, anon, authenticated;


create or replace function private.can_view_joint_post(viewer uuid, workout uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_joined_joint_workout(viewer, workout)
    or exists (
      select 1
      from public.joint_workout_participants participant
      where participant.joint_workout_id = workout
        and participant.status = 'completed'
        and private.is_current_joint_connection(viewer, participant.participant_id)
    )
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
      'status', participant.status, 'visibility', participant.visibility,
      'relationship_kind', (select relationship.kind from public.relationships relationship where relationship.member_low = least(actor, participant.participant_id) and relationship.member_high = greatest(actor, participant.participant_id)),
      'workout', case when participant.status = 'completed' and (private.has_joined_joint_workout(actor, workout.id) or private.can_view_joint_participant(actor, participant.participant_id, participant.visibility)) then participant.completed_workout - 'sharePayload' else null end,
      'share_payload', case when participant.status = 'completed' and (private.has_joined_joint_workout(actor, workout.id) or private.can_view_joint_participant(actor, participant.participant_id, participant.visibility)) then participant.completed_workout -> 'sharePayload' else null end,
      'can_invite_bro', participant.participant_id <> actor and not private.is_current_joint_connection(actor, participant.participant_id)) order by participant.joined_at nulls last)
    from public.joint_workout_participants participant join public.profiles profile on profile.id = participant.participant_id
    where participant.joint_workout_id = workout.id
  )) into result
  from public.joint_workouts workout join public.joint_workout_posts post on post.joint_workout_id = workout.id
  where workout.id = workout_id;
  return result;
end;
$$;

create or replace function public.set_joint_participant_reaction(workout_id uuid, target_id uuid, reacted boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); target public.joint_workout_participants%rowtype; actor_alias text;
begin
  if reacted is null then raise exception 'invalid joint workout reaction'; end if;
  select * into target from public.joint_workout_participants
  where joint_workout_id = workout_id and participant_id = target_id and status = 'completed'
    and (private.has_joined_joint_workout(actor, workout_id) or private.can_view_joint_participant(actor, participant_id, visibility));
  if not found then raise exception 'joint workout unavailable'; end if;
  if reacted then
    insert into public.joint_workout_participant_reactions(joint_workout_id, participant_id, actor_id) values (workout_id, target_id, actor)
    on conflict do nothing;
    if found and target_id <> actor then
      select alias into actor_alias from public.profiles where id = actor;
      perform private.create_notification(target_id, 'joint_workout_reaction', 'Nueva estrella',
        coalesce(actor_alias, 'Un atleta') || ' dejó una estrella en tu entrenamiento.',
        jsonb_build_object('url', '/community/joint/' || workout_id, 'workout_id', workout_id, 'participant_id', target_id),
        'joint-workout-reaction:' || workout_id || ':' || target_id || ':' || actor);
    end if;
  else
    delete from public.joint_workout_participant_reactions where joint_workout_id = workout_id and participant_id = target_id and actor_id = actor;
  end if;
  return jsonb_build_object('reacted', reacted, 'reaction_count', (select count(*) from public.joint_workout_participant_reactions where joint_workout_id = workout_id and participant_id = target_id));
end;
$$;

create or replace function public.get_joint_participant_reaction_states(workout_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_object_agg(participant.participant_id, jsonb_build_object(
    'reaction_count', (select count(*) from public.joint_workout_participant_reactions reaction where reaction.joint_workout_id = participant.joint_workout_id and reaction.participant_id = participant.participant_id),
    'comment_count', (select count(*) from public.joint_workout_participant_comments comment where comment.joint_workout_id = participant.joint_workout_id and comment.participant_id = participant.participant_id),
    'viewer_has_reacted', exists (select 1 from public.joint_workout_participant_reactions reaction where reaction.joint_workout_id = participant.joint_workout_id and reaction.participant_id = participant.participant_id and reaction.actor_id = actor)
  )) from public.joint_workout_participants participant where participant.joint_workout_id = workout_id and participant.status = 'completed' and (private.has_joined_joint_workout(actor, workout_id) or private.can_view_joint_participant(actor, participant.participant_id, participant.visibility))), '{}'::jsonb);
end;
$$;

create or replace function public.list_joint_participant_comments(workout_id uuid, target_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  if not exists (
    select 1
    from public.joint_workout_participants participant
    where participant.joint_workout_id = workout_id
      and participant.participant_id = target_id
      and participant.status = 'completed'
      and (private.has_joined_joint_workout(actor, workout_id) or private.can_view_joint_participant(actor, participant.participant_id, participant.visibility))
  ) then
    raise exception 'joint workout unavailable';
  end if;

  return coalesce((
    select jsonb_agg(private.joint_workout_participant_comment_projection(comment_row) order by comment_row.created_at, comment_row.id)
    from (
      select *
      from public.joint_workout_participant_comments
      where joint_workout_id = workout_id and participant_id = target_id
      order by created_at desc, id desc
      limit 50
    ) comment_row
  ), '[]'::jsonb);
end;
$$;

create or replace function public.create_joint_participant_comment(workout_id uuid, target_id uuid, body_input text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  target public.joint_workout_participants%rowtype;
  body_value text := btrim(body_input);
  comment public.joint_workout_participant_comments%rowtype;
  actor_alias text;
begin
  if char_length(body_value) not between 1 and 500 then raise exception 'invalid joint participant comment'; end if;

  select * into target
  from public.joint_workout_participants
  where joint_workout_id = workout_id
    and participant_id = target_id
    and status = 'completed'
    and (private.has_joined_joint_workout(actor, workout_id) or private.can_view_joint_participant(actor, participant_id, visibility));

  if not found then raise exception 'joint workout unavailable'; end if;

  insert into public.joint_workout_participant_comments (joint_workout_id, participant_id, author_id, body)
  values (workout_id, target_id, actor, body_value)
  returning * into comment;

  if target_id <> actor then
    select alias into actor_alias from public.profiles where id = actor;
    perform private.create_notification(
      target_id,
      'joint_workout_comment',
      'Nuevo comentario',
      coalesce(actor_alias, 'Un atleta') || ' comentó tu entrenamiento conjunto.',
      jsonb_build_object('url', '/community/joint/' || workout_id, 'workout_id', workout_id, 'participant_id', target_id),
      'joint-workout-comment:' || comment.id
    );
  end if;

  return private.joint_workout_participant_comment_projection(comment);
end;
$$;

-- Realtime exposes only an opaque identity, including terminal updates; RPCs
-- remain active-only and project the authorized payload.
grant select (id) on public.workout_start_activities to authenticated;
drop policy workout_start_activities_realtime_read on public.workout_start_activities;
create policy workout_start_activities_realtime_read on public.workout_start_activities
for select to authenticated using (private.can_view_workout_start_activity(auth.uid(), author_id));

-- Resolve and mutate under the same lock: no merge/account switch can interleave.
create or replace function public.finish_joint_workout_attempt(owner_input uuid, attempt_id_input text, captured_workout_id uuid, visibility_input public.joint_workout_visibility, completed_workout_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare canonical uuid;
begin
  perform private.lock_joint_workout_lifecycle();
  if public.require_actor() <> owner_input or owner_input is null then raise exception 'joint workout owner mismatch'; end if;
  canonical := public.resolve_joint_workout_attempt(attempt_id_input);
  perform public.finish_joint_workout(coalesce(canonical, captured_workout_id), visibility_input, completed_workout_input);
end;
$$;
create or replace function public.leave_joint_workout_attempt(owner_input uuid, attempt_id_input text, captured_workout_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare canonical uuid;
begin
  perform private.lock_joint_workout_lifecycle();
  if public.require_actor() <> owner_input or owner_input is null then raise exception 'joint workout owner mismatch'; end if;
  canonical := public.resolve_joint_workout_attempt(attempt_id_input);
  perform public.leave_joint_workout(coalesce(canonical, captured_workout_id));
end;
$$;
revoke all on function public.finish_joint_workout_attempt(uuid,text,uuid,public.joint_workout_visibility,jsonb), public.leave_joint_workout_attempt(uuid,text,uuid) from public, anon;
grant execute on function public.finish_joint_workout_attempt(uuid,text,uuid,public.joint_workout_visibility,jsonb), public.leave_joint_workout_attempt(uuid,text,uuid) to authenticated;
