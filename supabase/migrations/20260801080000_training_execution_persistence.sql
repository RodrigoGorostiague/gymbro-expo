create table public.training_states (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  definitions jsonb not null default '[]'::jsonb check (jsonb_typeof(definitions) = 'array'),
  attempts jsonb not null default '[]'::jsonb check (jsonb_typeof(attempts) = 'array'),
  sessions jsonb not null default '[]'::jsonb check (jsonb_typeof(sessions) = 'array'),
  active_workout_draft jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger training_states_updated_at before update on public.training_states
for each row execute function public.touch_updated_at();

create function public.training_state_nonempty_text(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'string' and btrim(value #>> '{}') <> ''
$$;

create function public.training_state_unique_ids(items jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(items) = 'array' and not exists (
    select 1 from jsonb_array_elements(items) item(value)
    where jsonb_typeof(item.value) <> 'object' or not public.training_state_nonempty_text(item.value -> 'id')
  ) and not exists (
    select 1 from jsonb_array_elements(items) item(value) group by item.value ->> 'id' having count(*) > 1
  )
$$;

create function public.training_state_valid_definitions(items jsonb, actor uuid)
returns boolean language sql stable set search_path = '' as $$
  select public.training_state_unique_ids(items) and not exists (
    select 1 from jsonb_array_elements(items) item(value)
    where not public.training_state_nonempty_text(item.value -> 'name')
      or jsonb_typeof(item.value -> 'source') <> 'object'
      or item.value -> 'source' ->> 'kind' <> 'custom'
      or item.value -> 'source' ->> 'owner' <> actor::text
      or not public.training_state_nonempty_text(item.value -> 'source' -> 'originId')
      or jsonb_typeof(item.value -> 'muscleGroups') <> 'array'
      or item.value ->> 'loadMode' not in ('external-load', 'bodyweight', 'assisted')
      or item.value ->> 'loadUnit' not in ('kg', 'lb')
      or not public.training_state_nonempty_text(item.value -> 'variant')
      or jsonb_typeof(item.value -> 'defaultSets') <> 'array'
  )
$$;

create function public.training_state_valid_attempts(items jsonb, actor uuid)
returns boolean language sql stable set search_path = '' as $$
  select public.training_state_unique_ids(items) and not exists (
    select 1 from jsonb_array_elements(items) item(value)
    where item.value ->> 'version' <> '1' or item.value ->> 'owner' <> actor::text
      or not public.training_state_nonempty_text(item.value -> 'recordedRoutineName')
      or jsonb_typeof(item.value -> 'completedAt') <> 'string'
      or coalesce((item.value ->> 'durationSeconds') ~ '^[0-9]+$', false) is false
      or coalesce((item.value ->> 'restTimerSeconds') ~ '^[0-9]+$', false) is false
      or jsonb_typeof(item.value -> 'exercises') <> 'array'
      or jsonb_typeof(item.value -> 'completion') <> 'object'
      or jsonb_typeof(item.value -> 'reward') <> 'object'
      or jsonb_typeof(item.value -> 'rewardApplication') <> 'object'
      or item.value -> 'rewardApplication' ->> 'state' not in ('pending', 'applied')
      or not public.training_state_nonempty_text(item.value -> 'rewardApplication' -> 'id')
  )
$$;

create function public.training_state_valid_sessions(items jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select public.training_state_unique_ids(items) and not exists (
    select 1 from jsonb_array_elements(items) item(value)
    where not public.training_state_nonempty_text(item.value -> 'routineId')
      or not public.training_state_nonempty_text(item.value -> 'routineName')
      or jsonb_typeof(item.value -> 'completedAt') <> 'string'
      or coalesce((item.value ->> 'durationSeconds') ~ '^[0-9]+$', false) is false
      or coalesce((item.value ->> 'restTimerSeconds') ~ '^[0-9]+$', false) is false
      or jsonb_typeof(item.value -> 'exercises') <> 'array'
  )
$$;

create function public.training_state_valid_draft(draft jsonb, actor uuid)
returns boolean language sql stable set search_path = '' as $$
  select draft is null or (jsonb_typeof(draft) = 'object'
    and draft ->> 'version' = '1' and draft ->> 'owner' = actor::text
    and public.training_state_nonempty_text(draft -> 'attemptId')
    and public.training_state_nonempty_text(draft -> 'routineId')
    and jsonb_typeof(draft -> 'startedAtMs') = 'number'
    and jsonb_typeof(draft -> 'restTimerSeconds') = 'number'
    and jsonb_typeof(draft -> 'completedSets') = 'object'
    and jsonb_typeof(draft -> 'setValues') = 'object')
$$;

create function public.validate_training_state_row()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.training_state_valid_definitions(new.definitions, new.owner_id)
    or not public.training_state_valid_attempts(new.attempts, new.owner_id)
    or not public.training_state_valid_sessions(new.sessions)
    or not public.training_state_valid_draft(new.active_workout_draft, new.owner_id) then
    raise exception 'invalid training state input';
  end if;
  return new;
end;
$$;

create trigger training_states_validate_content before insert or update on public.training_states
for each row execute function public.validate_training_state_row();

create function public.load_training_state()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('definitions', definitions, 'attempts', attempts, 'sessions', sessions, 'activeWorkoutDraft', active_workout_draft)
  from public.training_states where owner_id = public.require_actor()
  union all select jsonb_build_object('definitions', '[]'::jsonb, 'attempts', '[]'::jsonb, 'sessions', '[]'::jsonb, 'activeWorkoutDraft', null)
  where not exists (select 1 from public.training_states where owner_id = public.require_actor()) limit 1
$$;

create function public.save_training_state(definitions_input jsonb default null, attempts_input jsonb default null, sessions_input jsonb default null, active_workout_draft_input jsonb default null, active_workout_draft_supplied boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); current public.training_states%rowtype;
begin
  select * into current from public.training_states where owner_id = actor;
  insert into public.training_states(owner_id, definitions, attempts, sessions, active_workout_draft)
  values (actor, coalesce(definitions_input, current.definitions, '[]'::jsonb), coalesce(attempts_input, current.attempts, '[]'::jsonb), coalesce(sessions_input, current.sessions, '[]'::jsonb), case when active_workout_draft_supplied then active_workout_draft_input else current.active_workout_draft end)
  on conflict(owner_id) do update set definitions = excluded.definitions, attempts = excluded.attempts, sessions = excluded.sessions, active_workout_draft = excluded.active_workout_draft, updated_at = now();
end;
$$;

create function public.import_legacy_training_state(definitions_input jsonb, attempts_input jsonb, sessions_input jsonb, active_workout_draft_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); current public.training_states%rowtype;
  merged_definitions jsonb; merged_attempts jsonb; merged_sessions jsonb;
begin
  select * into current from public.training_states where owner_id = actor;
  select coalesce(jsonb_agg(value), '[]'::jsonb) into merged_definitions from (
    select value from jsonb_array_elements(coalesce(current.definitions, '[]'::jsonb)) value
    union all select legacy.value from jsonb_array_elements(definitions_input) legacy(value)
      where not exists (select 1 from jsonb_array_elements(coalesce(current.definitions, '[]'::jsonb)) remote(value) where remote.value ->> 'id' = legacy.value ->> 'id')
  ) merged;
  select coalesce(jsonb_agg(value), '[]'::jsonb) into merged_attempts from (
    select value from jsonb_array_elements(coalesce(current.attempts, '[]'::jsonb)) value
    union all select legacy.value from jsonb_array_elements(attempts_input) legacy(value)
      where not exists (select 1 from jsonb_array_elements(coalesce(current.attempts, '[]'::jsonb)) remote(value) where remote.value ->> 'id' = legacy.value ->> 'id')
  ) merged;
  select coalesce(jsonb_agg(value), '[]'::jsonb) into merged_sessions from (
    select value from jsonb_array_elements(coalesce(current.sessions, '[]'::jsonb)) value
    union all select legacy.value from jsonb_array_elements(sessions_input) legacy(value)
      where not exists (select 1 from jsonb_array_elements(coalesce(current.sessions, '[]'::jsonb)) remote(value) where remote.value ->> 'id' = legacy.value ->> 'id')
  ) merged;
  perform public.save_training_state(
    merged_definitions,
    merged_attempts,
    merged_sessions,
    coalesce(current.active_workout_draft, active_workout_draft_input), true
  );
end;
$$;

alter table public.training_states enable row level security;
revoke all on public.training_states from anon, authenticated;
revoke all on function public.load_training_state(), public.save_training_state(jsonb, jsonb, jsonb, jsonb, boolean), public.import_legacy_training_state(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.load_training_state(), public.save_training_state(jsonb, jsonb, jsonb, jsonb, boolean), public.import_legacy_training_state(jsonb, jsonb, jsonb, jsonb) to authenticated;
