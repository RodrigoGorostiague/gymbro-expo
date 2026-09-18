-- Additive routine prescriptions: time, bodyweight without weighing, added load and distinct drop blocks.
-- Match the existing mobile recap/joint template contract without accepting arbitrary fields.
create or replace function private.is_valid_recap_template_routine(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare exercise jsonb; set_value jsonb; muscle jsonb;
begin
  if jsonb_typeof(value) <> 'object' or not value ?& array['name', 'muscleGroups', 'exercises']
    or exists (select 1 from jsonb_object_keys(value) key where key <> all(array['name', 'muscleGroups', 'exercises']))
    or jsonb_typeof(value -> 'name') <> 'string' or char_length(btrim(value ->> 'name')) not between 1 and 120
    or jsonb_typeof(value -> 'muscleGroups') <> 'array' or jsonb_array_length(value -> 'muscleGroups') not between 1 and 32
    or jsonb_typeof(value -> 'exercises') <> 'array' or jsonb_array_length(value -> 'exercises') not between 1 and 100 then return false; end if;
  for muscle in select item.element from jsonb_array_elements(value -> 'muscleGroups') as item(element) loop if jsonb_typeof(muscle) <> 'string' or char_length(btrim(muscle #>> '{}')) not between 1 and 120 then return false; end if; end loop;
  for exercise in select item.element from jsonb_array_elements(value -> 'exercises') as item(element) loop
    if jsonb_typeof(exercise) <> 'object' or not exercise ?& array['name', 'muscleGroups', 'loadMode', 'loadUnit', 'variant', 'sets']
      or exists (select 1 from jsonb_object_keys(exercise) key where key <> all(array['name', 'muscleGroups', 'loadMode', 'loadUnit', 'variant', 'sets']))
      or jsonb_typeof(exercise -> 'name') <> 'string' or char_length(btrim(exercise ->> 'name')) not between 1 and 120
      or jsonb_typeof(exercise -> 'muscleGroups') <> 'array' or jsonb_array_length(exercise -> 'muscleGroups') not between 1 and 32
      or exercise ->> 'loadMode' not in ('external-load', 'bodyweight', 'assisted') or exercise ->> 'loadUnit' not in ('kg', 'lb')
      or jsonb_typeof(exercise -> 'variant') <> 'string' or char_length(btrim(exercise ->> 'variant')) not between 1 and 120
      or jsonb_typeof(exercise -> 'sets') <> 'array' or jsonb_array_length(exercise -> 'sets') not between 1 and 100 then return false; end if;
    for muscle in select item.element from jsonb_array_elements(exercise -> 'muscleGroups') as item(element) loop if jsonb_typeof(muscle) <> 'string' or char_length(btrim(muscle #>> '{}')) not between 1 and 120 then return false; end if; end loop;
    for set_value in select item.element from jsonb_array_elements(exercise -> 'sets') as item(element) loop
      if jsonb_typeof(set_value) <> 'object' or not set_value ?& array['tipo', 'weight', 'reps']
        or exists (select 1 from jsonb_object_keys(set_value) key where key <> all(array['tipo', 'weight', 'reps', 'effortTarget', 'backoffGroup', 'dropGroup', 'durationSeconds', 'loadBasis']))
        or (jsonb_typeof(set_value -> 'tipo') <> 'number' and set_value ->> 'tipo' not in ('C', 'F'))
        or (jsonb_typeof(set_value -> 'tipo') = 'number' and ((set_value ->> 'tipo')::numeric <> trunc((set_value ->> 'tipo')::numeric) or (set_value ->> 'tipo')::numeric not between 0 and 100))
        or jsonb_typeof(set_value -> 'weight') <> 'number' or (set_value ->> 'weight')::numeric not between 0 and 10000
        or jsonb_typeof(set_value -> 'reps') <> 'number' or (set_value ->> 'reps')::numeric <> trunc((set_value ->> 'reps')::numeric) or (set_value ->> 'reps')::numeric not between 0 and 1000 then return false; end if;
      if set_value ? 'durationSeconds' and (jsonb_typeof(set_value -> 'durationSeconds') <> 'number' or (set_value ->> 'durationSeconds')::numeric not between 1 and 86400 or (set_value ->> 'durationSeconds')::numeric <> trunc((set_value ->> 'durationSeconds')::numeric) or (set_value ->> 'reps')::numeric <> 0) then return false; end if;
      if set_value ? 'loadBasis' and (jsonb_typeof(set_value -> 'loadBasis') <> 'string' or set_value ->> 'loadBasis' not in ('external', 'bodyweight', 'added', 'assisted')) then return false; end if;
      if set_value ? 'dropGroup' and (set_value ? 'backoffGroup' or jsonb_typeof(set_value -> 'dropGroup') <> 'number' or (set_value ->> 'dropGroup')::numeric not between 0 and 99 or (set_value ->> 'dropGroup')::numeric <> trunc((set_value ->> 'dropGroup')::numeric)) then return false; end if;
      if set_value ? 'effortTarget' then
        if jsonb_typeof(set_value -> 'effortTarget') is distinct from 'object' then return false; end if;
        if not (set_value -> 'effortTarget') ?& array['kind', 'value']
          or exists (select 1 from jsonb_object_keys(set_value -> 'effortTarget') key where key <> all(array['kind', 'value']))
          or jsonb_typeof(set_value -> 'effortTarget' -> 'value') is distinct from 'number'
          or (set_value -> 'effortTarget' ->> 'kind') is null
          or (set_value -> 'effortTarget' ->> 'kind') not in ('rir', 'rpe') then return false; end if;
        if (set_value -> 'effortTarget' ->> 'value')::numeric <> trunc((set_value -> 'effortTarget' ->> 'value')::numeric)
          or ((set_value -> 'effortTarget' ->> 'kind') = 'rir' and (set_value -> 'effortTarget' ->> 'value')::numeric not between 0 and 5)
          or ((set_value -> 'effortTarget' ->> 'kind') = 'rpe' and (set_value -> 'effortTarget' ->> 'value')::numeric not between 6 and 10) then return false; end if;
      end if;
      if set_value ? 'backoffGroup' then
        if jsonb_typeof(set_value -> 'backoffGroup') is distinct from 'number' then return false; end if;
        if (set_value ->> 'backoffGroup')::numeric <> trunc((set_value ->> 'backoffGroup')::numeric)
          or (set_value ->> 'backoffGroup')::numeric not between 0 and 99 then return false; end if;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

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
      for set_value in select value from jsonb_array_elements(performance -> 'sets') loop if jsonb_typeof(set_value) <> 'object' or not set_value ?& array['weight', 'reps', 'completed'] or exists (select 1 from jsonb_object_keys(set_value) key where key <> all(array['weight', 'reps', 'completed', 'actualEffort', 'durationSeconds'])) or jsonb_typeof(set_value -> 'weight') <> 'number' or (set_value ->> 'weight')::numeric not between 0 and 10000 or jsonb_typeof(set_value -> 'reps') <> 'number' or (set_value ->> 'reps')::numeric <> trunc((set_value ->> 'reps')::numeric) or (set_value ->> 'reps')::numeric not between 0 and 1000 or jsonb_typeof(set_value -> 'completed') <> 'boolean' or (set_value ? 'durationSeconds' and (jsonb_typeof(set_value -> 'durationSeconds') <> 'number' or (set_value ->> 'durationSeconds')::numeric not between 0 and 86400 or (set_value ->> 'durationSeconds')::numeric <> trunc((set_value ->> 'durationSeconds')::numeric) or (set_value ->> 'reps')::numeric <> 0)) or (set_value ? 'actualEffort' and ((set_value -> 'completed') is distinct from 'true'::jsonb or not private.is_valid_actual_effort(set_value -> 'actualEffort'))) then return false; end if; end loop;
    end loop;
  end if;
  return true;
end;
$$;

create or replace function public.reward_valid_sets(attempt jsonb)
returns integer language sql immutable set search_path = '' as $$
  select count(*)::integer from (
    select set_item.value -> 'plan' ->> 'id' as set_id,
      set_item.value -> 'result' as result
    from jsonb_array_elements(attempt -> 'exercises') exercise(value)
    cross join lateral jsonb_array_elements(exercise.value -> 'sets') set_item(value)
  ) sets
  where result ->> 'performed' = 'true'
    and jsonb_typeof(result -> 'performance') = 'object'
    and (
      (not (result -> 'performance') ? 'durationSeconds' and coalesce((result -> 'performance' ->> 'reps') ~ '^[1-9][0-9]*$', false))
      or (jsonb_typeof(result -> 'performance' -> 'durationSeconds') = 'number'
        and coalesce((result -> 'performance' ->> 'durationSeconds') ~ '^[1-9][0-9]*$', false)
        and (result -> 'performance' ->> 'durationSeconds')::numeric <= 86400
        and result -> 'performance' ->> 'reps' = '0')
    )
    and result -> 'performance' ->> 'unit' in ('kg', 'lb')
    and (
      (result -> 'performance' ->> 'mode' = 'external-load' and coalesce((result -> 'performance' ->> 'load') ~ '^[0-9]+(\.[0-9]+)?$', false))
      or (result -> 'performance' ->> 'mode' = 'bodyweight' and coalesce((result -> 'performance' ->> 'bodyweight') ~ '^[0-9]+(\.[0-9]+)?$', false) and ((result -> 'performance' ->> 'bodyweight')::numeric > 0 or (result -> 'performance' ->> 'bodyweight' = '0' and result -> 'performance' -> 'bodyweightUnspecified' = 'true'::jsonb)))
      or (result -> 'performance' ->> 'mode' = 'assisted' and coalesce((result -> 'performance' ->> 'assistance') ~ '^[0-9]+(\.[0-9]+)?$', false))
    )
$$;

-- Contextual record gems are new-finalization-only; existing XP rules are unchanged.
create or replace function private.contextual_record_scores(attempt jsonb)
returns table(exercise_id text, variant text, unit text, record_type text, partition_value numeric, score numeric)
language sql immutable set search_path = '' as $$
  with raw as (
    select e->>'exerciseId' exercise_id, e->>'variant' variant, s,
      s->'result'->'performance' p, count(*) over(partition by s->'plan'->>'id') identities
    from jsonb_array_elements(attempt->'exercises') e
    cross join lateral jsonb_array_elements(e->'sets') s
  ), eligible as (
    select exercise_id, variant, p->>'unit' unit,
      case when jsonb_typeof(p->'load')='number' then (p->>'load')::numeric end load,
      case when jsonb_typeof(p->'reps')='number' then (p->>'reps')::numeric end reps
    from raw where identities=1 and public.training_state_nonempty_text(to_jsonb(exercise_id))
      and public.training_state_nonempty_text(to_jsonb(variant))
      and s->'plan'->>'type' is distinct from 'C'
      and s->'result'->>'performed'='true'
      and s->'result'->>'setId'=s->'plan'->>'id'
      and p->>'mode'='external-load' and not (p ? 'durationSeconds') and coalesce(p->>'bodyweightIncluded','false') <> 'true' and p->>'unit' in ('kg','lb')
  ), valid as (select * from eligible where load>=0 and reps>0 and trunc(reps)=reps)
  select exercise_id,variant,unit,'load',reps,max(load) from valid group by exercise_id,variant,unit,reps
  union all
  select exercise_id,variant,unit,'reps',load,max(reps) from valid group by exercise_id,variant,unit,load
  union all
  select exercise_id,variant,unit,'volume',0,sum(load*reps) from valid group by exercise_id,variant,unit
$$;

-- Retain the publication-review gate; extend only its existing private implementation.
create or replace function public.create_workout_recap_before_review(input jsonb)
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
            or exists (select 1 from jsonb_object_keys(set_value.value) key where key <> all(array['weight', 'reps', 'completed', 'actualEffort', 'durationSeconds']))
            or jsonb_typeof(set_value.value -> 'weight') <> 'number' or (set_value.value ->> 'weight')::numeric not between 0 and 10000
            or jsonb_typeof(set_value.value -> 'reps') <> 'number' or (set_value.value ->> 'reps')::numeric <> trunc((set_value.value ->> 'reps')::numeric) or (set_value.value ->> 'reps')::numeric not between 0 and 1000
            or jsonb_typeof(set_value.value -> 'completed') <> 'boolean' or (set_value.value ? 'durationSeconds' and (jsonb_typeof(set_value.value -> 'durationSeconds') <> 'number' or (set_value.value ->> 'durationSeconds')::numeric not between 0 and 86400 or (set_value.value ->> 'durationSeconds')::numeric <> trunc((set_value.value ->> 'durationSeconds')::numeric) or (set_value.value ->> 'reps')::numeric <> 0)) or (set_value.value ? 'actualEffort' and ((set_value.value -> 'completed') is distinct from 'true'::jsonb or not private.is_valid_actual_effort(set_value.value -> 'actualEffort'))))) then
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
        or exists (select 1 from jsonb_object_keys(set_value) key where key <> all(array['weight', 'reps', 'completed', 'actualEffort', 'durationSeconds']))
        or jsonb_typeof(set_value -> 'weight') <> 'number' or (set_value ->> 'weight')::numeric not between 0 and 10000
        or jsonb_typeof(set_value -> 'reps') <> 'number' or (set_value ->> 'reps')::numeric <> trunc((set_value ->> 'reps')::numeric) or (set_value ->> 'reps')::integer not between 0 and 1000
        or jsonb_typeof(set_value -> 'completed') <> 'boolean'
        or (set_value ? 'durationSeconds' and (jsonb_typeof(set_value -> 'durationSeconds') <> 'number' or (set_value ->> 'durationSeconds')::numeric not between 0 and 86400 or (set_value ->> 'durationSeconds')::numeric <> trunc((set_value ->> 'durationSeconds')::numeric) or (set_value ->> 'reps')::numeric <> 0)) or (set_value ? 'actualEffort' and (
          (set_value -> 'completed') is distinct from 'true'::jsonb
          or not private.is_valid_actual_effort(set_value -> 'actualEffort')
        )) then return false; end if;
    end loop;
  end loop;
  return true;
end;
$function$;
