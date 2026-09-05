create or replace function public.training_library_valid_mesocycle(mesocycle jsonb, routines jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(mesocycle) = 'object'
    and public.training_library_nonempty_text(mesocycle -> 'id')
    and public.training_library_nonempty_text(mesocycle -> 'name')
    and mesocycle ->> 'status' in ('draft', 'scheduled', 'active', 'completed', 'paused', 'cancelled', 'archived')
    and jsonb_typeof(mesocycle -> 'durationWeeks') = 'number'
    and (mesocycle ->> 'durationWeeks') ~ '^[1-9][0-9]*$'
    and jsonb_typeof(mesocycle -> 'createdAt') = 'string'
    and jsonb_typeof(mesocycle -> 'weeks') = 'array'
    and not exists (
      select 1 from jsonb_array_elements(mesocycle -> 'weeks') as week(value)
      where jsonb_typeof(week.value) <> 'object'
        or not public.training_library_nonempty_text(week.value -> 'id')
        or jsonb_typeof(week.value -> 'weekNumber') <> 'number'
        or (week.value ->> 'weekNumber') !~ '^[1-9][0-9]*$'
        or jsonb_typeof(week.value -> 'entries') <> 'array'
        or jsonb_array_length(week.value -> 'entries') > 7
        or exists (
          select 1 from jsonb_array_elements(week.value -> 'entries') as entry(value)
          where jsonb_typeof(entry.value) <> 'object'
            or not public.training_library_nonempty_text(entry.value -> 'id')
            or (
              coalesce(entry.value ->> 'kind', '') <> 'rest'
              and (
                jsonb_typeof(entry.value -> 'ref') <> 'object'
                or not public.training_library_nonempty_text(entry.value -> 'ref' -> 'routineId')
                or not public.training_library_nonempty_text(entry.value -> 'ref' -> 'routineName')
                or entry.value -> 'ref' ->> 'source' not in ('local', 'shared')
                or not exists (
                  select 1 from jsonb_array_elements(case when jsonb_typeof(routines) = 'array' then routines else '[]'::jsonb end) as routine(value)
                  where routine.value ->> 'id' = entry.value -> 'ref' ->> 'routineId'
                )
              )
            )
        )
    )
$$;

create or replace function public.can_complete_mesocycle(actor uuid, mesocycle jsonb)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.reward_attempts attempt where attempt.owner_id = actor and attempt.mesocycle_id = mesocycle ->> 'id')
  and not exists (
    select 1
    from jsonb_array_elements(mesocycle -> 'weeks') week(value)
    cross join lateral jsonb_array_elements(week.value -> 'entries') with ordinality entry(value, day_index)
    where coalesce(entry.value ->> 'kind', '') <> 'rest'
      and mesocycle ->> 'startDate' ~ '^\d{4}-\d{2}-\d{2}$'
      and ((mesocycle ->> 'startDate')::date + (((week.value ->> 'weekNumber')::integer - 1) * 7) + ((entry.day_index - 1)::integer) +
        (case when exists (select 1 from jsonb_array_elements(case when jsonb_typeof(mesocycle -> 'lifecycleHistory') = 'array' then mesocycle -> 'lifecycleHistory' else '[]'::jsonb end) event(value) where event.value ->> 'type' = 'resumed')
          then (case when entry.value ->> 'scheduleShiftDays' ~ '^[0-9]+$' then (entry.value ->> 'scheduleShiftDays')::integer else 0 end)
            + coalesce((select sum((event.value ->> 'shiftDays')::integer) from jsonb_array_elements(mesocycle -> 'lifecycleHistory') event(value)
              where event.value ->> 'type' = 'resumed' and event.value ->> 'shiftDays' ~ '^[0-9]+$'
                and jsonb_typeof(event.value -> 'shiftedPlannedSessionIds') = 'array' and (event.value -> 'shiftedPlannedSessionIds') ? (entry.value ->> 'id')), 0)
          else case when mesocycle ->> 'scheduleShiftDays' ~ '^[0-9]+$' then (mesocycle ->> 'scheduleShiftDays')::integer else 0 end end)::integer) > current_date
  )
