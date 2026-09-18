-- XP is intentionally independent from the spendable reward (gem) wallet.
create table public.experience_progress (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  level integer not null default 1 check (level >= 1),
  xp_into_level integer not null default 0 check (xp_into_level >= 0),
  total_xp integer not null default 0 check (total_xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.experience_ledger_entries (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null,
  attempt_id text not null,
  amount integer not null check (amount >= 0),
  kind text not null check (kind in ('valid_sets', 'completion', 'perfection', 'weekly_target', 'personal_record')),
  breakdown jsonb not null default '{}'::jsonb check (jsonb_typeof(breakdown) = 'object'),
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create table public.experience_attempts (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  attempt_id text not null,
  completed_at timestamptz not null,
  week_start date not null,
  adherence numeric not null check (adherence >= 0 and adherence <= 1),
  valid_sets integer not null check (valid_sets >= 0),
  planned_sets integer not null check (planned_sets > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  primary key (owner_id, attempt_id)
);

create table public.experience_weekly_goals (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  target integer not null check (target > 0),
  reached_at timestamptz,
  primary key (owner_id, week_start)
);

create table public.experience_receipts (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  attempt_id text not null,
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object'),
  created_at timestamptz not null default now(),
  primary key (owner_id, attempt_id)
);

-- This is a generic feed event boundary. Rank-ups are not workout recaps.
create table public.community_activities (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind = 'rank_up'),
  source_key text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (author_id, source_key)
);

create index community_activities_feed_page
  on public.community_activities (created_at desc, id desc);

create trigger experience_progress_updated_at before update on public.experience_progress
for each row execute function public.touch_updated_at();

create function public.experience_xp_for_level(level_input integer)
returns integer language sql immutable set search_path = '' as $$
  select case when level_input >= 1
    then ceil(80 + 20 * power(level_input::numeric, 1.45))::integer
    else null end
$$;

create function public.experience_rank(level_input integer)
returns text language sql immutable set search_path = '' as $$
  select case
    when level_input between 1 and 4 then 'Principiante'
    when level_input between 5 and 9 then 'Intermedio'
    when level_input between 10 and 19 then 'Avanzado'
    when level_input between 20 and 34 then 'GymBro'
    when level_input between 35 and 49 then 'GymRat'
    when level_input between 50 and 69 then 'G-Boom'
    when level_input between 70 and 84 then 'Alfa'
    when level_input >= 85 then 'Sigma'
    else null end
$$;

create function public.experience_progress_payload(progress public.experience_progress)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'level', progress.level,
    'rank', public.experience_rank(progress.level),
    'xp_into_level', progress.xp_into_level,
    'xp_for_next_level', public.experience_xp_for_level(progress.level),
    'total_xp', progress.total_xp
  )
$$;

create function public.load_experience_progress()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  progress public.experience_progress%rowtype;
begin
  insert into public.experience_progress(owner_id) values (actor) on conflict do nothing;
  select * into progress from public.experience_progress where owner_id = actor;
  return public.experience_progress_payload(progress);
end;
$$;

create function public.experience_week_target(actor uuid, lineage jsonb)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare target integer;
begin
  if jsonb_typeof(lineage) = 'object' and public.training_state_nonempty_text(lineage -> 'mesocycleId')
    and coalesce((lineage ->> 'weekNumber') ~ '^[1-9][0-9]*$', false) then
    select count(*) into target
    from public.training_libraries library
    cross join lateral jsonb_array_elements(library.mesocycles) mesocycle(value)
    cross join lateral jsonb_array_elements(mesocycle.value -> 'weeks') week(value)
    cross join lateral jsonb_array_elements(week.value -> 'entries') entry(value)
    where library.owner_id = actor
      and mesocycle.value ->> 'id' = lineage ->> 'mesocycleId'
      and mesocycle.value ->> 'status' = 'active'
      and (week.value ->> 'weekNumber')::integer = (lineage ->> 'weekNumber')::integer
      and coalesce(entry.value ->> 'kind', '') <> 'rest';
  end if;
  return greatest(coalesce(target, 0), 3);
end;
$$;

-- Scores are computed from the immutable set snapshot, never a client PR claim.
create function public.experience_exercise_best_scores(attempt jsonb)
returns table(exercise_key text, mode text, unit text, score numeric)
language sql immutable set search_path = '' as $$
  select lower(btrim(exercise.value ->> 'exerciseId')), performance.value ->> 'mode', performance.value ->> 'unit',
    max((performance.value ->> 'reps')::numeric * case
      when performance.value ->> 'mode' = 'external-load' then (performance.value ->> 'load')::numeric
      when performance.value ->> 'mode' = 'bodyweight' then (performance.value ->> 'bodyweight')::numeric
    end)
  from jsonb_array_elements(attempt -> 'exercises') exercise(value)
  cross join lateral jsonb_array_elements(exercise.value -> 'sets') set_item(value)
  cross join lateral (select set_item.value -> 'result' -> 'performance' as value) performance
  where public.training_state_nonempty_text(exercise.value -> 'exerciseId')
    and set_item.value -> 'result' ->> 'performed' = 'true'
    and jsonb_typeof(performance.value) = 'object'
    and performance.value ->> 'mode' in ('external-load', 'bodyweight')
    and performance.value ->> 'unit' in ('kg', 'lb')
    and coalesce((performance.value ->> 'reps') ~ '^[1-9][0-9]*$', false)
    and coalesce((case when performance.value ->> 'mode' = 'external-load' then performance.value ->> 'load' else performance.value ->> 'bodyweight' end) ~ '^[0-9]+(\.[0-9]+)?$', false)
  group by lower(btrim(exercise.value ->> 'exerciseId')), performance.value ->> 'mode', performance.value ->> 'unit'
$$;

create function public.experience_personal_record_count(actor uuid, attempt jsonb)
returns integer language sql stable security definer set search_path = '' as $$
  with current_scores as (
    select * from public.experience_exercise_best_scores(attempt)
  ), prior_scores as (
    select prior.exercise_key, prior.mode, prior.unit, max(prior.score) as score
    from public.experience_attempts history
    cross join lateral public.experience_exercise_best_scores(history.snapshot) prior
    where history.owner_id = actor
    group by prior.exercise_key, prior.mode, prior.unit
  )
  select count(*)::integer from (
    select current_scores.exercise_key
    from current_scores
    join prior_scores using (exercise_key, mode, unit)
    where current_scores.score > prior_scores.score
    order by current_scores.score - prior_scores.score desc, current_scores.exercise_key
    limit 2
  ) personal_records
$$;

create function public.list_community_activities(cursor text default null, page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  bounded_size integer := least(greatest(coalesce(page_size, 20), 1), 50);
  decoded jsonb; cursor_created_at timestamptz; cursor_id uuid;
  fetched record; activities jsonb := '[]'::jsonb; row_count integer := 0;
  last_created_at timestamptz; last_id uuid;
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
    select activity.id, activity.kind, activity.payload, activity.created_at,
      profile.alias, profile.avatar_id, profile.presentation_theme_id
    from public.community_activities activity
    join public.profiles profile on profile.id = activity.author_id
    where private.is_recap_viewer(actor, activity.author_id)
      and (cursor_id is null or (activity.created_at, activity.id) < (cursor_created_at, cursor_id))
    order by activity.created_at desc, activity.id desc
    limit bounded_size + 1
  loop
    row_count := row_count + 1;
    if row_count <= bounded_size then
      activities := activities || jsonb_build_object(
        'id', fetched.id, 'kind', fetched.kind, 'author_alias', fetched.alias,
        'author_avatar_id', fetched.avatar_id, 'author_theme_id', fetched.presentation_theme_id,
        'payload', fetched.payload, 'created_at', fetched.created_at
      );
      last_created_at := fetched.created_at; last_id := fetched.id;
    end if;
  end loop;
  return jsonb_build_object('activities', activities, 'next_cursor', case when row_count > bounded_size then
    encode(convert_to(jsonb_build_object('c', last_created_at, 'i', last_id)::text, 'UTF8'), 'base64') else null end);
end;
$$;

create or replace function public.finalize_training_attempt(attempt_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor(); current public.training_states%rowtype; attempt_id_input text;
  valid integer; planned integer; adherence_value numeric; completed_at_value timestamptz; week_value date;
  lineage jsonb; mesocycle_id_value text; mesocycle_week_value integer; planned_session_id_value text;
  canonical jsonb; target integer; completed_count integer; streak integer; planned_count integer; complete_count integer; perfect_count integer;
  progress public.experience_progress%rowtype; experience_receipt jsonb; experience_entries jsonb;
  xp_valid integer; xp_completion integer; xp_perfection integer; xp_weekly integer := 0; xp_personal_records integer; xp_pr integer;
  xp_left integer; rank_before text;
begin
  if not public.reward_attempt_shape(attempt_input, actor) then raise exception 'invalid training attempt input'; end if;
  attempt_id_input := attempt_input ->> 'id';
  select * into current from public.training_states where owner_id = actor for update;
  if exists (select 1 from public.experience_receipts where owner_id = actor and attempt_id = attempt_id_input) then
    select receipt into experience_receipt from public.experience_receipts where owner_id = actor and attempt_id = attempt_id_input;
    return jsonb_build_object('attempt', (select value from jsonb_array_elements(current.attempts) value where value ->> 'id' = attempt_id_input), 'receipt', public.reward_receipt(actor, attempt_id_input), 'experience_receipt', experience_receipt, 'experience_progress', experience_receipt -> 'progress');
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
  insert into public.experience_progress(owner_id) values (actor) on conflict do nothing;
  select * into progress from public.experience_progress where owner_id = actor for update;
  -- A concurrent retry can pass the early receipt check before waiting on this lock.
  if exists (select 1 from public.experience_receipts where owner_id = actor and attempt_id = attempt_id_input) then
    select receipt into experience_receipt from public.experience_receipts where owner_id = actor and attempt_id = attempt_id_input;
    return jsonb_build_object('attempt', (select value from jsonb_array_elements(current.attempts) value where value ->> 'id' = attempt_id_input), 'receipt', public.reward_receipt(actor, attempt_id_input), 'experience_receipt', experience_receipt, 'experience_progress', experience_receipt -> 'progress');
  end if;
  insert into public.reward_attempts values (actor, attempt_id_input, completed_at_value, week_value, adherence_value, valid, planned, mesocycle_id_value, mesocycle_week_value, planned_session_id_value);
  canonical := attempt_input || jsonb_build_object(
    'completion', jsonb_build_object('validSets', valid, 'plannedSets', planned, 'adherence', adherence_value, 'displayPercent', round(adherence_value * 100), 'status', case when adherence_value < .7 then 'partial' when adherence_value < 1 then 'completed' else 'fully-completed' end),
    'reward', jsonb_build_object('setGems', least(valid, 12), 'completionGems', case when adherence_value >= 1 then 10 when adherence_value >= .7 then 4 else 0 end, 'fullCompletionBonus', case when adherence_value >= 1 then 6 else 0 end, 'totalGems', least(valid, 12) + case when adherence_value >= 1 then 16 when adherence_value >= .7 then 4 else 0 end, 'qualifiesForCompletion', adherence_value >= .7),
    'rewardApplication', jsonb_build_object('id', format('%s:%s:v1', actor, attempt_id_input), 'state', 'applied', 'appliedAt', now())
  );
  xp_personal_records := public.experience_personal_record_count(actor, canonical);
  insert into public.experience_attempts values (actor, attempt_id_input, completed_at_value, week_value, adherence_value, valid, planned, canonical);
  xp_valid := least(valid, 12) * 2;
  xp_completion := case when adherence_value >= .7 then 12 else 0 end;
  xp_perfection := case when adherence_value = 1 then 18 else 0 end;
  if adherence_value >= .7 then
    insert into public.experience_weekly_goals(owner_id, week_start, target) values (actor, week_value, public.experience_week_target(actor, lineage)) on conflict do nothing;
    select goal.target into target from public.experience_weekly_goals goal where goal.owner_id = actor and goal.week_start = week_value;
    select count(*) into completed_count from public.experience_attempts where owner_id = actor and week_start = week_value and adherence >= .7;
    if completed_count >= target then
      update public.experience_weekly_goals set reached_at = coalesce(reached_at, now()) where owner_id = actor and week_start = week_value;
      if found then xp_weekly := 25; end if;
    end if;
  end if;
  xp_pr := xp_personal_records * 8;
  with components(ordinal, kind, requested_xp) as (
    values (1, 'valid_sets'::text, xp_valid), (2, 'completion'::text, xp_completion),
      (3, 'perfection'::text, xp_perfection), (4, 'weekly_target'::text, xp_weekly),
      (5, 'personal_record'::text, xp_pr)
  ), awarded as (
    select ordinal, kind, requested_xp,
      least(requested_xp, greatest(75 - coalesce(sum(requested_xp) over (order by ordinal rows between unbounded preceding and 1 preceding), 0), 0)) as amount
    from components
  )
  insert into public.experience_ledger_entries(owner_id, idempotency_key, attempt_id, amount, kind, breakdown)
  select actor, format('attempt:%s:%s', attempt_id_input, ordinal), attempt_id_input, amount, kind,
    jsonb_build_object('requested_xp', requested_xp)
  from awarded where amount > 0;
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'amount', amount, 'breakdown', breakdown) order by id), '[]'::jsonb) into experience_entries
  from public.experience_ledger_entries where owner_id = actor and attempt_id = attempt_id_input;
  xp_left := coalesce((select sum(amount) from public.experience_ledger_entries where owner_id = actor and attempt_id = attempt_id_input), 0);
  rank_before := public.experience_rank(progress.level);
  while xp_left > 0 loop
    if progress.xp_into_level + xp_left < public.experience_xp_for_level(progress.level) then
      progress.xp_into_level := progress.xp_into_level + xp_left; xp_left := 0;
    else
      xp_left := xp_left - (public.experience_xp_for_level(progress.level) - progress.xp_into_level);
      progress.xp_into_level := 0; progress.level := progress.level + 1;
    end if;
  end loop;
  if public.experience_rank(progress.level) is distinct from rank_before then
    insert into public.community_activities(author_id, kind, source_key, payload)
    values (actor, 'rank_up', format('rank-up:%s', public.experience_rank(progress.level)), jsonb_build_object('level', progress.level, 'rank', public.experience_rank(progress.level)))
    on conflict (author_id, source_key) do nothing;
  end if;
  progress.total_xp := progress.total_xp + coalesce((select sum(amount) from public.experience_ledger_entries where owner_id = actor and attempt_id = attempt_id_input), 0);
  update public.experience_progress set level = progress.level, xp_into_level = progress.xp_into_level, total_xp = progress.total_xp where owner_id = actor;
  select * into progress from public.experience_progress where owner_id = actor;
  experience_receipt := jsonb_build_object('attempt_id', attempt_id_input, 'earned_xp', coalesce((select sum(amount) from public.experience_ledger_entries where owner_id = actor and attempt_id = attempt_id_input), 0), 'entries', experience_entries, 'progress', public.experience_progress_payload(progress));
  insert into public.experience_receipts(owner_id, attempt_id, receipt) values (actor, attempt_id_input, experience_receipt);
  perform public.reward_add_entry(actor, 'attempt:' || attempt_id_input || ':sets', least(valid, 12), 'valid_sets', attempt_id_input, jsonb_build_object('validSets', valid));
  if adherence_value >= .7 then perform public.reward_add_entry(actor, 'attempt:' || attempt_id_input || ':completion', case when adherence_value = 1 then 10 else 4 end, 'routine_completion', attempt_id_input, jsonb_build_object('adherence', adherence_value)); end if;
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
  return jsonb_build_object('attempt', canonical, 'receipt', public.reward_receipt(actor, attempt_id_input), 'experience_receipt', experience_receipt, 'experience_progress', experience_receipt -> 'progress');
end;
$$;

alter table public.experience_progress enable row level security;
alter table public.experience_ledger_entries enable row level security;
alter table public.experience_attempts enable row level security;
alter table public.experience_weekly_goals enable row level security;
alter table public.experience_receipts enable row level security;
alter table public.community_activities enable row level security;
create policy community_activities_realtime_read on public.community_activities for select to authenticated
using (private.is_recap_viewer(auth.uid(), author_id));

revoke all on public.experience_progress, public.experience_ledger_entries, public.experience_attempts, public.experience_weekly_goals, public.experience_receipts, public.community_activities from anon, authenticated;
revoke all on function public.experience_xp_for_level(integer), public.experience_rank(integer), public.experience_progress_payload(public.experience_progress), public.experience_week_target(uuid, jsonb), public.experience_exercise_best_scores(jsonb), public.experience_personal_record_count(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.load_experience_progress(), public.list_community_activities(text, integer) from public, anon;
grant execute on function public.load_experience_progress(), public.list_community_activities(text, integer) to authenticated;

alter publication supabase_realtime add table public.community_activities;
