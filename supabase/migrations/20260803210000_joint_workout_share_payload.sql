-- Keep the immutable import payload with the completed joint workout, while preserving
-- the existing server-owned participant visibility policy for both the workout and payload.
create or replace function private.is_valid_joint_completed_workout(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare exercise jsonb; set_value jsonb; muscle jsonb;
begin
  if jsonb_typeof(value) <> 'object' or not value ?& array['routineName', 'durationSeconds', 'exercises']
    or exists (select 1 from jsonb_object_keys(value) key where key <> all(array['routineName', 'durationSeconds', 'exercises', 'sharePayload']))
    or jsonb_typeof(value -> 'routineName') <> 'string' or char_length(btrim(value ->> 'routineName')) not between 1 and 120
    or jsonb_typeof(value -> 'durationSeconds') <> 'number' or (value ->> 'durationSeconds')::numeric <> trunc((value ->> 'durationSeconds')::numeric) or (value ->> 'durationSeconds')::integer not between 0 and 18000
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

create or replace function public.get_joint_workout_detail(workout_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); result jsonb;
begin
  if not exists (select 1 from public.joint_workout_posts where joint_workout_id = workout_id) or not private.can_view_joint_post(actor, workout_id) then raise exception 'joint workout unavailable'; end if;
  select jsonb_build_object('id', workout.id, 'initiator_id', workout.initiator_id,
    'suggested_routine', case when workout.initiator_id = actor then workout.suggested_routine else null end,
    'created_at', post.created_at, 'completed_at', workout.completed_at, 'participants', (
    select jsonb_agg(jsonb_build_object('id', p.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id, 'presentation_theme_id', profile.presentation_theme_id, 'status', p.status, 'visibility', p.visibility,
      'relationship_kind', (select r.kind from public.relationships r where r.member_low = least(actor, p.participant_id) and r.member_high = greatest(actor, p.participant_id)),
      'workout', case when p.status = 'completed' and private.can_view_joint_participant(actor, p.participant_id, p.visibility) then p.completed_workout - 'sharePayload' else null end,
      'share_payload', case when p.status = 'completed' and private.can_view_joint_participant(actor, p.participant_id, p.visibility) then p.completed_workout -> 'sharePayload' else null end,
      'can_invite_bro', p.participant_id <> actor and not private.is_current_joint_connection(actor, p.participant_id)) order by p.joined_at nulls last)
    from public.joint_workout_participants p join public.profiles profile on profile.id = p.participant_id where p.joint_workout_id = workout.id
  )) into result from public.joint_workouts workout join public.joint_workout_posts post on post.joint_workout_id = workout.id where workout.id = workout_id;
  return result;
end;
$$;
