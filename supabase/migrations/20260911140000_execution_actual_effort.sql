-- Actual effort is execution-only. Templates retain their existing allowlist.
create or replace function private.is_valid_actual_effort(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(value) is distinct from 'object' then return false; end if;
  if not value ?& array['kind', 'value']
    or exists (select 1 from jsonb_object_keys(value) key where key <> all(array['kind', 'value']))
    or jsonb_typeof(value -> 'value') is distinct from 'number' then return false; end if;
  return coalesce((value ->> 'value')::numeric = trunc((value ->> 'value')::numeric)
    and ((value ->> 'kind' = 'rir' and (value ->> 'value')::numeric between 0 and 5)
      or (value ->> 'kind' = 'rpe' and (value ->> 'value')::numeric between 6 and 10)), false);
end;
$$;
revoke all on function private.is_valid_actual_effort(jsonb) from public, anon, authenticated;

create or replace function private.is_valid_recap_share_payload(payload jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare week jsonb; entry jsonb; routine jsonb; performance jsonb; set_value jsonb;
begin
  if jsonb_typeof(payload) <> 'object' or jsonb_typeof(payload -> 'version') <> 'number' or payload ->> 'version' <> '1'
    or exists (select 1 from jsonb_object_keys(payload) key where key <> all(array['version', 'routine', 'mesocycle', 'performedSets']))
    or (payload ? 'routine' and not private.is_valid_recap_template_routine(payload -> 'routine')) then return false; end if;
  if payload ? 'mesocycle' then
    if not payload ? 'routine' or jsonb_typeof(payload -> 'mesocycle') <> 'object' or not payload -> 'mesocycle' ?& array['name', 'goal', 'durationWeeks', 'weeks', 'routines']
      or exists (select 1 from jsonb_object_keys(payload -> 'mesocycle') key where key <> all(array['name', 'goal', 'durationWeeks', 'weeks', 'routines']))
      or jsonb_typeof(payload -> 'mesocycle' -> 'name') <> 'string' or char_length(btrim(payload -> 'mesocycle' ->> 'name')) not between 1 and 120
      or jsonb_typeof(payload -> 'mesocycle' -> 'goal') <> 'string' or char_length(btrim(payload -> 'mesocycle' ->> 'goal')) > 500
      or jsonb_typeof(payload -> 'mesocycle' -> 'durationWeeks') <> 'number' or (payload -> 'mesocycle' ->> 'durationWeeks')::numeric <> trunc((payload -> 'mesocycle' ->> 'durationWeeks')::numeric) or (payload -> 'mesocycle' ->> 'durationWeeks')::numeric not between 1 and 52
      or jsonb_typeof(payload -> 'mesocycle' -> 'weeks') <> 'array' or jsonb_array_length(payload -> 'mesocycle' -> 'weeks') not between 1 and 52
      or jsonb_typeof(payload -> 'mesocycle' -> 'routines') <> 'array' or jsonb_array_length(payload -> 'mesocycle' -> 'routines') not between 1 and 100 then return false; end if;
    for routine in select value from jsonb_array_elements(payload -> 'mesocycle' -> 'routines') loop if not private.is_valid_recap_template_routine(routine) then return false; end if; end loop;
    for week in select value from jsonb_array_elements(payload -> 'mesocycle' -> 'weeks') loop
      if jsonb_typeof(week) <> 'array' or jsonb_array_length(week) > 7 then return false; end if;
      for entry in select value from jsonb_array_elements(week) loop if entry <> 'null'::jsonb and (jsonb_typeof(entry) <> 'object' or not entry ? 'routineIndex' or exists (select 1 from jsonb_object_keys(entry) key where key <> all(array['routineIndex', 'dayLabel'])) or jsonb_typeof(entry -> 'routineIndex') <> 'number' or (entry ->> 'routineIndex')::numeric <> trunc((entry ->> 'routineIndex')::numeric) or (entry ->> 'routineIndex')::numeric < 0 or (entry ->> 'routineIndex')::integer >= jsonb_array_length(payload -> 'mesocycle' -> 'routines') or (entry ? 'dayLabel' and (jsonb_typeof(entry -> 'dayLabel') <> 'string' or char_length(entry ->> 'dayLabel') > 120))) then return false; end if; end loop;
    end loop;
  end if;
  if payload ? 'performedSets' then
    if jsonb_typeof(payload -> 'performedSets') <> 'array' or jsonb_array_length(payload -> 'performedSets') > 100 then return false; end if;
    for performance in select value from jsonb_array_elements(payload -> 'performedSets') loop
      if jsonb_typeof(performance) <> 'object' or not performance ?& array['exerciseIndex', 'sets'] or exists (select 1 from jsonb_object_keys(performance) key where key <> all(array['exerciseIndex', 'sets'])) or jsonb_typeof(performance -> 'exerciseIndex') <> 'number' or (performance ->> 'exerciseIndex')::numeric <> trunc((performance ->> 'exerciseIndex')::numeric) or (performance ->> 'exerciseIndex')::numeric not between 0 and 99 or jsonb_typeof(performance -> 'sets') <> 'array' or jsonb_array_length(performance -> 'sets') > 100 then return false; end if;
      for set_value in select value from jsonb_array_elements(performance -> 'sets') loop if jsonb_typeof(set_value) <> 'object' or not set_value ?& array['weight', 'reps', 'completed'] or exists (select 1 from jsonb_object_keys(set_value) key where key <> all(array['weight', 'reps', 'completed', 'actualEffort'])) or jsonb_typeof(set_value -> 'weight') <> 'number' or (set_value ->> 'weight')::numeric not between 0 and 10000 or jsonb_typeof(set_value -> 'reps') <> 'number' or (set_value ->> 'reps')::numeric <> trunc((set_value ->> 'reps')::numeric) or (set_value ->> 'reps')::numeric not between 0 and 1000 or jsonb_typeof(set_value -> 'completed') <> 'boolean' or (set_value ? 'actualEffort' and ((set_value -> 'completed') is distinct from 'true'::jsonb or not private.is_valid_actual_effort(set_value -> 'actualEffort'))) then return false; end if; end loop;
    end loop;
  end if;
  return true;
end;
$$;

create or replace function public.create_workout_recap(input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor(); recap_id uuid; requested_publication_key text;
  details jsonb; payload jsonb;
  allowed_keys text[] := array['routine_name', 'completed_at', 'duration_seconds', 'exercise_count', 'metrics', 'caption', 'publication_key', 'exercise_details', 'share_payload'];
begin
  details := input -> 'exercise_details'; payload := input -> 'share_payload';
  if input is null or jsonb_typeof(input) <> 'object'
    or not input ?& array['routine_name', 'completed_at', 'duration_seconds', 'exercise_count', 'metrics', 'publication_key', 'exercise_details']
    or exists (select 1 from jsonb_object_keys(input) key where key <> all(allowed_keys))
    or jsonb_typeof(input -> 'metrics') <> 'object'
    or exists (select 1 from jsonb_each(input -> 'metrics') metric where jsonb_typeof(metric.value) <> 'number')
    or jsonb_typeof(details) <> 'object' or not details ? 'exercises'
    or exists (select 1 from jsonb_object_keys(details) key where key <> 'exercises')
    or jsonb_typeof(details -> 'exercises') <> 'array' or jsonb_array_length(details -> 'exercises') > 100
    or (input ->> 'exercise_count')::integer <> jsonb_array_length(details -> 'exercises')
    or exists (select 1 from jsonb_array_elements(details -> 'exercises') exercise(value)
      where jsonb_typeof(exercise.value) <> 'object'
        or not exercise.value ?& array['name', 'muscle_group_ids', 'sets']
        or exists (select 1 from jsonb_object_keys(exercise.value) key where key <> all(array['name', 'muscle_group_ids', 'sets']))
        or jsonb_typeof(exercise.value -> 'name') <> 'string' or char_length(exercise.value ->> 'name') not between 1 and 120
        or jsonb_typeof(exercise.value -> 'muscle_group_ids') <> 'array' or jsonb_array_length(exercise.value -> 'muscle_group_ids') > 32
        or jsonb_typeof(exercise.value -> 'sets') <> 'array' or jsonb_array_length(exercise.value -> 'sets') > 100
        or exists (select 1 from jsonb_array_elements(exercise.value -> 'sets') set_value(value)
          where jsonb_typeof(set_value.value) <> 'object' or not set_value.value ?& array['weight', 'reps', 'completed']
            or exists (select 1 from jsonb_object_keys(set_value.value) key where key <> all(array['weight', 'reps', 'completed', 'actualEffort']))
            or jsonb_typeof(set_value.value -> 'weight') <> 'number' or (set_value.value ->> 'weight')::numeric not between 0 and 10000
            or jsonb_typeof(set_value.value -> 'reps') <> 'number' or (set_value.value ->> 'reps')::numeric <> trunc((set_value.value ->> 'reps')::numeric) or (set_value.value ->> 'reps')::numeric not between 0 and 1000
            or jsonb_typeof(set_value.value -> 'completed') <> 'boolean' or (set_value.value ? 'actualEffort' and ((set_value.value -> 'completed') is distinct from 'true'::jsonb or not private.is_valid_actual_effort(set_value.value -> 'actualEffort'))))) then
    raise exception 'invalid recap input';
  end if;
  if payload is not null and not private.is_valid_recap_share_payload(payload) then raise exception 'invalid recap share payload'; end if;
  requested_publication_key := input ->> 'publication_key';
  if requested_publication_key is null or char_length(requested_publication_key) not between 1 and 120 then raise exception 'invalid recap input'; end if;
  select id into recap_id from public.workout_recaps where author_id = actor and publication_key = requested_publication_key;
  if recap_id is not null then return recap_id; end if;
  insert into public.workout_recaps (author_id, routine_name, completed_at, duration_seconds, exercise_count, metrics, caption, publication_key, exercise_details, share_payload)
  values (actor, input ->> 'routine_name', (input ->> 'completed_at')::timestamptz, (input ->> 'duration_seconds')::integer, (input ->> 'exercise_count')::integer, input -> 'metrics', nullif(input ->> 'caption', ''), requested_publication_key, details, payload)
  returning id into recap_id;
  return recap_id;
exception when unique_violation then
  select id into recap_id from public.workout_recaps where author_id = actor and publication_key = requested_publication_key;
  return recap_id;
when invalid_text_representation or numeric_value_out_of_range then raise exception 'invalid recap input';
end;
$$;

-- Joint execution sets use the same actual-effort validation as individual recaps.
CREATE OR REPLACE FUNCTION private.is_valid_joint_completed_workout(value jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
        or exists (select 1 from jsonb_object_keys(set_value) key where key <> all(array['weight', 'reps', 'completed', 'actualEffort']))
        or jsonb_typeof(set_value -> 'weight') <> 'number' or (set_value ->> 'weight')::numeric not between 0 and 10000
        or jsonb_typeof(set_value -> 'reps') <> 'number' or (set_value ->> 'reps')::numeric <> trunc((set_value ->> 'reps')::numeric) or (set_value ->> 'reps')::integer not between 0 and 1000
        or jsonb_typeof(set_value -> 'completed') <> 'boolean'
        or (set_value ? 'actualEffort' and (
          (set_value -> 'completed') is distinct from 'true'::jsonb
          or not private.is_valid_actual_effort(set_value -> 'actualEffort')
        )) then return false; end if;
    end loop;
  end loop;
  return true;
end;
$function$;

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

notify pgrst, 'reload schema';
