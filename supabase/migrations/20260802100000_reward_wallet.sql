-- Reward balances and grants are server-owned. Existing captured attempts intentionally receive no backfill.
create table public.reward_wallets (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  purchased_theme_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(purchased_theme_ids) = 'array'),
  equipped_theme_id text,
  combine_with_partner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reward_ledger_entries (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null,
  amount integer not null,
  kind text not null,
  attempt_id text,
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create table public.reward_attempts (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  attempt_id text not null,
  completed_at timestamptz not null,
  week_start date not null,
  adherence numeric not null check (adherence >= 0 and adherence <= 1),
  valid_sets integer not null check (valid_sets >= 0),
  planned_sets integer not null check (planned_sets >= 0),
  mesocycle_id text,
  mesocycle_week integer,
  planned_session_id text,
  primary key (owner_id, attempt_id)
);

create table public.reward_weekly_goals (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  target integer not null check (target > 0),
  reached_at timestamptz,
  primary key (owner_id, week_start)
);

create unique index reward_attempts_planned_session_once
on public.reward_attempts(owner_id, mesocycle_id, mesocycle_week, planned_session_id)
where planned_session_id is not null;

create table public.reward_theme_catalog (
  theme_id text primary key,
  price integer not null check (price >= 0)
);

insert into public.reward_theme_catalog(theme_id, price) values
  ('white', 3), ('black', 12), ('lila-suave', 18), ('green', 35), ('lavanda', 55),
  ('yellow', 80), ('violeta', 140), ('sun', 180), ('lila-neon', 220), ('blue', 250),
  ('leaf', 420), ('moon', 650), ('star', 900), ('snowflake', 1200), ('red', 1500);

create trigger reward_wallets_updated_at before update on public.reward_wallets
for each row execute function public.touch_updated_at();

create function public.reward_add_entry(
  actor uuid, entry_key text, entry_amount integer, entry_kind text, entry_attempt_id text, entry_breakdown jsonb default '{}'::jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.reward_ledger_entries(owner_id, idempotency_key, amount, kind, attempt_id, breakdown)
  values (actor, entry_key, entry_amount, entry_kind, entry_attempt_id, entry_breakdown)
  on conflict (owner_id, idempotency_key) do nothing;
  if found then
    update public.reward_wallets set balance = balance + entry_amount where owner_id = actor;
    return true;
  end if;
  return false;
end;
$$;

create function public.reward_attempt_shape(attempt jsonb, actor uuid)
returns boolean language sql stable set search_path = '' as $$
  select jsonb_typeof(attempt) = 'object'
    and attempt ->> 'version' = '1'
    and attempt ->> 'owner' = actor::text
    and public.training_state_nonempty_text(attempt -> 'id')
    and public.training_state_nonempty_text(attempt -> 'recordedRoutineName')
    and jsonb_typeof(attempt -> 'completedAt') = 'string'
    and coalesce((attempt ->> 'durationSeconds') ~ '^[0-9]+$', false)
    and coalesce((attempt ->> 'restTimerSeconds') ~ '^[0-9]+$', false)
    and jsonb_typeof(attempt -> 'exercises') = 'array'
    and jsonb_array_length(attempt -> 'exercises') > 0
    and not exists (
      select 1 from jsonb_array_elements(attempt -> 'exercises') exercise(value)
      where jsonb_typeof(exercise.value -> 'sets') <> 'array'
        or not public.training_state_nonempty_text(exercise.value -> 'recordedName')
        or exists (
          select 1 from jsonb_array_elements(exercise.value -> 'sets') set_item(value)
          where jsonb_typeof(set_item.value -> 'plan') <> 'object'
            or jsonb_typeof(set_item.value -> 'result') <> 'object'
            or not public.training_state_nonempty_text(set_item.value -> 'plan' -> 'id')
            or set_item.value -> 'result' ->> 'setId' <> set_item.value -> 'plan' ->> 'id'
            or jsonb_typeof(set_item.value -> 'result' -> 'performed') <> 'boolean'
        )
    );
$$;

create function public.reward_valid_sets(attempt jsonb)
returns integer language sql immutable set search_path = '' as $$
  select count(*)::integer from (
    select set_item.value -> 'plan' ->> 'id' as set_id,
      set_item.value -> 'result' as result
    from jsonb_array_elements(attempt -> 'exercises') exercise(value)
    cross join lateral jsonb_array_elements(exercise.value -> 'sets') set_item(value)
  ) sets
  where result ->> 'performed' = 'true'
    and jsonb_typeof(result -> 'performance') = 'object'
    and coalesce((result -> 'performance' ->> 'reps') ~ '^[1-9][0-9]*$', false)
    and result -> 'performance' ->> 'unit' in ('kg', 'lb')
    and (
      (result -> 'performance' ->> 'mode' = 'external-load' and coalesce((result -> 'performance' ->> 'load') ~ '^[0-9]+(\.[0-9]+)?$', false))
      or (result -> 'performance' ->> 'mode' = 'bodyweight' and coalesce((result -> 'performance' ->> 'bodyweight') ~ '^[0-9]+(\.[0-9]+)?$', false) and (result -> 'performance' ->> 'bodyweight')::numeric > 0)
      or (result -> 'performance' ->> 'mode' = 'assisted' and coalesce((result -> 'performance' ->> 'assistance') ~ '^[0-9]+(\.[0-9]+)?$', false))
    )
$$;

create function public.reward_planned_sets(attempt jsonb)
returns integer language sql immutable set search_path = '' as $$
  select count(*)::integer from jsonb_array_elements(attempt -> 'exercises') exercise(value)
  cross join lateral jsonb_array_elements(exercise.value -> 'sets') set_item(value)
$$;

create function public.reward_planned_session_ids(actor uuid, mesocycle_id_input text, week_number_input integer default null)
returns table(session_id text) language sql stable security definer set search_path = '' as $$
  select entry.value ->> 'id'
  from public.training_libraries library
  cross join lateral jsonb_array_elements(library.mesocycles) mesocycle(value)
  cross join lateral jsonb_array_elements(mesocycle.value -> 'weeks') week(value)
  cross join lateral jsonb_array_elements(week.value -> 'entries') entry(value)
  where library.owner_id = actor
    and mesocycle.value ->> 'id' = mesocycle_id_input
    and mesocycle.value ->> 'status' = 'active'
    and (week_number_input is null or (week.value ->> 'weekNumber')::integer = week_number_input)
    and coalesce(entry.value ->> 'kind', '') <> 'rest'
$$;

create function public.reward_week_target(actor uuid, lineage jsonb)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare target integer;
begin
  if jsonb_typeof(lineage) = 'object' and public.training_state_nonempty_text(lineage -> 'mesocycleId')
    and coalesce((lineage ->> 'weekNumber') ~ '^[1-9][0-9]*$', false) then
    select count(*) into target from public.reward_planned_session_ids(actor, lineage ->> 'mesocycleId', (lineage ->> 'weekNumber')::integer);
  end if;
  return greatest(coalesce(target, 0), 3);
end;
$$;

create function public.reward_receipt(actor uuid, attempt_key text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from public.reward_wallets where owner_id = actor), 0),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'amount', amount, 'breakdown', breakdown) order by id)
      from public.reward_ledger_entries where owner_id = actor and (attempt_key is null or attempt_id = attempt_key)), '[]'::jsonb),
    'weekly', coalesce((select jsonb_build_object('target', target, 'completed', (select count(*) from public.reward_attempts a where a.owner_id = actor and a.week_start = goal.week_start and a.adherence >= .7))
      from public.reward_weekly_goals goal where goal.owner_id = actor order by week_start desc limit 1), '{}'::jsonb)
    , 'mesocycle', jsonb_build_object('next', 'Complete linked planned sessions for mesocycle bonuses')
  )
