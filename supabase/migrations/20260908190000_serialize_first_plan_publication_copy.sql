-- Existing publication migration is already deployed locally: correct it forward.
create or replace function public.copy_plan_publication(publication_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  publication public.plan_publications%rowtype;
  library public.training_libraries%rowtype;
  prior jsonb;
  routine_map jsonb;
  source_routine jsonb;
  copied_routines jsonb := '[]';
  copied_mesocycle jsonb;
  next_routines jsonb;
  next_mesocycles jsonb;
  copied_at timestamptz := now();
  origin jsonb;
begin
  select * into publication from public.plan_publications where id = publication_id for update;
  publication := private.require_plan_publication(publication_id, true);
  if publication.author_id = actor then raise exception 'authors cannot copy their own publication'; end if;
  select copy.imported_ids into prior from public.plan_publication_copies copy
  where copy.publication_id = publication.id and copy.actor_id = actor;
  if prior is not null then return prior; end if;

  -- SELECT FOR UPDATE cannot lock a missing row. Initialize it first so copies
  -- of different publications and CAS saves serialize on the same owner row.
  insert into public.training_libraries(owner_id) values (actor)
  on conflict (owner_id) do nothing;
  select * into library from public.training_libraries where owner_id = actor for update;

  select coalesce(jsonb_object_agg(value ->> 'id', gen_random_uuid()::text), '{}')
  into routine_map from jsonb_array_elements(publication.snapshot -> 'routines');
  origin := jsonb_build_object('publicationId', publication.id, 'sourceAuthorId', publication.author_id,
    'sourceVersionId', publication.source_version_id, 'copiedAt', copied_at);
  for source_routine in select value from jsonb_array_elements(publication.snapshot -> 'routines') loop
    copied_routines := copied_routines || jsonb_set(
      jsonb_set(private.copy_shared_routine(source_routine), '{id}', to_jsonb(routine_map ->> (source_routine ->> 'id'))),
      '{publicationOrigin}', origin, true);
  end loop;
  if publication.content_kind = 'mesocycle' then
    copied_mesocycle := jsonb_set(
      private.copy_shared_mesocycle(publication.snapshot -> 'mesocycle', routine_map)
        - array['startDate', 'pausedAt', 'pausedOn', 'scheduleShiftDays', 'lifecycleHistory'],
      '{publicationOrigin}', origin, true);
  end if;
  next_routines := coalesce(library.routines, '[]') || copied_routines;
  next_mesocycles := coalesce(library.mesocycles, '[]')
    || case when copied_mesocycle is null then '[]' else jsonb_build_array(copied_mesocycle) end;
  if not public.training_library_valid_routines(next_routines)
    or next_mesocycles is distinct from public.sanitize_training_mesocycles(next_mesocycles, next_routines) then
    raise exception 'invalid publication snapshot';
  end if;
  update public.training_libraries
  set routines = next_routines, mesocycles = next_mesocycles, updated_at = now()
  where owner_id = actor;
  prior := jsonb_build_object(
    'routineIds', coalesce((select jsonb_agg(value) from jsonb_each_text(routine_map)), '[]'),
    'mesocycleId', case when copied_mesocycle is null then null else copied_mesocycle ->> 'id' end);
  insert into public.plan_publication_copies values(publication.id, actor, prior, now());
  return prior;
end;
$$;

revoke all on function public.copy_plan_publication(uuid) from public, anon;
grant execute on function public.copy_plan_publication(uuid) to authenticated;
