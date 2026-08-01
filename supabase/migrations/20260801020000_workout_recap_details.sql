-- Keep the shared workout boundary immutable and deliberately smaller than a local session.
alter table public.workout_recaps add column exercise_details jsonb;

create or replace function public.create_workout_recap(input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  recap_id uuid;
  requested_publication_key text;
  details jsonb;
  allowed_keys text[] := array['routine_name', 'completed_at', 'duration_seconds', 'exercise_count', 'metrics', 'caption', 'publication_key', 'exercise_details'];
begin
  details := input -> 'exercise_details';
  if input is null or jsonb_typeof(input) <> 'object'
    or not input ?& array['routine_name', 'completed_at', 'duration_seconds', 'exercise_count', 'metrics', 'publication_key', 'exercise_details']
    or exists (select 1 from jsonb_object_keys(input) as key where key <> all(allowed_keys))
    or jsonb_typeof(input -> 'metrics') <> 'object'
    or exists (select 1 from jsonb_each(input -> 'metrics') as metric where jsonb_typeof(metric.value) <> 'number')
    or jsonb_typeof(details) <> 'object'
    or not details ? 'exercises'
    or exists (select 1 from jsonb_object_keys(details) as key where key <> 'exercises')
    or jsonb_typeof(details -> 'exercises') <> 'array'
    or jsonb_array_length(details -> 'exercises') > 100
    or (input ->> 'exercise_count')::integer <> jsonb_array_length(details -> 'exercises')
    or exists (
      select 1 from jsonb_array_elements(details -> 'exercises') as exercise(value)
      where jsonb_typeof(exercise.value) <> 'object'
        or not exercise.value ?& array['name', 'muscle_group_ids']
        or exists (select 1 from jsonb_object_keys(exercise.value) as key where key <> all(array['name', 'muscle_group_ids']))
        or jsonb_typeof(exercise.value -> 'name') <> 'string'
        or char_length(exercise.value ->> 'name') not between 1 and 120
        or jsonb_typeof(exercise.value -> 'muscle_group_ids') <> 'array'
        or jsonb_array_length(exercise.value -> 'muscle_group_ids') > 32
        or exists (
          select 1 from jsonb_array_elements(exercise.value -> 'muscle_group_ids') as muscle(value)
          where jsonb_typeof(muscle.value) <> 'string' or char_length(muscle.value #>> '{}') not between 1 and 120
        )
    ) then
    raise exception 'invalid recap input';
  end if;

  requested_publication_key := input ->> 'publication_key';
  if requested_publication_key is null or char_length(requested_publication_key) not between 1 and 120 then
    raise exception 'invalid recap input';
  end if;

  select id into recap_id from public.workout_recaps
  where author_id = actor and workout_recaps.publication_key = requested_publication_key;
  if recap_id is not null then return recap_id; end if;

  insert into public.workout_recaps (author_id, routine_name, completed_at, duration_seconds, exercise_count, metrics, caption, publication_key, exercise_details)
  values (actor, input ->> 'routine_name', (input ->> 'completed_at')::timestamptz,
    (input ->> 'duration_seconds')::integer, (input ->> 'exercise_count')::integer,
    input -> 'metrics', nullif(input ->> 'caption', ''), requested_publication_key, details)
  returning id into recap_id;
  return recap_id;
exception when unique_violation then
  select id into recap_id from public.workout_recaps
  where author_id = actor and workout_recaps.publication_key = requested_publication_key;
  return recap_id;
when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid recap input';
end;
$$;

create or replace function public.list_workout_recaps(cursor text default null, page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  bounded_size integer := least(greatest(coalesce(page_size, 20), 1), 50);
  decoded jsonb;
  cursor_created_at timestamptz;
  cursor_id uuid;
  fetched record;
  recaps jsonb := '[]'::jsonb;
  row_count integer := 0;
  last_created_at timestamptz;
  last_id uuid;
begin
  if cursor is not null then
    begin
      decoded := convert_from(decode(cursor, 'base64'), 'UTF8')::jsonb;
      cursor_created_at := (decoded ->> 'c')::timestamptz;
      cursor_id := (decoded ->> 'i')::uuid;
      if cursor_created_at is null or cursor_id is null then raise exception 'invalid cursor'; end if;
    exception when others then raise exception 'invalid cursor';
    end;
  end if;

  for fetched in
    select recap.id, recap.author_id, profile.alias, recap.routine_name, recap.completed_at,
      recap.duration_seconds, recap.exercise_count, recap.metrics, recap.caption, recap.created_at,
      coalesce((select array_agg(distinct muscle.value #>> '{}' order by muscle.value #>> '{}')
        from jsonb_array_elements(coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb)) as exercise(value)
        cross join lateral jsonb_array_elements(coalesce(exercise.value -> 'muscle_group_ids', '[]'::jsonb)) as muscle(value)), '{}'::text[]) as muscle_group_ids
    from public.workout_recaps as recap
    join public.profiles as profile on profile.id = recap.author_id
    where recap.deleted_at is null
      and private.is_recap_viewer(actor, recap.author_id)
      and (cursor_id is null or (recap.created_at, recap.id) < (cursor_created_at, cursor_id))
    order by recap.created_at desc, recap.id desc
    limit bounded_size + 1
  loop
    row_count := row_count + 1;
    if row_count <= bounded_size then
      recaps := recaps || jsonb_build_object(
        'id', fetched.id, 'author_alias', fetched.alias, 'routine_name', fetched.routine_name,
        'completed_at', fetched.completed_at, 'duration_seconds', fetched.duration_seconds,
        'exercise_count', fetched.exercise_count, 'muscle_group_ids', fetched.muscle_group_ids,
        'metrics', fetched.metrics, 'caption', fetched.caption, 'created_at', fetched.created_at
      );
      last_created_at := fetched.created_at;
      last_id := fetched.id;
    end if;
  end loop;

  return jsonb_build_object('recaps', recaps, 'next_cursor', case when row_count > bounded_size then
    encode(convert_to(jsonb_build_object('c', last_created_at, 'i', last_id)::text, 'UTF8'), 'base64') else null end);
end;
$$;

create function public.get_workout_recap_detail(recap_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); result jsonb;
begin
  select jsonb_build_object(
    'id', recap.id, 'author_alias', profile.alias, 'routine_name', recap.routine_name,
    'completed_at', recap.completed_at, 'duration_seconds', recap.duration_seconds,
    'exercise_count', recap.exercise_count, 'muscle_group_ids', coalesce((select array_agg(distinct muscle.value #>> '{}' order by muscle.value #>> '{}')
      from jsonb_array_elements(coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb)) as exercise(value)
      cross join lateral jsonb_array_elements(coalesce(exercise.value -> 'muscle_group_ids', '[]'::jsonb)) as muscle(value)), '{}'::text[]),
    'metrics', recap.metrics, 'caption', recap.caption, 'created_at', recap.created_at,
    'exercises', coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb)
  ) into result
  from public.workout_recaps as recap
  join public.profiles as profile on profile.id = recap.author_id
  where recap.id = recap_id and recap.deleted_at is null and private.is_recap_viewer(actor, recap.author_id);
  if result is null then raise exception 'recap unavailable'; end if;
  return result;
end;
$$;

revoke all on function public.get_workout_recap_detail(uuid) from public, anon;
grant execute on function public.get_workout_recap_detail(uuid) to authenticated;
