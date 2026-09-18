create function public.training_library_nonempty_text(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'string' and btrim(value #>> '{}') <> ''
$$;

create function public.training_library_valid_routine(routine jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(routine) = 'object'
    and public.training_library_nonempty_text(routine -> 'id')
    and public.training_library_nonempty_text(routine -> 'name')
    and jsonb_typeof(routine -> 'createdAt') = 'string'
    and jsonb_typeof(routine -> 'muscleGroups') = 'array'
    and jsonb_array_length(routine -> 'muscleGroups') > 0
    and jsonb_typeof(routine -> 'exercises') = 'array'
    and not exists (
      select 1 from jsonb_array_elements(routine -> 'exercises') as exercise(value)
      where jsonb_typeof(exercise.value) <> 'object'
        or not public.training_library_nonempty_text(exercise.value -> 'id')
        or not public.training_library_nonempty_text(exercise.value -> 'name')
        or jsonb_typeof(exercise.value -> 'muscleGroups') <> 'array'
        or jsonb_typeof(exercise.value -> 'sets') <> 'array'
    )
$$;

create function public.training_library_valid_routines(routines jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(routines) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(routines) as routine(value)
      where not public.training_library_valid_routine(routine.value)
    )
    and not exists (
      select 1 from jsonb_array_elements(routines) as routine(value)
      group by routine.value ->> 'id' having count(*) > 1
    )
$$;

create function public.training_library_valid_mesocycle(mesocycle jsonb, routines jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(mesocycle) = 'object'
    and public.training_library_nonempty_text(mesocycle -> 'id')
    and public.training_library_nonempty_text(mesocycle -> 'name')
    and mesocycle ->> 'status' in ('draft', 'active', 'completed', 'archived')
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

create function public.sanitize_training_routines(routines jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(routine.value), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(routines) = 'array' then routines else '[]'::jsonb end) as routine(value)
  where public.training_library_valid_routine(routine.value)
    and 1 = (
      select count(*) from jsonb_array_elements(case when jsonb_typeof(routines) = 'array' then routines else '[]'::jsonb end) as candidate(value)
      where candidate.value ->> 'id' = routine.value ->> 'id'
    )
$$;

create function public.sanitize_training_mesocycles(mesocycles jsonb, routines jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(mesocycle.value), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(mesocycles) = 'array' then mesocycles else '[]'::jsonb end) as mesocycle(value)
  where public.training_library_valid_mesocycle(mesocycle.value, routines)
    and 1 = (
      select count(*) from jsonb_array_elements(case when jsonb_typeof(mesocycles) = 'array' then mesocycles else '[]'::jsonb end) as candidate(value)
      where candidate.value ->> 'id' = mesocycle.value ->> 'id'
    )
$$;

with sanitized as (
  select owner_id,
    public.sanitize_training_routines(routines) as routines,
    mesocycles
  from public.training_libraries
)
update public.training_libraries as library
set routines = sanitized.routines,
    mesocycles = public.sanitize_training_mesocycles(sanitized.mesocycles, sanitized.routines)
from sanitized
where library.owner_id = sanitized.owner_id
  and (
    library.routines is distinct from sanitized.routines
    or library.mesocycles is distinct from public.sanitize_training_mesocycles(sanitized.mesocycles, sanitized.routines)
  );

create function public.validate_training_library_row()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.training_library_valid_routines(new.routines)
    or new.routines is distinct from public.sanitize_training_routines(new.routines)
    or new.mesocycles is distinct from public.sanitize_training_mesocycles(new.mesocycles, new.routines) then
    raise exception 'invalid training library input';
  end if;
  return new;
end;
$$;

create trigger training_libraries_validate_content
before insert or update of routines, mesocycles on public.training_libraries
for each row execute function public.validate_training_library_row();

create or replace function public.load_training_library()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('routines', library.routines, 'mesocycles', library.mesocycles)
  from public.training_libraries as library
  where library.owner_id = public.require_actor()
  union all
  select jsonb_build_object('routines', '[]'::jsonb, 'mesocycles', '[]'::jsonb)
  where not exists (select 1 from public.training_libraries where owner_id = public.require_actor())
  limit 1
$$;

create or replace function public.save_training_library(routines_input jsonb default null, mesocycles_input jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  next_routines jsonb;
  next_mesocycles jsonb;
begin
  select coalesce(routines_input, routines), coalesce(mesocycles_input, mesocycles)
  into next_routines, next_mesocycles
  from public.training_libraries where owner_id = actor;

  next_routines := coalesce(next_routines, routines_input, '[]'::jsonb);
  next_mesocycles := coalesce(next_mesocycles, mesocycles_input, '[]'::jsonb);

  if not public.training_library_valid_routines(next_routines)
    or next_routines is distinct from public.sanitize_training_routines(next_routines)
    or next_mesocycles is distinct from public.sanitize_training_mesocycles(next_mesocycles, next_routines) then
    raise exception 'invalid training library input';
  end if;

  insert into public.training_libraries (owner_id, routines, mesocycles)
  values (actor, next_routines, next_mesocycles)
  on conflict (owner_id) do update set
    routines = excluded.routines,
    mesocycles = excluded.mesocycles,
    updated_at = now();
end;
$$;
