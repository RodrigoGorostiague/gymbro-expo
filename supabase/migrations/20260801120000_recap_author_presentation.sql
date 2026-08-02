-- A recap exposes only author-controlled presentation metadata, never their private shop state.
alter table public.profiles
  add column presentation_theme_id text
  check (presentation_theme_id is null or char_length(presentation_theme_id) between 1 and 80);

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
  for fetched in select recap.id, profile.alias, profile.avatar_id, profile.presentation_theme_id, recap.routine_name, recap.completed_at, recap.duration_seconds, recap.exercise_count, recap.metrics, recap.caption, recap.created_at,
    coalesce((select array_agg(distinct muscle.value #>> '{}' order by muscle.value #>> '{}') from jsonb_array_elements(coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb)) exercise(value) cross join lateral jsonb_array_elements(coalesce(exercise.value -> 'muscle_group_ids', '[]'::jsonb)) muscle(value)), '{}'::text[]) muscle_group_ids,
    recap.share_payload ? 'routine' template_available, recap.share_payload ? 'mesocycle' mesocycle_available, recap.author_id = actor is_author
    from public.workout_recaps recap join public.profiles profile on profile.id = recap.author_id
    where recap.deleted_at is null and private.is_recap_viewer(actor, recap.author_id) and (cursor_id is null or (recap.created_at, recap.id) < (cursor_created_at, cursor_id)) order by recap.created_at desc, recap.id desc limit bounded_size + 1
  loop
    row_count := row_count + 1;
    if row_count <= bounded_size then recaps := recaps || jsonb_build_object('id', fetched.id, 'author_alias', fetched.alias, 'author_avatar_id', fetched.avatar_id, 'author_theme_id', fetched.presentation_theme_id, 'routine_name', fetched.routine_name, 'completed_at', fetched.completed_at, 'duration_seconds', fetched.duration_seconds, 'exercise_count', fetched.exercise_count, 'muscle_group_ids', fetched.muscle_group_ids, 'metrics', fetched.metrics, 'caption', fetched.caption, 'created_at', fetched.created_at, 'template_available', fetched.template_available, 'mesocycle_available', fetched.mesocycle_available, 'is_author', fetched.is_author); last_created_at := fetched.created_at; last_id := fetched.id; end if;
  end loop;
  return jsonb_build_object('recaps', recaps, 'next_cursor', case when row_count > bounded_size then encode(convert_to(jsonb_build_object('c', last_created_at, 'i', last_id)::text, 'UTF8'), 'base64') else null end);
end;
$$;
