alter table public.profiles
  add column real_name text,
  add column birth_date date,
  add column sex text check (sex in ('male', 'female')),
  add column onboarding_completed_at timestamptz;

alter table public.body_metrics
  drop constraint body_metrics_metric_type_check,
  drop constraint body_metrics_unit_check;

alter table public.body_metrics
  add constraint body_metrics_metric_type_check check (metric_type in (
    'body_weight', 'height', 'neck', 'shoulders', 'chest', 'waist', 'hips',
    'biceps_relaxed', 'biceps_flexed', 'forearm', 'thigh', 'calf'
  )),
  add constraint body_metrics_unit_check check (
    (metric_type = 'body_weight' and unit = 'kg')
    or (metric_type <> 'body_weight' and unit = 'cm')
  );

create or replace function public.get_own_onboarding()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'completed', onboarding_completed_at is not null,
    'real_name', real_name,
    'birth_date', birth_date,
    'sex', sex
  )
  from public.profiles
  where id = public.require_actor()
$$;

create function public.complete_own_onboarding(onboarding_input jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor();
  alias_input text;
  real_name_input text;
  birth_date_input date;
  sex_input text;
begin
  if onboarding_input is null
    or jsonb_typeof(onboarding_input) <> 'object'
    or not onboarding_input ?& array['alias', 'real_name', 'birth_date', 'sex']
    or exists (select 1 from jsonb_object_keys(onboarding_input) as keys(value) where keys.value <> all(array['alias', 'real_name', 'birth_date', 'sex']))
    or jsonb_typeof(onboarding_input -> 'alias') <> 'string'
    or jsonb_typeof(onboarding_input -> 'real_name') <> 'string'
    or jsonb_typeof(onboarding_input -> 'birth_date') <> 'string'
    or jsonb_typeof(onboarding_input -> 'sex') <> 'string' then
    raise exception 'invalid onboarding input';
  end if;

  alias_input := trim(onboarding_input ->> 'alias');
  real_name_input := trim(onboarding_input ->> 'real_name');
  birth_date_input := (onboarding_input ->> 'birth_date')::date;
  sex_input := onboarding_input ->> 'sex';
  if char_length(alias_input) not between 3 and 32
    or char_length(real_name_input) not between 1 and 100
    or birth_date_input > current_date
    or birth_date_input < current_date - interval '120 years'
    or sex_input not in ('male', 'female') then
    raise exception 'invalid onboarding input';
  end if;

  perform private.ensure_actor_profile(actor);
  update public.profiles
  set alias = alias_input,
    real_name = real_name_input,
    birth_date = birth_date_input,
    sex = sex_input,
    avatar_id = case when sex_input = 'female' then 'capigirl' else 'capybara-athlete' end,
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = actor;
end;
$$;

create or replace function public.record_body_metric(
  metric_type_input text,
  value_input numeric,
  unit_input text,
  measured_at_input timestamptz,
  notes_input text default null
)
returns table (
  id uuid,
  metric_type text,
  value numeric,
  unit text,
  measured_at timestamptz,
  source text,
  notes text
) language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  if metric_type_input not in ('body_weight', 'height', 'neck', 'shoulders', 'chest', 'waist', 'hips', 'biceps_relaxed', 'biceps_flexed', 'forearm', 'thigh', 'calf')
    or value_input is null or value_input <= 0 or measured_at_input is null
    or (metric_type_input = 'body_weight' and unit_input <> 'kg')
    or (metric_type_input <> 'body_weight' and unit_input <> 'cm') then
    raise exception 'invalid body metric input';
  end if;

  return query
  insert into public.body_metrics(owner_id, metric_type, value, unit, measured_at, source, notes)
  values (actor, metric_type_input, value_input, unit_input, measured_at_input, 'manual', nullif(btrim(notes_input), ''))
  returning body_metrics.id, body_metrics.metric_type, body_metrics.value, body_metrics.unit,
    body_metrics.measured_at, body_metrics.source, body_metrics.notes;
end;
$$;

revoke all on function public.get_own_onboarding(), public.complete_own_onboarding(jsonb) from public, anon;
grant execute on function public.get_own_onboarding(), public.complete_own_onboarding(jsonb) to authenticated;