$$;

create function public.finalize_training_attempt(attempt_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor(); current public.training_states%rowtype; attempt_id_input text;
  valid integer; planned integer; adherence_value numeric; completed_at_value timestamptz; week_value date;
  lineage jsonb; mesocycle_id_value text; mesocycle_week_value integer; planned_session_id_value text;
  canonical jsonb; target integer; completed_count integer; streak integer; planned_count integer; complete_count integer; perfect_count integer;
begin
  if not public.reward_attempt_shape(attempt_input, actor) then raise exception 'invalid training attempt input'; end if;
  attempt_id_input := attempt_input ->> 'id';
  select * into current from public.training_states where owner_id = actor for update;
  if exists (select 1 from public.reward_attempts where owner_id = actor and attempt_id = attempt_id_input) then
    return jsonb_build_object('attempt', (select value from jsonb_array_elements(current.attempts) value where value ->> 'id' = attempt_id_input), 'receipt', public.reward_receipt(actor, attempt_id_input));
  end if;
  valid := public.reward_valid_sets(attempt_input); planned := public.reward_planned_sets(attempt_input);
  if planned = 0 then raise exception 'invalid training attempt input'; end if;
  adherence_value := valid::numeric / planned; completed_at_value := (attempt_input ->> 'completedAt')::timestamptz; week_value := date_trunc('week', completed_at_value at time zone 'UTC')::date;
  lineage := attempt_input -> 'lineage';
  if jsonb_typeof(lineage) = 'object' and public.training_state_nonempty_text(lineage -> 'mesocycleId') and public.training_state_nonempty_text(lineage -> 'plannedSessionId') and coalesce((lineage ->> 'weekNumber') ~ '^[1-9][0-9]*$', false) then
    mesocycle_id_value := lineage ->> 'mesocycleId'; mesocycle_week_value := (lineage ->> 'weekNumber')::integer; planned_session_id_value := lineage ->> 'plannedSessionId';
    if not exists (select 1 from public.reward_planned_session_ids(actor, mesocycle_id_value, mesocycle_week_value) where session_id = planned_session_id_value) then raise exception 'invalid planned session lineage'; end if;
  end if;
  insert into public.reward_wallets(owner_id) values (actor) on conflict do nothing;
  insert into public.reward_attempts values (actor, attempt_id_input, completed_at_value, week_value, adherence_value, valid, planned, mesocycle_id_value, mesocycle_week_value, planned_session_id_value);
  canonical := attempt_input || jsonb_build_object(
    'completion', jsonb_build_object('validSets', valid, 'plannedSets', planned, 'adherence', adherence_value, 'displayPercent', round(adherence_value * 100), 'status', case when adherence_value < .7 then 'partial' when adherence_value < 1 then 'completed' else 'fully-completed' end),
    'reward', jsonb_build_object('setGems', least(valid, 12), 'completionGems', case when adherence_value >= 1 then 10 when adherence_value >= .7 then 4 else 0 end, 'fullCompletionBonus', case when adherence_value >= 1 then 6 else 0 end, 'totalGems', least(valid, 12) + case when adherence_value >= 1 then 16 when adherence_value >= .7 then 4 else 0 end, 'qualifiesForCompletion', adherence_value >= .7),
    'rewardApplication', jsonb_build_object('id', format('%s:%s:v1', actor, attempt_id_input), 'state', 'applied', 'appliedAt', now())
  );
  perform public.reward_add_entry(actor, 'attempt:' || attempt_id_input || ':sets', least(valid, 12), 'valid_sets', attempt_id_input, jsonb_build_object('validSets', valid));
  if adherence_value >= .7 then
    perform public.reward_add_entry(actor, 'attempt:' || attempt_id_input || ':completion', case when adherence_value = 1 then 10 else 4 end, 'routine_completion', attempt_id_input, jsonb_build_object('adherence', adherence_value));
  end if;
  if adherence_value = 1 then perform public.reward_add_entry(actor, 'attempt:' || attempt_id_input || ':perfection', 6, 'perfection', attempt_id_input); end if;
  if adherence_value >= .7 then
    insert into public.reward_weekly_goals(owner_id, week_start, target) values (actor, week_value, public.reward_week_target(actor, lineage)) on conflict do nothing;
    select goal.target into target from public.reward_weekly_goals goal where goal.owner_id = actor and goal.week_start = week_value;
    select count(*) into completed_count from public.reward_attempts where owner_id = actor and week_start = week_value and adherence >= .7;
    if completed_count >= target then
      update public.reward_weekly_goals set reached_at = coalesce(reached_at, now()) where owner_id = actor and week_start = week_value;
      perform public.reward_add_entry(actor, format('weekly:%s:target', week_value), 25, 'weekly_goal', attempt_id_input);
      if completed_count > target and completed_count <= target + 2 then perform public.reward_add_entry(actor, format('weekly:%s:extra:%s', week_value, completed_count), 10, 'weekly_extra', attempt_id_input); end if;
      select count(*) into streak from public.reward_weekly_goals goal where goal.owner_id = actor and goal.reached_at is not null and goal.week_start <= week_value and not exists (select 1 from generate_series(goal.week_start + 7, week_value, interval '7 days') missing(week_start) left join public.reward_weekly_goals present on present.owner_id = actor and present.week_start = missing.week_start::date and present.reached_at is not null where present.week_start is null);
      if streak >= 2 then perform public.reward_add_entry(actor, format('weekly:%s:streak', week_value), case when streak = 2 then 5 when streak = 3 then 10 else 15 end, 'weekly_streak', attempt_id_input, jsonb_build_object('weeks', streak)); end if;
    end if;
  end if;
  if mesocycle_id_value is not null then
    select count(*) into planned_count from public.reward_planned_session_ids(actor, mesocycle_id_value, mesocycle_week_value);
    select count(*), count(*) filter (where adherence = 1) into complete_count, perfect_count from public.reward_attempts where owner_id = actor and mesocycle_id = mesocycle_id_value and mesocycle_week = mesocycle_week_value and adherence >= .7;
    if planned_count > 0 and complete_count >= planned_count and perfect_count >= planned_count then perform public.reward_add_entry(actor, format('mesocycle:%s:week:%s:perfect', mesocycle_id_value, mesocycle_week_value), 20, 'mesocycle_perfect_week', attempt_id_input); end if;
    select count(*) into planned_count from public.reward_planned_session_ids(actor, mesocycle_id_value, null);
    select count(*) filter (where adherence >= .7), count(*) filter (where adherence = 1) into complete_count, perfect_count from public.reward_attempts where owner_id = actor and mesocycle_id = mesocycle_id_value;
    if planned_count > 0 and complete_count >= planned_count then perform public.reward_add_entry(actor, format('mesocycle:%s:complete', mesocycle_id_value), 80, 'mesocycle_complete', attempt_id_input); end if;
    if planned_count > 0 and perfect_count >= planned_count then perform public.reward_add_entry(actor, format('mesocycle:%s:perfect', mesocycle_id_value), 70, 'mesocycle_perfect', attempt_id_input); end if;
  end if;
  update public.training_states set attempts = jsonb_build_array(canonical) || coalesce(current.attempts, '[]'::jsonb), active_workout_draft = null, updated_at = now() where owner_id = actor;
  if not found then insert into public.training_states(owner_id, attempts) values (actor, jsonb_build_array(canonical)); end if;
  return jsonb_build_object('attempt', canonical, 'receipt', public.reward_receipt(actor, attempt_id_input));
end;
$$;

create or replace function public.training_state_valid_attempts(items jsonb, actor uuid)
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
      or (
        item.value -> 'reward' <> '{"setGems":0,"completionGems":0,"fullCompletionBonus":0,"totalGems":0,"qualifiesForCompletion":false}'::jsonb
        and not exists (
          select 1 from public.reward_attempts attempt
          where attempt.owner_id = actor and attempt.attempt_id = item.value ->> 'id'
            and (item.value -> 'completion' ->> 'validSets')::integer = attempt.valid_sets
            and (item.value -> 'completion' ->> 'plannedSets')::integer = attempt.planned_sets
            and (item.value -> 'reward' ->> 'setGems')::integer = least(attempt.valid_sets, 12)
            and (item.value -> 'reward' ->> 'completionGems')::integer = case when attempt.adherence = 1 then 10 when attempt.adherence >= .7 then 4 else 0 end
            and (item.value -> 'reward' ->> 'fullCompletionBonus')::integer = case when attempt.adherence = 1 then 6 else 0 end
        )
      )
  )
