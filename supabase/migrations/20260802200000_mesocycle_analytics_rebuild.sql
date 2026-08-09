-- Intentionally NOT applied by this change. Apply only after the client services
-- switch from the legacy JSONB training library/state RPCs to these relations.

create type public.mesocycle_lifecycle_status as enum (
  'draft', 'scheduled', 'active', 'completed', 'paused', 'cancelled'
);

create type public.mesocycle_day_kind as enum ('routine', 'rest');
create type public.training_session_status as enum ('partial', 'completed', 'omitted', 'reprogrammed');
create type public.planned_set_kind as enum ('warmup', 'working', 'failure');
create type public.exercise_load_mode as enum ('external_load', 'bodyweight', 'assisted');

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  exercise_id text not null references public.exercises(id) on delete restrict,
  position integer not null check (position > 0),
  variant text not null default '',
  load_mode public.exercise_load_mode not null default 'external_load',
  load_unit text not null default 'kg' check (load_unit in ('kg', 'lb')),
  load_multiplier numeric(5, 2) not null default 1 check (load_multiplier > 0),
  sides_planned integer not null default 1 check (sides_planned between 1 and 2),
  unique (routine_id, position)
);

create table public.routine_sets (
  id uuid primary key default gen_random_uuid(),
  routine_exercise_id uuid not null references public.routine_exercises(id) on delete cascade,
  position integer not null check (position > 0),
  kind public.planned_set_kind not null default 'working',
  target_repetitions integer check (target_repetitions > 0),
  target_load numeric(10, 2) check (target_load >= 0),
  unique (routine_exercise_id, position)
);

create table public.mesocycles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  goal text not null default '',
  status public.mesocycle_lifecycle_status not null default 'draft',
  start_date date,
  duration_weeks integer not null check (duration_weeks > 0),
  end_date date generated always as (
    case when start_date is null then null else start_date + (duration_weeks * 7 - 1) end
  ) stored,
  priority_muscle_group_ids text[] not null default '{}',
  priority_exercise_ids text[] not null default '{}',
  priority_patterns text[] not null default '{}',
  adherence_target numeric(5, 2) check (adherence_target between 0 and 100),
  progression_target numeric(5, 2),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'draft') or start_date is not null),
  check ((status <> 'completed') or completed_at is not null),
  check ((status <> 'cancelled') or cancelled_at is not null)
);

create extension if not exists btree_gist;
alter table public.mesocycles add constraint mesocycles_no_schedule_overlap
  exclude using gist (
    owner_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('scheduled', 'active', 'paused') and start_date is not null);

create table public.mesocycle_weeks (
  id uuid primary key default gen_random_uuid(),
  mesocycle_id uuid not null references public.mesocycles(id) on delete cascade,
  week_number integer not null check (week_number > 0),
  unique (mesocycle_id, week_number)
);

create table public.mesocycle_days (
  id uuid primary key default gen_random_uuid(),
  mesocycle_week_id uuid not null references public.mesocycle_weeks(id) on delete cascade,
  day_number integer not null check (day_number between 1 and 7),
  kind public.mesocycle_day_kind not null,
  routine_id uuid references public.routines(id) on delete restrict,
  scheduled_date date not null,
  note text,
  reprogrammed_from_day_id uuid references public.mesocycle_days(id) on delete set null,
  unique (mesocycle_week_id, day_number),
  unique (mesocycle_week_id, scheduled_date),
  check ((kind = 'rest' and routine_id is null) or (kind = 'routine' and routine_id is not null))
);

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  mesocycle_day_id uuid unique references public.mesocycle_days(id) on delete restrict,
  routine_id uuid references public.routines(id) on delete set null,
  status public.training_session_status not null,
  started_at timestamptz,
  completed_at timestamptz not null default now(),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  created_at timestamptz not null default now()
);

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  training_session_id uuid not null references public.training_sessions(id) on delete cascade,
  routine_exercise_id uuid references public.routine_exercises(id) on delete set null,
  exercise_id text not null references public.exercises(id) on delete restrict,
  position integer not null check (position > 0),
  recorded_name text not null,
  variant_snapshot text not null default '',
  movement_pattern_snapshot text,
  load_mode public.exercise_load_mode not null,
  load_unit text not null check (load_unit in ('kg', 'lb')),
  load_multiplier numeric(5, 2) not null default 1 check (load_multiplier > 0),
  unique (training_session_id, position)
);

