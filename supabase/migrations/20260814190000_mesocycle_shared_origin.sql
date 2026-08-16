create or replace function public.accept_private_plan_share_request(request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor(); request public.private_plan_share_requests%rowtype; source_profile public.profiles%rowtype;
  current_library public.training_libraries%rowtype; copied_routines jsonb := '[]'::jsonb; copied_mesocycle jsonb;
  routine_ids jsonb; next_routines jsonb; next_mesocycles jsonb; routine jsonb; accepted_at timestamptz := now();
begin
  select * into request from public.private_plan_share_requests where id = request_id for update;
  if not found or request.recipient_id <> actor then raise exception 'plan share request unavailable'; end if;
  if request.status = 'accepted' then return request.imported_ids; end if;
  if request.status <> 'pending' then raise exception 'plan share request unavailable'; end if;

  perform public.lock_pair(actor, request.sender_id);
  if not private.plan_sharing_connected(actor, request.sender_id) then raise exception 'plan share unavailable'; end if;
  select * into source_profile from public.profiles where id = request.sender_id for update;
  if (request.content_kind = 'routine' and not source_profile.share_routine_template)
    or (request.content_kind = 'mesocycle' and not source_profile.share_mesocycle_template) then
    raise exception 'plan share unavailable';
  end if;
  if not public.training_library_valid_routines(request.snapshot -> 'routines')
    or (request.content_kind = 'routine' and request.snapshot ? 'mesocycle')
    or (request.content_kind = 'mesocycle' and not public.training_library_valid_mesocycle(request.snapshot -> 'mesocycle', request.snapshot -> 'routines')) then
    raise exception 'invalid plan share snapshot';
  end if;

  select coalesce(jsonb_object_agg(item.value ->> 'id', gen_random_uuid()::text), '{}'::jsonb) into routine_ids
  from jsonb_array_elements(request.snapshot -> 'routines') item(value);
  for routine in select value from jsonb_array_elements(request.snapshot -> 'routines') loop
    copied_routines := copied_routines || jsonb_set(
      jsonb_set(private.copy_shared_routine(routine), '{id}', to_jsonb(routine_ids ->> (routine ->> 'id'))),
      '{sharedFrom}',
      jsonb_build_object('requestId', request.id, 'senderId', request.sender_id, 'acceptedAt', accepted_at),
      true
    );
  end loop;
  if request.content_kind = 'mesocycle' then
    copied_mesocycle := jsonb_set(
      private.copy_shared_mesocycle(request.snapshot -> 'mesocycle', routine_ids),
      '{sharedFrom}',
      jsonb_build_object('requestId', request.id, 'senderId', request.sender_id, 'acceptedAt', accepted_at),
      true
    );
  end if;

  select * into current_library from public.training_libraries where owner_id = actor for update;
  next_routines := coalesce(current_library.routines, '[]'::jsonb) || copied_routines;
  next_mesocycles := coalesce(current_library.mesocycles, '[]'::jsonb)
    || case when copied_mesocycle is null then '[]'::jsonb else jsonb_build_array(copied_mesocycle) end;
  if not public.training_library_valid_routines(next_routines)
    or next_mesocycles is distinct from public.sanitize_training_mesocycles(next_mesocycles, next_routines) then
    raise exception 'invalid imported plan';
  end if;

  insert into public.training_libraries (owner_id, routines, mesocycles)
  values (actor, next_routines, next_mesocycles)
  on conflict (owner_id) do update set routines = excluded.routines, mesocycles = excluded.mesocycles, updated_at = now();

  update public.private_plan_share_requests
  set status = 'accepted', imported_ids = jsonb_build_object(
    'routineIds', coalesce((select jsonb_agg(value) from jsonb_each_text(routine_ids)), '[]'::jsonb),
    'mesocycleId', case when copied_mesocycle is null then null else copied_mesocycle ->> 'id' end
  ), responded_at = accepted_at
  where id = request.id
  returning imported_ids into request.imported_ids;
  return request.imported_ids;
end;
$$;

with mesocycle_origins as (
  select
    request.recipient_id,
    request.imported_ids ->> 'mesocycleId' as mesocycle_id,
    jsonb_build_object('requestId', request.id, 'senderId', request.sender_id, 'acceptedAt', request.responded_at) as shared_from
  from public.private_plan_share_requests request
  where request.status = 'accepted'
    and request.content_kind = 'mesocycle'
    and request.imported_ids ->> 'mesocycleId' is not null
), rebuilt_mesocycles as (
  select library.owner_id, jsonb_agg(
    case when mesocycle_origins.mesocycle_id is null then mesocycle.value
      else jsonb_set(mesocycle.value, '{sharedFrom}', mesocycle_origins.shared_from, true)
    end
    order by mesocycle.ordinality
  ) as mesocycles
  from public.training_libraries library
  cross join lateral jsonb_array_elements(coalesce(library.mesocycles, '[]'::jsonb)) with ordinality mesocycle(value, ordinality)
  left join mesocycle_origins on mesocycle_origins.recipient_id = library.owner_id and mesocycle_origins.mesocycle_id = mesocycle.value ->> 'id'
  group by library.owner_id
)
update public.training_libraries library
set mesocycles = rebuilt_mesocycles.mesocycles, updated_at = now()
from rebuilt_mesocycles
where library.owner_id = rebuilt_mesocycles.owner_id;

with routine_origins as (
  select
    request.recipient_id,
    imported_routine.id as routine_id,
    jsonb_build_object('requestId', request.id, 'senderId', request.sender_id, 'acceptedAt', request.responded_at) as shared_from
  from public.private_plan_share_requests request
  cross join lateral jsonb_array_elements_text(case when jsonb_typeof(request.imported_ids -> 'routineIds') = 'array' then request.imported_ids -> 'routineIds' else '[]'::jsonb end) imported_routine(id)
  where request.status = 'accepted'
), rebuilt_routines as (
  select library.owner_id, jsonb_agg(
    case when routine_origins.routine_id is null then routine.value
      else jsonb_set(routine.value, '{sharedFrom}', routine_origins.shared_from, true)
    end
    order by routine.ordinality
  ) as routines
  from public.training_libraries library
  cross join lateral jsonb_array_elements(coalesce(library.routines, '[]'::jsonb)) with ordinality routine(value, ordinality)
  left join routine_origins on routine_origins.recipient_id = library.owner_id and routine_origins.routine_id = routine.value ->> 'id'
  group by library.owner_id
)
update public.training_libraries library
set routines = rebuilt_routines.routines, updated_at = now()
from rebuilt_routines
where library.owner_id = rebuilt_routines.owner_id;
