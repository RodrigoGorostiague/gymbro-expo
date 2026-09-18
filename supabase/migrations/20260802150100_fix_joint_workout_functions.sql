-- Repair functions applied by the initial joint-workout migration.
create or replace function private.is_valid_joint_completed_workout(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare exercise jsonb; set_value jsonb; muscle jsonb;
begin
  if jsonb_typeof(value) <> 'object' or not value ?& array['routineName', 'durationSeconds', 'exercises']
    or exists (select 1 from jsonb_object_keys(value) key where key <> all(array['routineName', 'durationSeconds', 'exercises']))
    or jsonb_typeof(value -> 'routineName') <> 'string' or char_length(btrim(value ->> 'routineName')) not between 1 and 120
    or jsonb_typeof(value -> 'durationSeconds') <> 'number' or (value ->> 'durationSeconds')::numeric <> trunc((value ->> 'durationSeconds')::numeric) or (value ->> 'durationSeconds')::integer not between 0 and 18000
    or jsonb_typeof(value -> 'exercises') <> 'array' or jsonb_array_length(value -> 'exercises') > 100 then return false; end if;
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

create or replace function public.respond_joint_workout_invite(workout_id uuid, accepted boolean, routine_input jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); owner uuid;
begin
  select initiator_id into owner from public.joint_workouts where id = workout_id and completed_at is null for update;
  if owner is null then raise exception 'joint workout unavailable'; end if;
  if not private.is_current_joint_connection(actor, owner) then raise exception 'joint workout connection unavailable'; end if;
  if accepted and not private.is_valid_recap_template_routine(routine_input) then raise exception 'invalid joint workout routine'; end if;
  update public.joint_workout_participants
  set status = case when accepted then 'active'::public.joint_workout_participant_status else 'declined'::public.joint_workout_participant_status end,
      routine_snapshot = case when accepted then routine_input else null end,
      joined_at = case when accepted then now() else null end, last_seen_at = now()
  where joint_workout_id = workout_id and participant_id = actor and status = 'invited';
  if not found then raise exception 'joint workout invite unavailable'; end if;
end;
$$;
