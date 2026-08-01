-- Immutable, import-safe templates are stored with a recap, never read from an author's live library.
alter table public.profiles
  add column share_routine_template boolean not null default true,
  add column share_mesocycle_template boolean not null default true,
  add column share_performed_set_details boolean not null default true;

alter table public.workout_recaps add column share_payload jsonb;
alter table public.workout_recaps add constraint workout_recaps_share_payload_object
  check (share_payload is null or jsonb_typeof(share_payload) = 'object');

create function private.is_valid_recap_template_routine(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare exercise jsonb; set_value jsonb; muscle jsonb;
begin
  if jsonb_typeof(value) <> 'object' or not value ?& array['name', 'muscleGroups', 'exercises']
    or exists (select 1 from jsonb_object_keys(value) key where key <> all(array['name', 'muscleGroups', 'exercises']))
    or jsonb_typeof(value -> 'name') <> 'string' or char_length(btrim(value ->> 'name')) not between 1 and 120
    or jsonb_typeof(value -> 'muscleGroups') <> 'array' or jsonb_array_length(value -> 'muscleGroups') not between 1 and 32
    or jsonb_typeof(value -> 'exercises') <> 'array' or jsonb_array_length(value -> 'exercises') not between 1 and 100 then return false; end if;
  for muscle in select value from jsonb_array_elements(value -> 'muscleGroups') loop if jsonb_typeof(muscle) <> 'string' or char_length(btrim(muscle #>> '{}')) not between 1 and 120 then return false; end if; end loop;
  for exercise in select value from jsonb_array_elements(value -> 'exercises') loop
    if jsonb_typeof(exercise) <> 'object' or not exercise ?& array['name', 'muscleGroups', 'loadMode', 'loadUnit', 'variant', 'sets']
      or exists (select 1 from jsonb_object_keys(exercise) key where key <> all(array['name', 'muscleGroups', 'loadMode', 'loadUnit', 'variant', 'sets']))
      or jsonb_typeof(exercise -> 'name') <> 'string' or char_length(btrim(exercise ->> 'name')) not between 1 and 120
      or jsonb_typeof(exercise -> 'muscleGroups') <> 'array' or jsonb_array_length(exercise -> 'muscleGroups') not between 1 and 32
      or exercise ->> 'loadMode' not in ('external-load', 'bodyweight', 'assisted') or exercise ->> 'loadUnit' not in ('kg', 'lb')
      or jsonb_typeof(exercise -> 'variant') <> 'string' or char_length(btrim(exercise ->> 'variant')) not between 1 and 120
      or jsonb_typeof(exercise -> 'sets') <> 'array' or jsonb_array_length(exercise -> 'sets') not between 1 and 100 then return false; end if;
    for muscle in select value from jsonb_array_elements(exercise -> 'muscleGroups') loop if jsonb_typeof(muscle) <> 'string' or char_length(btrim(muscle #>> '{}')) not between 1 and 120 then return false; end if; end loop;
    for set_value in select value from jsonb_array_elements(exercise -> 'sets') loop
      if jsonb_typeof(set_value) <> 'object' or not set_value ?& array['tipo', 'weight', 'reps']
        or exists (select 1 from jsonb_object_keys(set_value) key where key <> all(array['tipo', 'weight', 'reps']))
        or (jsonb_typeof(set_value -> 'tipo') <> 'number' and set_value ->> 'tipo' not in ('C', 'F'))
        or (jsonb_typeof(set_value -> 'tipo') = 'number' and ((set_value ->> 'tipo')::numeric <> trunc((set_value ->> 'tipo')::numeric) or (set_value ->> 'tipo')::numeric not between 0 and 10))
        or jsonb_typeof(set_value -> 'weight') <> 'number' or (set_value ->> 'weight')::numeric not between 0 and 10000
        or jsonb_typeof(set_value -> 'reps') <> 'number' or (set_value ->> 'reps')::numeric <> trunc((set_value ->> 'reps')::numeric) or (set_value ->> 'reps')::numeric not between 0 and 1000 then return false; end if;
    end loop;
  end loop;
  return true;
end;
$$;

create function private.is_valid_recap_share_payload(payload jsonb)
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
      for set_value in select value from jsonb_array_elements(performance -> 'sets') loop if jsonb_typeof(set_value) <> 'object' or not set_value ?& array['weight', 'reps', 'completed'] or exists (select 1 from jsonb_object_keys(set_value) key where key <> all(array['weight', 'reps', 'completed'])) or jsonb_typeof(set_value -> 'weight') <> 'number' or (set_value ->> 'weight')::numeric not between 0 and 10000 or jsonb_typeof(set_value -> 'reps') <> 'number' or (set_value ->> 'reps')::numeric <> trunc((set_value ->> 'reps')::numeric) or (set_value ->> 'reps')::numeric not between 0 and 1000 or jsonb_typeof(set_value -> 'completed') <> 'boolean' then return false; end if; end loop;
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
    or exists (select 1 from jsonb_object_keys(input) as key where key <> all(allowed_keys))
    or jsonb_typeof(input -> 'metrics') <> 'object'
    or exists (select 1 from jsonb_each(input -> 'metrics') as metric where jsonb_typeof(metric.value) <> 'number')
    or jsonb_typeof(details) <> 'object' or not details ? 'exercises'
    or exists (select 1 from jsonb_object_keys(details) as key where key <> 'exercises')
    or jsonb_typeof(details -> 'exercises') <> 'array' or jsonb_array_length(details -> 'exercises') > 100
    or (input ->> 'exercise_count')::integer <> jsonb_array_length(details -> 'exercises')
    or exists (select 1 from jsonb_array_elements(details -> 'exercises') as exercise(value) where jsonb_typeof(exercise.value) <> 'object' or not exercise.value ?& array['name', 'muscle_group_ids'] or exists (select 1 from jsonb_object_keys(exercise.value) as key where key <> all(array['name', 'muscle_group_ids'])) or jsonb_typeof(exercise.value -> 'name') <> 'string' or char_length(exercise.value ->> 'name') not between 1 and 120 or jsonb_typeof(exercise.value -> 'muscle_group_ids') <> 'array' or jsonb_array_length(exercise.value -> 'muscle_group_ids') > 32)
    then raise exception 'invalid recap input';
  end if;

  -- Payload uses positional references only. It deliberately cannot carry local IDs, notes, or publication metadata.
  if payload is not null and not private.is_valid_recap_share_payload(payload) then raise exception 'invalid recap share payload'; end if;

  requested_publication_key := input ->> 'publication_key';
  if requested_publication_key is null or char_length(requested_publication_key) not between 1 and 120 then raise exception 'invalid recap input'; end if;
  select id into recap_id from public.workout_recaps where author_id = actor and publication_key = requested_publication_key;
  if recap_id is not null then return recap_id; end if;
  insert into public.workout_recaps (author_id, routine_name, completed_at, duration_seconds, exercise_count, metrics, caption, publication_key, exercise_details, share_payload)
  values (actor, input ->> 'routine_name', (input ->> 'completed_at')::timestamptz, (input ->> 'duration_seconds')::integer, (input ->> 'exercise_count')::integer, input -> 'metrics', nullif(input ->> 'caption', ''), requested_publication_key, details, payload)
  returning id into recap_id;
  return recap_id;
exception when unique_violation then select id into recap_id from public.workout_recaps where author_id = actor and publication_key = requested_publication_key; return recap_id;
when invalid_text_representation or numeric_value_out_of_range then raise exception 'invalid recap input';
end;
$$;

create or replace function public.list_workout_recaps(cursor text default null, page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor(); bounded_size integer := least(greatest(coalesce(page_size, 20), 1), 50);
  decoded jsonb; cursor_created_at timestamptz; cursor_id uuid; fetched record;
  recaps jsonb := '[]'::jsonb; row_count integer := 0; last_created_at timestamptz; last_id uuid;
begin
  if cursor is not null then
    begin decoded := convert_from(decode(cursor, 'base64'), 'UTF8')::jsonb; cursor_created_at := (decoded ->> 'c')::timestamptz; cursor_id := (decoded ->> 'i')::uuid; if cursor_created_at is null or cursor_id is null then raise exception 'invalid cursor'; end if;
    exception when others then raise exception 'invalid cursor'; end;
  end if;
  for fetched in select recap.id, profile.alias, recap.routine_name, recap.completed_at, recap.duration_seconds, recap.exercise_count, recap.metrics, recap.caption, recap.created_at,
    coalesce((select array_agg(distinct muscle.value #>> '{}' order by muscle.value #>> '{}') from jsonb_array_elements(coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb)) exercise(value) cross join lateral jsonb_array_elements(coalesce(exercise.value -> 'muscle_group_ids', '[]'::jsonb)) muscle(value)), '{}'::text[]) muscle_group_ids,
    recap.share_payload ? 'routine' template_available, recap.share_payload ? 'mesocycle' mesocycle_available, recap.author_id = actor is_author
    from public.workout_recaps recap join public.profiles profile on profile.id = recap.author_id
    where recap.deleted_at is null and private.is_recap_viewer(actor, recap.author_id) and (cursor_id is null or (recap.created_at, recap.id) < (cursor_created_at, cursor_id)) order by recap.created_at desc, recap.id desc limit bounded_size + 1
  loop
    row_count := row_count + 1;
    if row_count <= bounded_size then recaps := recaps || jsonb_build_object('id', fetched.id, 'author_alias', fetched.alias, 'routine_name', fetched.routine_name, 'completed_at', fetched.completed_at, 'duration_seconds', fetched.duration_seconds, 'exercise_count', fetched.exercise_count, 'muscle_group_ids', fetched.muscle_group_ids, 'metrics', fetched.metrics, 'caption', fetched.caption, 'created_at', fetched.created_at, 'template_available', fetched.template_available, 'mesocycle_available', fetched.mesocycle_available, 'is_author', fetched.is_author); last_created_at := fetched.created_at; last_id := fetched.id; end if;
  end loop;
  return jsonb_build_object('recaps', recaps, 'next_cursor', case when row_count > bounded_size then encode(convert_to(jsonb_build_object('c', last_created_at, 'i', last_id)::text, 'UTF8'), 'base64') else null end);
end;
$$;

create or replace function public.get_workout_recap_detail(recap_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); result jsonb;
begin
  select jsonb_build_object('id', recap.id, 'author_alias', profile.alias, 'routine_name', recap.routine_name, 'completed_at', recap.completed_at, 'duration_seconds', recap.duration_seconds, 'exercise_count', recap.exercise_count, 'muscle_group_ids', coalesce((select array_agg(distinct muscle.value #>> '{}' order by muscle.value #>> '{}') from jsonb_array_elements(coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb)) exercise(value) cross join lateral jsonb_array_elements(coalesce(exercise.value -> 'muscle_group_ids', '[]'::jsonb)) muscle(value)), '{}'::text[]), 'metrics', recap.metrics, 'caption', recap.caption, 'created_at', recap.created_at, 'exercises', coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb), 'template_available', recap.share_payload ? 'routine', 'mesocycle_available', recap.share_payload ? 'mesocycle', 'is_author', recap.author_id = actor, 'share_payload', recap.share_payload) into result
  from public.workout_recaps recap join public.profiles profile on profile.id = recap.author_id where recap.id = recap_id and recap.deleted_at is null and private.is_recap_viewer(actor, recap.author_id);
  if result is null then raise exception 'recap unavailable'; end if; return result;
end;
$$;