$$;

create function public.load_reward_wallet()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('balance', coalesce(wallet.balance, 0), 'purchasedThemeIds', coalesce(wallet.purchased_theme_ids, '[]'::jsonb), 'equippedThemeId', wallet.equipped_theme_id, 'combineWithPartner', coalesce(wallet.combine_with_partner, false))
  from (select public.require_actor() as actor) auth left join public.reward_wallets wallet on wallet.owner_id = auth.actor
$$;

create function public.purchase_reward_theme(theme_id_input text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); price_value integer; wallet public.reward_wallets%rowtype;
begin
  select price into price_value from public.reward_theme_catalog where theme_id = theme_id_input;
  if price_value is null then raise exception 'unknown theme'; end if;
  insert into public.reward_wallets(owner_id) values (actor) on conflict do nothing;
  select * into wallet from public.reward_wallets where owner_id = actor for update;
  if wallet.purchased_theme_ids @> jsonb_build_array(theme_id_input) then return public.load_reward_wallet(); end if;
  if wallet.balance < price_value then raise exception 'insufficient reward balance'; end if;
  update public.reward_wallets set balance = balance - price_value, purchased_theme_ids = purchased_theme_ids || jsonb_build_array(theme_id_input), equipped_theme_id = theme_id_input where owner_id = actor;
  insert into public.reward_ledger_entries(owner_id, idempotency_key, amount, kind, breakdown)
  values (actor, format('purchase:%s', theme_id_input), -price_value, 'theme_purchase', jsonb_build_object('themeId', theme_id_input));
  return public.load_reward_wallet();