$$;

create function public.lock_training_library_for_reward_attempt()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.mesocycle_id is not null then
    if btrim(new.mesocycle_id) = '' then raise exception 'invalid planned session lineage'; end if;
    perform 1
    from public.training_libraries library
    where library.owner_id = new.owner_id
      and exists (
        select 1 from jsonb_array_elements(library.mesocycles) mesocycle(value)
        where mesocycle.value ->> 'id' = new.mesocycle_id
      )
    for key share;
    if not found then raise exception 'invalid planned session lineage'; end if;
  end if;
  return new;
end;
$$;

revoke all on function public.lock_training_library_for_reward_attempt() from public, anon, authenticated;

create trigger reward_attempts_lock_training_library
before insert on public.reward_attempts
for each row execute function public.lock_training_library_for_reward_attempt();

create or replace function public.save_training_library(routines_input jsonb default null, mesocycles_input jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); next_routines jsonb; next_mesocycles jsonb; current_mesocycles jsonb;
begin
  select coalesce(routines_input, routines), coalesce(mesocycles_input, mesocycles), mesocycles
  into next_routines, next_mesocycles, current_mesocycles
  from public.training_libraries where owner_id = actor
  for update;
  next_routines := coalesce(next_routines, routines_input, '[]'::jsonb);
  next_mesocycles := coalesce(next_mesocycles, mesocycles_input, '[]'::jsonb);
  current_mesocycles := coalesce(current_mesocycles, '[]'::jsonb);

  if not public.training_library_valid_routines(next_routines) or next_routines is distinct from public.sanitize_training_routines(next_routines)
    or next_mesocycles is distinct from public.sanitize_training_mesocycles(next_mesocycles, next_routines) then raise exception 'invalid training library input'; end if;
  if exists (
    select 1 from jsonb_array_elements(next_mesocycles) candidate(value)
    where (candidate.value ->> 'durationWeeks')::integer > 52
      and not exists (select 1 from jsonb_array_elements(current_mesocycles) existing(value) where existing.value ->> 'id' = candidate.value ->> 'id'
        and existing.value ->> 'durationWeeks' ~ '^[1-9][0-9]*$' and (existing.value ->> 'durationWeeks')::integer >= (candidate.value ->> 'durationWeeks')::integer)
  ) then raise exception 'invalid training library input'; end if;
  if exists (
    select 1 from jsonb_array_elements(next_mesocycles) candidate(value)
    left join lateral (select value from jsonb_array_elements(current_mesocycles) existing(value) where existing.value ->> 'id' = candidate.value ->> 'id') existing on true
    where candidate.value ->> 'status' = 'completed' and coalesce(existing.value ->> 'status', '') <> 'completed' and not public.can_complete_mesocycle(actor, candidate.value)
  ) then raise exception 'mesocycle cannot be completed yet'; end if;
  if mesocycles_input is not null then
    if exists (
      select 1 from jsonb_array_elements(current_mesocycles) existing(value)
      where not coalesce(public.training_library_nonempty_text(existing.value -> 'id'), false)
    ) or exists (
      select 1 from jsonb_array_elements(current_mesocycles) existing(value)
      group by existing.value ->> 'id' having count(*) > 1
    ) then raise exception 'invalid training library input'; end if;
    if exists (
      select 1
      from jsonb_array_elements(current_mesocycles) existing(value)
      where (
          existing.value ->> 'status' in ('completed', 'cancelled', 'archived')
          or exists (
            select 1 from public.reward_attempts attempt
            where attempt.owner_id = actor and attempt.mesocycle_id = existing.value ->> 'id'
          )
        )
        and not exists (
          select 1 from jsonb_array_elements(next_mesocycles) candidate(value)
          where candidate.value ->> 'id' = existing.value ->> 'id'
        )
    ) then raise exception 'protected mesocycle cannot be deleted'; end if;
  end if;

  insert into public.training_libraries (owner_id, routines, mesocycles)
  values (actor, next_routines, next_mesocycles)
  on conflict (owner_id) do update set routines = excluded.routines, mesocycles = excluded.mesocycles, updated_at = now();
end;
$$;