create table public.exercise_sets (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  routine_set_id uuid references public.routine_sets(id) on delete set null,
  position integer not null check (position > 0),
  kind public.planned_set_kind not null,
  performed boolean not null default false,
  repetitions integer check (repetitions > 0),
  load numeric(10, 2) check (load >= 0),
  sides_performed integer not null default 1 check (sides_performed between 1 and 2),
  unique (session_exercise_id, position),
  check ((performed and repetitions is not null and load is not null) or not performed)
);

create table public.set_muscle_loads (
  exercise_set_id uuid not null references public.exercise_sets(id) on delete cascade,
  exercise_id text not null references public.exercises(id) on delete restrict,
  muscle_group_id text not null references public.muscle_groups(id) on delete restrict,
  role_snapshot text not null check (role_snapshot in ('Principal', 'Secundario')),
  relevance_snapshot numeric(4, 3) not null check (relevance_snapshot between 0 and 1),
  weighted_sets numeric(8, 3) not null check (weighted_sets >= 0),
  weighted_repetitions numeric(10, 3) not null check (weighted_repetitions >= 0),
  weighted_tonnage numeric(14, 3),
  primary key (exercise_set_id, muscle_group_id)
);

create table public.training_analytics_config (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  volume_low_max numeric(5, 2) not null default 5.99,
  volume_moderate_low_max numeric(5, 2) not null default 9.99,
  volume_moderate_max numeric(5, 2) not null default 15.99,
  volume_high_max numeric(5, 2) not null default 20,
  frequency_threshold numeric(5, 2) not null default 0.5,
  regular_week_adherence_min numeric(5, 2) not null default 80,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (volume_low_max < volume_moderate_low_max and volume_moderate_low_max < volume_moderate_max and volume_moderate_max < volume_high_max)
);

create table public.mesocycle_metrics (
  mesocycle_id uuid primary key references public.mesocycles(id) on delete cascade,
  calculated_at timestamptz not null default now(),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object')
);

create table public.weekly_metrics (
  mesocycle_week_id uuid primary key references public.mesocycle_weeks(id) on delete cascade,
  calculated_at timestamptz not null default now(),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object')
);

create table public.personal_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id text not null references public.exercises(id) on delete restrict,
  training_session_id uuid not null references public.training_sessions(id) on delete cascade,
  record_kind text not null check (record_kind in ('max_load', 'repetitions_at_load', 'set_tonnage', 'session_tonnage', 'estimated_1rm', 'weekly_exercise_volume')),
  value numeric(14, 3) not null check (value >= 0),
  achieved_at timestamptz not null default now()
);

create index mesocycles_owner_status_start_idx on public.mesocycles(owner_id, status, start_date);
create index mesocycle_days_scheduled_date_idx on public.mesocycle_days(scheduled_date);
create index training_sessions_owner_completed_idx on public.training_sessions(owner_id, completed_at desc);
create index set_muscle_loads_muscle_idx on public.set_muscle_loads(muscle_group_id);
create index personal_records_owner_exercise_idx on public.personal_records(owner_id, exercise_id, achieved_at desc);

create trigger routines_updated_at before update on public.routines for each row execute function public.touch_updated_at();
create trigger mesocycles_updated_at before update on public.mesocycles for each row execute function public.touch_updated_at();
create trigger training_analytics_config_updated_at before update on public.training_analytics_config for each row execute function public.touch_updated_at();

alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.routine_sets enable row level security;
alter table public.mesocycles enable row level security;
alter table public.mesocycle_weeks enable row level security;
alter table public.mesocycle_days enable row level security;
alter table public.training_sessions enable row level security;
alter table public.session_exercises enable row level security;
alter table public.exercise_sets enable row level security;
alter table public.set_muscle_loads enable row level security;
alter table public.training_analytics_config enable row level security;
alter table public.mesocycle_metrics enable row level security;
alter table public.weekly_metrics enable row level security;
alter table public.personal_records enable row level security;

-- The follow-up service migration must expose owner-scoped RPCs and revoke direct
-- access before this schema is applied to a shared environment.
