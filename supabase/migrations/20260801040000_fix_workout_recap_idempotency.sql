-- Preserve summary-only retry compatibility while validating any supplied share payload.
create or replace function public.create_workout_recap(input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor(); recap_id uuid; requested_publication_key text;
  details jsonb; payload jsonb;
  allowed_keys text[] := array['routine_name', 'completed_at', 'duration_seconds', 'exercise_count', 'metrics', 'caption', 'publication_key', 'exercise_details', 'share_payload'];
begin
  if input is null or jsonb_typeof(input) <> 'object'
    or exists (select 1 from jsonb_object_keys(input) as key where key <> all(allowed_keys))
    then raise exception 'invalid recap input';
  end if;

  requested_publication_key := input ->> 'publication_key';
  if requested_publication_key is null or char_length(requested_publication_key) not between 1 and 120 then raise exception 'invalid recap input'; end if;

  payload := input -> 'share_payload';
  if payload is not null and not private.is_valid_recap_share_payload(payload) then raise exception 'invalid recap share payload'; end if;

  select id into recap_id from public.workout_recaps where author_id = actor and publication_key = requested_publication_key;
  if recap_id is not null then return recap_id; end if;

  details := input -> 'exercise_details';
  if not input ?& array['routine_name', 'completed_at', 'duration_seconds', 'exercise_count', 'metrics', 'publication_key', 'exercise_details']
    or jsonb_typeof(input -> 'metrics') <> 'object'
    or exists (select 1 from jsonb_each(input -> 'metrics') as metric where jsonb_typeof(metric.value) <> 'number')
    or jsonb_typeof(details) <> 'object' or not details ? 'exercises'
    or exists (select 1 from jsonb_object_keys(details) as key where key <> 'exercises')
    or jsonb_typeof(details -> 'exercises') <> 'array' or jsonb_array_length(details -> 'exercises') > 100
    or (input ->> 'exercise_count')::integer <> jsonb_array_length(details -> 'exercises')
    or exists (select 1 from jsonb_array_elements(details -> 'exercises') as exercise(value) where jsonb_typeof(exercise.value) <> 'object' or not exercise.value ?& array['name', 'muscle_group_ids'] or exists (select 1 from jsonb_object_keys(exercise.value) as key where key <> all(array['name', 'muscle_group_ids'])) or jsonb_typeof(exercise.value -> 'name') <> 'string' or char_length(exercise.value ->> 'name') not between 1 and 120 or jsonb_typeof(exercise.value -> 'muscle_group_ids') <> 'array' or jsonb_array_length(exercise.value -> 'muscle_group_ids') > 32)
    then raise exception 'invalid recap input';
  end if;

  insert into public.workout_recaps (author_id, routine_name, completed_at, duration_seconds, exercise_count, metrics, caption, publication_key, exercise_details, share_payload)
  values (actor, input ->> 'routine_name', (input ->> 'completed_at')::timestamptz, (input ->> 'duration_seconds')::integer, (input ->> 'exercise_count')::integer, input -> 'metrics', nullif(input ->> 'caption', ''), requested_publication_key, details, payload)
  returning id into recap_id;
  return recap_id;
exception when unique_violation then select id into recap_id from public.workout_recaps where author_id = actor and publication_key = requested_publication_key; return recap_id;
when invalid_text_representation or numeric_value_out_of_range then raise exception 'invalid recap input';
end;
$$;
