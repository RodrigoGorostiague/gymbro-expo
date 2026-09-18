-- A mesocycle completion is a server-owned XP milestone, independent from gems.
alter table public.experience_ledger_entries
  drop constraint experience_ledger_entries_kind_check;

alter table public.experience_ledger_entries
  add constraint experience_ledger_entries_kind_check
  check (kind in ('valid_sets', 'completion', 'perfection', 'weekly_target', 'personal_record', 'mesocycle_completion'));

create function public.can_complete_mesocycle(actor uuid, mesocycle jsonb)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.reward_attempts attempt
    where attempt.owner_id = actor and attempt.mesocycle_id = mesocycle ->> 'id'
  ) and not exists (
    select 1
    from jsonb_array_elements(mesocycle -> 'weeks') week(value)
    cross join lateral jsonb_array_elements(week.value -> 'entries') with ordinality entry(value, day_index)
    where coalesce(entry.value ->> 'kind', '') <> 'rest'
      and mesocycle ->> 'startDate' ~ '^\d{4}-\d{2}-\d{2}$'
      and ((mesocycle ->> 'startDate')::date + (((week.value ->> 'weekNumber')::integer - 1) * 7) + ((entry.day_index - 1)::integer)) > current_date
  )
$$;

create or replace function public.save_training_library(routines_input jsonb default null, mesocycles_input jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  next_routines jsonb;
  next_mesocycles jsonb;
  current_mesocycles jsonb;
begin
  select coalesce(routines_input, routines), coalesce(mesocycles_input, mesocycles), mesocycles
  into next_routines, next_mesocycles, current_mesocycles
  from public.training_libraries where owner_id = actor;

  next_routines := coalesce(next_routines, routines_input, '[]'::jsonb);
  next_mesocycles := coalesce(next_mesocycles, mesocycles_input, '[]'::jsonb);
  current_mesocycles := coalesce(current_mesocycles, '[]'::jsonb);

  if not public.training_library_valid_routines(next_routines)
    or next_routines is distinct from public.sanitize_training_routines(next_routines)
    or next_mesocycles is distinct from public.sanitize_training_mesocycles(next_mesocycles, next_routines) then
    raise exception 'invalid training library input';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(next_mesocycles) candidate(value)
    left join lateral (
      select value from jsonb_array_elements(current_mesocycles) existing(value)
      where existing.value ->> 'id' = candidate.value ->> 'id'
    ) existing on true
    where candidate.value ->> 'status' = 'completed'
      and coalesce(existing.value ->> 'status', '') <> 'completed'
      and not public.can_complete_mesocycle(actor, candidate.value)
  ) then
    raise exception 'mesocycle cannot be completed yet';
  end if;

  insert into public.training_libraries (owner_id, routines, mesocycles)
  values (actor, next_routines, next_mesocycles)
  on conflict (owner_id) do update set
    routines = excluded.routines,
    mesocycles = excluded.mesocycles,
    updated_at = now();
end;
$$;

alter function public.finalize_training_attempt(jsonb) rename to finalize_training_attempt_without_mesocycle_xp;
revoke all on function public.finalize_training_attempt_without_mesocycle_xp(jsonb) from public, anon, authenticated;

create function public.finalize_training_attempt(attempt_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  result jsonb;
  attempt_id_input text;
  mesocycle_id_value text;
  planned_count integer;
  completed_count integer;
  base_xp integer;
  bonus_xp integer;
  progress public.experience_progress%rowtype;
  xp_left integer;
  rank_before text;
  prior_receipt jsonb;
  next_receipt jsonb;
begin
  result := public.finalize_training_attempt_without_mesocycle_xp(attempt_input);
  attempt_id_input := result -> 'attempt' ->> 'id';
  mesocycle_id_value := result -> 'attempt' -> 'lineage' ->> 'mesocycleId';
  if mesocycle_id_value is null then return result; end if;

  select count(*) into planned_count from public.reward_planned_session_ids(actor, mesocycle_id_value, null);
  select count(*) into completed_count
  from public.reward_attempts
  where owner_id = actor and mesocycle_id = mesocycle_id_value and adherence >= .7;
  if planned_count = 0 or completed_count < planned_count
    or exists (select 1 from public.experience_ledger_entries where owner_id = actor and idempotency_key = format('mesocycle:%s:xp-completion', mesocycle_id_value)) then
    return result;
  end if;

  select coalesce(sum(entry.amount), 0)::integer into base_xp
  from public.experience_ledger_entries entry
  join public.experience_attempts attempt on attempt.owner_id = entry.owner_id and attempt.attempt_id = entry.attempt_id
  join public.reward_attempts reward on reward.owner_id = attempt.owner_id and reward.attempt_id = attempt.attempt_id
  where entry.owner_id = actor
    and entry.kind <> 'mesocycle_completion'
    and reward.mesocycle_id = mesocycle_id_value
    and reward.adherence >= .7;
  bonus_xp := floor(base_xp * .25)::integer + 150;

  select * into progress from public.experience_progress where owner_id = actor for update;
  rank_before := public.experience_rank(progress.level);
  xp_left := bonus_xp;
  while xp_left > 0 loop
    if progress.xp_into_level + xp_left < public.experience_xp_for_level(progress.level) then
      progress.xp_into_level := progress.xp_into_level + xp_left;
      xp_left := 0;
    else
      xp_left := xp_left - (public.experience_xp_for_level(progress.level) - progress.xp_into_level);
      progress.xp_into_level := 0;
      progress.level := progress.level + 1;
    end if;
  end loop;
  insert into public.experience_ledger_entries(owner_id, idempotency_key, attempt_id, amount, kind, breakdown)
  values (actor, format('mesocycle:%s:xp-completion', mesocycle_id_value), attempt_id_input, bonus_xp, 'mesocycle_completion',
    jsonb_build_object('base_xp', base_xp, 'rate', .25, 'fixed_xp', 150));
  progress.total_xp := progress.total_xp + bonus_xp;
  update public.experience_progress set level = progress.level, xp_into_level = progress.xp_into_level, total_xp = progress.total_xp where owner_id = actor;
  if public.experience_rank(progress.level) is distinct from rank_before then
    insert into public.community_activities(author_id, kind, source_key, payload)
    values (actor, 'rank_up', format('rank-up:%s', public.experience_rank(progress.level)), jsonb_build_object('level', progress.level, 'rank', public.experience_rank(progress.level)))
    on conflict (author_id, source_key) do nothing;
  end if;

  prior_receipt := result -> 'experience_receipt';
  next_receipt := prior_receipt || jsonb_build_object(
    'earned_xp', coalesce((prior_receipt ->> 'earned_xp')::integer, 0) + bonus_xp,
    'entries', coalesce(prior_receipt -> 'entries', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'kind', 'mesocycle_completion', 'amount', bonus_xp,
      'breakdown', jsonb_build_object('base_xp', base_xp, 'rate', .25, 'fixed_xp', 150)
    )),
    'progress', public.experience_progress_payload(progress)
  );
  update public.experience_receipts set receipt = next_receipt where owner_id = actor and attempt_id = attempt_id_input;
  return result || jsonb_build_object('experience_receipt', next_receipt, 'experience_progress', next_receipt -> 'progress');
end;
$$;

revoke all on function public.can_complete_mesocycle(uuid, jsonb), public.finalize_training_attempt(jsonb) from public, anon;
grant execute on function public.finalize_training_attempt(jsonb) to authenticated;
