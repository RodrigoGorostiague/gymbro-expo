alter table public.profiles
  add column auto_share_completed_workouts boolean not null default true;

alter table public.workout_recaps
  add column publication_key text;

create unique index workout_recaps_author_publication_key
  on public.workout_recaps (author_id, publication_key)
  where publication_key is not null;

create or replace function public.create_workout_recap(input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  recap_id uuid;
  requested_publication_key text;
  allowed_keys text[] := array['routine_name', 'completed_at', 'duration_seconds', 'exercise_count', 'metrics', 'caption', 'publication_key'];
begin
  if input is null or jsonb_typeof(input) <> 'object'
    or not input ?& array['routine_name', 'completed_at', 'duration_seconds', 'exercise_count', 'metrics', 'publication_key']
    or exists (select 1 from jsonb_object_keys(input) as key where key <> all(allowed_keys))
    or jsonb_typeof(input -> 'metrics') <> 'object'
    or exists (select 1 from jsonb_each(input -> 'metrics') as metric where jsonb_typeof(metric.value) <> 'number') then
    raise exception 'invalid recap input';
  end if;

  requested_publication_key := input ->> 'publication_key';
  if requested_publication_key is null or char_length(requested_publication_key) not between 1 and 120 then
    raise exception 'invalid recap input';
  end if;

  select id into recap_id from public.workout_recaps
  where author_id = actor and workout_recaps.publication_key = requested_publication_key;
  if recap_id is not null then return recap_id; end if;

  insert into public.workout_recaps (author_id, routine_name, completed_at, duration_seconds, exercise_count, metrics, caption, publication_key)
  values (actor, input ->> 'routine_name', (input ->> 'completed_at')::timestamptz,
    (input ->> 'duration_seconds')::integer, (input ->> 'exercise_count')::integer,
    input -> 'metrics', nullif(input ->> 'caption', ''), requested_publication_key)
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
