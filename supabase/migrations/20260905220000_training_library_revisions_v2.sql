alter table public.training_libraries
  add column routines_revision bigint not null default 0
    constraint training_libraries_routines_revision_nonnegative check (routines_revision >= 0),
  add column mesocycles_revision bigint not null default 0
    constraint training_libraries_mesocycles_revision_nonnegative check (mesocycles_revision >= 0);

create function private.bump_training_library_revisions()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.routines_revision := case when new.routines is distinct from '[]'::jsonb then 1 else 0 end;
    new.mesocycles_revision := case when new.mesocycles is distinct from '[]'::jsonb then 1 else 0 end;
    return new;
  end if;

  if new.routines is distinct from old.routines then
    new.routines_revision := old.routines_revision + 1;
  elsif new.routines_revision <> old.routines_revision + 1 then
    new.routines_revision := old.routines_revision;
  end if;

  if new.mesocycles is distinct from old.mesocycles then
    new.mesocycles_revision := old.mesocycles_revision + 1;
  elsif new.mesocycles_revision <> old.mesocycles_revision + 1 then
    new.mesocycles_revision := old.mesocycles_revision;
  end if;

  return new;
end;
$$;

revoke all on function private.bump_training_library_revisions() from public, anon, authenticated;

create function private.training_content_lineage_valid(content jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when not (content ?| array['version', 'versionOf', 'previousVersionId']) then true
    else content ? 'version'
      and jsonb_typeof(content -> 'version') = 'number'
      and content ->> 'version' ~ '^[1-9][0-9]*$'
      and (content ->> 'version')::numeric <= 2147483647
      and (not content ? 'versionOf' or coalesce(public.training_library_nonempty_text(content -> 'versionOf'), false))
      and (not content ? 'previousVersionId' or coalesce(public.training_library_nonempty_text(content -> 'previousVersionId'), false))
      and (
        (content ->> 'version')::integer = 1
        or (
          content ?& array['versionOf', 'previousVersionId']
          and content ->> 'versionOf' <> content ->> 'id'
          and content ->> 'previousVersionId' <> content ->> 'id'
        )
      )
  end
$$;

create function private.training_mesocycle_transition_valid(previous_status text, next_status text)
returns boolean language sql immutable set search_path = '' as $$
  select previous_status = next_status or case previous_status
    when 'draft' then next_status in ('scheduled', 'active')
    when 'scheduled' then next_status in ('active', 'cancelled')
    when 'active' then next_status in ('paused', 'completed', 'cancelled')
    when 'paused' then next_status in ('active', 'cancelled')
    else false
  end
$$;

revoke all on function private.training_content_lineage_valid(jsonb),
  private.training_mesocycle_transition_valid(text, text)
from public, anon, authenticated;

create trigger training_libraries_bump_revisions
before insert or update on public.training_libraries
for each row execute function private.bump_training_library_revisions();

create function public.load_routines_v2()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('revision', library.routines_revision, 'items', library.routines)
  from public.training_libraries library
  where library.owner_id = public.require_actor()
  union all
  select jsonb_build_object('revision', 0, 'items', '[]'::jsonb)
  where not exists (
    select 1 from public.training_libraries where owner_id = public.require_actor()
  )
  limit 1
$$;

create function public.load_mesocycles_v2()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('revision', library.mesocycles_revision, 'items', library.mesocycles)
  from public.training_libraries library
  where library.owner_id = public.require_actor()
  union all
  select jsonb_build_object('revision', 0, 'items', '[]'::jsonb)
  where not exists (
    select 1 from public.training_libraries where owner_id = public.require_actor()
  )
  limit 1
$$;

create function public.save_routines_v2(input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  expected_revision bigint;
  next_routines jsonb;
  current_library public.training_libraries%rowtype;
begin
  if input is null
    or jsonb_typeof(input) <> 'object'
    or not input ?& array['expectedRevision', 'items']
    or exists (select 1 from jsonb_object_keys(input) key where key <> all(array['expectedRevision', 'items']))
    or jsonb_typeof(input -> 'expectedRevision') <> 'number'
    or (input ->> 'expectedRevision') !~ '^(0|[1-9][0-9]*)$'
    or (input ->> 'expectedRevision')::numeric > 9223372036854775807
    or jsonb_typeof(input -> 'items') <> 'array' then
    raise exception 'invalid training library input';
  end if;

  expected_revision := (input ->> 'expectedRevision')::bigint;
  next_routines := input -> 'items';

  select * into current_library
  from public.training_libraries
  where owner_id = actor
  for update;

  if not found then
    if expected_revision <> 0 then
      return jsonb_build_object(
        'status', 'conflict',
        'current', jsonb_build_object('revision', 0, 'items', '[]'::jsonb)
      );
    end if;
    insert into public.training_libraries (owner_id)
    values (actor)
    on conflict (owner_id) do nothing;
    select * into current_library
    from public.training_libraries
    where owner_id = actor
    for update;
  end if;

  if current_library.routines_revision <> expected_revision then
    return jsonb_build_object(
      'status', 'conflict',
      'current', jsonb_build_object('revision', current_library.routines_revision, 'items', current_library.routines)
    );
  end if;

  if not public.training_library_valid_routines(next_routines)
    or next_routines is distinct from public.sanitize_training_routines(next_routines)
    or exists (
      select 1 from jsonb_array_elements(next_routines) candidate(value)
      where not private.training_content_lineage_valid(candidate.value)
    )
    or current_library.mesocycles is distinct from public.sanitize_training_mesocycles(current_library.mesocycles, next_routines) then
    raise exception 'invalid training library input';
  end if;

  update public.training_libraries
  set routines = next_routines,
      routines_revision = current_library.routines_revision + 1,
      updated_at = now()
  where owner_id = actor
  returning * into current_library;

  return jsonb_build_object(
    'status', 'saved',
    'collection', jsonb_build_object('revision', current_library.routines_revision, 'items', current_library.routines)
  );
end;
$$;

create function public.save_mesocycles_v2(input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  expected_revision bigint;
  next_mesocycles jsonb;
  current_library public.training_libraries%rowtype;
begin
  if input is null
    or jsonb_typeof(input) <> 'object'
    or not input ?& array['expectedRevision', 'items']
    or exists (select 1 from jsonb_object_keys(input) key where key <> all(array['expectedRevision', 'items']))
    or jsonb_typeof(input -> 'expectedRevision') <> 'number'
    or (input ->> 'expectedRevision') !~ '^(0|[1-9][0-9]*)$'
    or (input ->> 'expectedRevision')::numeric > 9223372036854775807
    or jsonb_typeof(input -> 'items') <> 'array' then
    raise exception 'invalid training library input';
  end if;

  expected_revision := (input ->> 'expectedRevision')::bigint;
  next_mesocycles := input -> 'items';

  select * into current_library
  from public.training_libraries
  where owner_id = actor
  for update;

  if not found then
    if expected_revision <> 0 then
      return jsonb_build_object(
        'status', 'conflict',
        'current', jsonb_build_object('revision', 0, 'items', '[]'::jsonb)
      );
    end if;
    insert into public.training_libraries (owner_id)
    values (actor)
    on conflict (owner_id) do nothing;
    select * into current_library
    from public.training_libraries
    where owner_id = actor
    for update;
  end if;

  if current_library.mesocycles_revision <> expected_revision then
    return jsonb_build_object(
      'status', 'conflict',
      'current', jsonb_build_object('revision', current_library.mesocycles_revision, 'items', current_library.mesocycles)
    );
  end if;

  if next_mesocycles is distinct from public.sanitize_training_mesocycles(next_mesocycles, current_library.routines) then
    raise exception 'invalid training library input';
  end if;
  if exists (
    select 1 from jsonb_array_elements(next_mesocycles) candidate(value)
    where not private.training_content_lineage_valid(candidate.value)
  ) then
    raise exception 'invalid training library input';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(current_library.mesocycles) existing(value)
    join jsonb_array_elements(next_mesocycles) candidate(value)
      on candidate.value ->> 'id' = existing.value ->> 'id'
    where not private.training_mesocycle_transition_valid(existing.value ->> 'status', candidate.value ->> 'status')
  ) then
    raise exception 'invalid mesocycle lifecycle transition';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(current_library.mesocycles) existing(value)
    join jsonb_array_elements(next_mesocycles) candidate(value)
      on candidate.value ->> 'id' = existing.value ->> 'id'
    where existing.value ->> 'status' in ('completed', 'cancelled', 'archived')
      and candidate.value is distinct from existing.value
  ) then
    raise exception 'protected mesocycle version cannot be mutated';
  end if;
  if exists (
    select 1 from jsonb_array_elements(next_mesocycles) candidate(value)
    where (candidate.value ->> 'durationWeeks')::integer > 52
      and not exists (
        select 1 from jsonb_array_elements(current_library.mesocycles) existing(value)
        where existing.value ->> 'id' = candidate.value ->> 'id'
          and existing.value ->> 'durationWeeks' ~ '^[1-9][0-9]*$'
          and (existing.value ->> 'durationWeeks')::integer >= (candidate.value ->> 'durationWeeks')::integer
      )
  ) then
    raise exception 'invalid training library input';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(next_mesocycles) candidate(value)
    left join lateral (
      select value from jsonb_array_elements(current_library.mesocycles) existing(value)
      where existing.value ->> 'id' = candidate.value ->> 'id'
    ) existing on true
    where candidate.value ->> 'status' = 'completed'
      and coalesce(existing.value ->> 'status', '') <> 'completed'
      and not public.can_complete_mesocycle(actor, candidate.value)
  ) then
    raise exception 'mesocycle cannot be completed yet';
  end if;
  if exists (
    select 1 from jsonb_array_elements(current_library.mesocycles) existing(value)
    where not coalesce(public.training_library_nonempty_text(existing.value -> 'id'), false)
  ) or exists (
    select 1 from jsonb_array_elements(current_library.mesocycles) existing(value)
    group by existing.value ->> 'id' having count(*) > 1
  ) then
    raise exception 'invalid training library input';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(current_library.mesocycles) existing(value)
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
  ) then
    raise exception 'protected mesocycle cannot be deleted';
  end if;

  update public.training_libraries
  set mesocycles = next_mesocycles,
      mesocycles_revision = current_library.mesocycles_revision + 1,
      updated_at = now()
  where owner_id = actor
  returning * into current_library;

  return jsonb_build_object(
    'status', 'saved',
    'collection', jsonb_build_object('revision', current_library.mesocycles_revision, 'items', current_library.mesocycles)
  );
end;
$$;

revoke all on function public.load_routines_v2(), public.load_mesocycles_v2(),
  public.save_routines_v2(jsonb), public.save_mesocycles_v2(jsonb)
from public, anon;
grant execute on function public.load_routines_v2(), public.load_mesocycles_v2(),
  public.save_routines_v2(jsonb), public.save_mesocycles_v2(jsonb)
to authenticated;
