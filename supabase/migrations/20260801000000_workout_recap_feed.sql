-- Private, immutable workout summaries. Raw local workout records never cross this boundary.
create table public.workout_recaps (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  routine_name text not null check (char_length(routine_name) between 1 and 120),
  completed_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0 and duration_seconds <= 86400),
  exercise_count integer not null check (exercise_count between 0 and 100),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  caption text check (caption is null or char_length(caption) <= 280),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index workout_recaps_feed_page on public.workout_recaps (created_at desc, id desc) where deleted_at is null;

create function private.is_recap_viewer(viewer uuid, recap_author uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select viewer = recap_author or (
    not private.is_blocked_pair(viewer, recap_author)
    and exists (
      select 1 from public.relationships
      where member_low = least(viewer, recap_author)
        and member_high = greatest(viewer, recap_author)
        and kind in ('bro', 'partner')
    )
  )
$$;

create function public.prevent_workout_recap_edit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.deleted_at is null and new.deleted_at is not null
    and (to_jsonb(new) - 'deleted_at') = (to_jsonb(old) - 'deleted_at') then
    return new;
  end if;
  raise exception 'workout recaps are immutable';
end;
$$;

create trigger workout_recaps_immutable
before update on public.workout_recaps
for each row execute function public.prevent_workout_recap_edit();

create function public.create_workout_recap(input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  recap_id uuid;
  allowed_keys text[] := array['routine_name', 'completed_at', 'duration_seconds', 'exercise_count', 'metrics', 'caption'];
begin
  if input is null or jsonb_typeof(input) <> 'object'
    or not input ?& array['routine_name', 'completed_at', 'duration_seconds', 'exercise_count', 'metrics']
    or exists (select 1 from jsonb_object_keys(input) as key where key <> all(allowed_keys))
    or jsonb_typeof(input -> 'metrics') <> 'object'
    or exists (select 1 from jsonb_each(input -> 'metrics') as metric where jsonb_typeof(metric.value) <> 'number') then
    raise exception 'invalid recap input';
  end if;

  insert into public.workout_recaps (author_id, routine_name, completed_at, duration_seconds, exercise_count, metrics, caption)
  values (
    actor,
    input ->> 'routine_name',
    (input ->> 'completed_at')::timestamptz,
    (input ->> 'duration_seconds')::integer,
    (input ->> 'exercise_count')::integer,
    input -> 'metrics',
    nullif(input ->> 'caption', '')
  ) returning id into recap_id;
  return recap_id;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid recap input';
end;
$$;

create function public.delete_workout_recap(recap_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  update public.workout_recaps
  set deleted_at = now()
  where id = recap_id and author_id = actor and deleted_at is null;
  if not found then raise exception 'recap unavailable'; end if;
end;
$$;

create function public.list_workout_recaps(cursor text default null, page_size integer default 20)
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
      recap.duration_seconds, recap.exercise_count, recap.metrics, recap.caption, recap.created_at
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
        'exercise_count', fetched.exercise_count, 'metrics', fetched.metrics, 'caption', fetched.caption,
        'created_at', fetched.created_at
      );
      last_created_at := fetched.created_at;
      last_id := fetched.id;
    end if;
  end loop;

  return jsonb_build_object('recaps', recaps, 'next_cursor', case when row_count > bounded_size then
    encode(convert_to(jsonb_build_object('c', last_created_at, 'i', last_id)::text, 'UTF8'), 'base64') else null end);
end;
$$;

alter table public.workout_recaps enable row level security;
create policy workout_recaps_realtime_read on public.workout_recaps for select to authenticated
using (deleted_at is null and private.is_recap_viewer(auth.uid(), author_id));

revoke all on public.workout_recaps from anon, authenticated;
revoke all on function private.is_recap_viewer(uuid, uuid) from public, anon, authenticated;
grant execute on function private.is_recap_viewer(uuid, uuid) to authenticated;
revoke all on function public.create_workout_recap(jsonb), public.delete_workout_recap(uuid), public.list_workout_recaps(text, integer) from public, anon;
grant execute on function public.create_workout_recap(jsonb), public.delete_workout_recap(uuid), public.list_workout_recaps(text, integer) to authenticated;

alter publication supabase_realtime add table public.workout_recaps;