end;
$$;

create function public.update_reward_wallet_preferences(equipped_theme_id_input text default null, combine_with_partner_input boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  insert into public.reward_wallets(owner_id) values (actor) on conflict do nothing;
  if equipped_theme_id_input is not null and equipped_theme_id_input not like 'profile-%' and not exists (select 1 from public.reward_wallets where owner_id = actor and purchased_theme_ids @> jsonb_build_array(equipped_theme_id_input)) then raise exception 'theme is not owned'; end if;
  update public.reward_wallets set equipped_theme_id = equipped_theme_id_input, combine_with_partner = combine_with_partner_input where owner_id = actor;
  return public.load_reward_wallet();
end;
$$;

alter table public.reward_wallets enable row level security;
alter table public.reward_ledger_entries enable row level security;
alter table public.reward_attempts enable row level security;
alter table public.reward_weekly_goals enable row level security;
alter table public.reward_theme_catalog enable row level security;
revoke all on public.reward_wallets, public.reward_ledger_entries, public.reward_attempts, public.reward_weekly_goals, public.reward_theme_catalog from anon, authenticated;
revoke all on function public.reward_add_entry(uuid, text, integer, text, text, jsonb), public.reward_attempt_shape(jsonb, uuid), public.reward_valid_sets(jsonb), public.reward_planned_sets(jsonb), public.reward_planned_session_ids(uuid, text, integer), public.reward_week_target(uuid, jsonb), public.reward_receipt(uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_training_attempt(jsonb), public.load_reward_wallet(), public.purchase_reward_theme(text), public.update_reward_wallet_preferences(text, boolean) from public, anon;
grant execute on function public.finalize_training_attempt(jsonb), public.load_reward_wallet(), public.purchase_reward_theme(text), public.update_reward_wallet_preferences(text, boolean) to authenticated;
