create table public.private_plan_share_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content_kind text not null check (content_kind in ('routine', 'mesocycle')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  imported_ids jsonb,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> recipient_id),
  check ((status = 'accepted') = (imported_ids is not null))
);

create index private_plan_share_requests_recipient_pending
  on public.private_plan_share_requests (recipient_id, created_at desc)
  where status = 'pending';

create function private.plan_sharing_connected(left_member uuid, right_member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.relationships
    where member_low = least(left_member, right_member)
      and member_high = greatest(left_member, right_member)
  ) and not private.is_blocked_pair(left_member, right_member)
$$;

create function private.copy_shared_routine(routine jsonb)
returns jsonb language plpgsql volatile set search_path = '' as $$
declare exercise jsonb; set_value jsonb; exercises jsonb := '[]'::jsonb; sets jsonb;
begin
  for exercise in select value from jsonb_array_elements(routine -> 'exercises') loop
    sets := '[]'::jsonb;
    for set_value in select value from jsonb_array_elements(exercise -> 'sets') loop
      sets := sets || jsonb_set(set_value, '{id}', to_jsonb(gen_random_uuid()::text));
    end loop;
    exercises := exercises || jsonb_set(
      jsonb_set(exercise, '{id}', to_jsonb(gen_random_uuid()::text)),
      '{sets}', sets
    );
  end loop;
  return jsonb_set(jsonb_set(routine, '{id}', to_jsonb(gen_random_uuid()::text)), '{exercises}', exercises);
end;
$$;

create function private.copy_shared_mesocycle(mesocycle jsonb, routine_ids jsonb)
returns jsonb language plpgsql volatile set search_path = '' as $$
declare week jsonb; entry jsonb; weeks jsonb := '[]'::jsonb; entries jsonb; copied_entry jsonb; copied_ref jsonb;
begin
  for week in select value from jsonb_array_elements(mesocycle -> 'weeks') loop
    entries := '[]'::jsonb;
    for entry in select value from jsonb_array_elements(week -> 'entries') loop
      copied_entry := jsonb_set(entry, '{id}', to_jsonb(gen_random_uuid()::text));
      if coalesce(entry ->> 'kind', '') <> 'rest' then
        copied_ref := jsonb_set(entry -> 'ref', '{routineId}', to_jsonb(routine_ids ->> (entry -> 'ref' ->> 'routineId')));
        copied_ref := jsonb_set(copied_ref, '{source}', '"local"'::jsonb);
        copied_entry := jsonb_set(copied_entry, '{ref}', copied_ref);
      end if;
      entries := entries || copied_entry;
    end loop;
    weeks := weeks || jsonb_set(jsonb_set(week, '{id}', to_jsonb(gen_random_uuid()::text)), '{entries}', entries);
  end loop;
  return jsonb_set(
    jsonb_set(
      jsonb_set(mesocycle - 'startDate', '{id}', to_jsonb(gen_random_uuid()::text)),
      '{status}', '"draft"'::jsonb
    ),
    '{weeks}', weeks
  );
end;
$$;

create function public.get_profile_plan_library(source_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); source_profile public.profiles%rowtype; library public.training_libraries%rowtype;
begin
  if actor = source_profile_id or not private.plan_sharing_connected(actor, source_profile_id) then
    raise exception 'plan library unavailable';
  end if;
  select * into source_profile from public.profiles where id = source_profile_id;
  if not found then raise exception 'plan library unavailable'; end if;
  select * into library from public.training_libraries where owner_id = source_profile_id;
  return jsonb_build_object(
    'routines', case when source_profile.share_routine_template then coalesce(library.routines, '[]'::jsonb) else '[]'::jsonb end,
    'mesocycles', case when source_profile.share_mesocycle_template then coalesce(library.mesocycles, '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

create function public.create_private_plan_share_request(target_profile_id uuid, content_kind_input text, content_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor(); source_profile public.profiles%rowtype; library public.training_libraries%rowtype;
  selected_routine jsonb; selected_mesocycle jsonb; selected_routines jsonb; request_snapshot jsonb; request_id uuid;
begin
  if content_kind_input not in ('routine', 'mesocycle') or content_id is null or btrim(content_id) = '' then
    raise exception 'invalid plan share input';
  end if;
  perform public.lock_pair(actor, target_profile_id);
  if not private.plan_sharing_connected(actor, target_profile_id) then raise exception 'plan share unavailable'; end if;
  select * into source_profile from public.profiles where id = actor for update;
  select * into library from public.training_libraries where owner_id = actor;

  if content_kind_input = 'routine' then
    if not source_profile.share_routine_template then raise exception 'plan share unavailable'; end if;
    select item.value into selected_routine
    from jsonb_array_elements(coalesce(library.routines, '[]'::jsonb)) item(value)
    where item.value ->> 'id' = content_id;
    if selected_routine is null or not public.training_library_valid_routine(selected_routine) then raise exception 'plan unavailable'; end if;
    request_snapshot := jsonb_build_object('routines', jsonb_build_array(selected_routine));
  else
    if not source_profile.share_mesocycle_template then raise exception 'plan share unavailable'; end if;
    select item.value into selected_mesocycle
    from jsonb_array_elements(coalesce(library.mesocycles, '[]'::jsonb)) item(value)
    where item.value ->> 'id' = content_id;
    if selected_mesocycle is null then raise exception 'plan unavailable'; end if;
    select coalesce(jsonb_agg(routine.value order by routine.ordinality), '[]'::jsonb) into selected_routines
    from jsonb_array_elements(coalesce(library.routines, '[]'::jsonb)) with ordinality routine(value, ordinality)
    where exists (
      select 1 from jsonb_array_elements(selected_mesocycle -> 'weeks') week(value)
      cross join lateral jsonb_array_elements(week.value -> 'entries') entry(value)
      where coalesce(entry.value ->> 'kind', '') <> 'rest'
        and entry.value -> 'ref' ->> 'routineId' = routine.value ->> 'id'
    );
    if not public.training_library_valid_routines(selected_routines)
      or not public.training_library_valid_mesocycle(selected_mesocycle, selected_routines) then
      raise exception 'plan unavailable';
    end if;
    request_snapshot := jsonb_build_object('routines', selected_routines, 'mesocycle', selected_mesocycle);
  end if;

  insert into public.private_plan_share_requests (sender_id, recipient_id, content_kind, snapshot)
  values (actor, target_profile_id, content_kind_input, request_snapshot)
  returning id into request_id;
  return request_id;
end;
$$;

create function public.list_received_private_plan_share_requests()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', request.id,
    'senderAlias', profile.alias,
    'contentKind', request.content_kind,
    'snapshot', request.snapshot,
    'createdAt', request.created_at
  ) order by request.created_at desc), '[]'::jsonb)
  from public.private_plan_share_requests request
  join public.profiles profile on profile.id = request.sender_id
  where request.recipient_id = public.require_actor() and request.status = 'pending'
$$;

create function public.accept_private_plan_share_request(request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor(); request public.private_plan_share_requests%rowtype; source_profile public.profiles%rowtype;
  current_library public.training_libraries%rowtype; copied_routines jsonb := '[]'::jsonb; copied_mesocycle jsonb;
  routine_ids jsonb; next_routines jsonb; next_mesocycles jsonb; routine jsonb;
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
    copied_routines := copied_routines || jsonb_set(private.copy_shared_routine(routine), '{id}', to_jsonb(routine_ids ->> (routine ->> 'id')));
  end loop;
  if request.content_kind = 'mesocycle' then
    copied_mesocycle := private.copy_shared_mesocycle(request.snapshot -> 'mesocycle', routine_ids);
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
  ), responded_at = now()
  where id = request.id
  returning imported_ids into request.imported_ids;
  return request.imported_ids;
end;
$$;

create function public.reject_private_plan_share_request(request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  update public.private_plan_share_requests
  set status = 'rejected', responded_at = now()
  where id = request_id and recipient_id = actor and status = 'pending';
  if not found then raise exception 'plan share request unavailable'; end if;
end;
$$;

alter table public.private_plan_share_requests enable row level security;
revoke all on public.private_plan_share_requests from public, anon, authenticated;
revoke all on function private.plan_sharing_connected(uuid, uuid), private.copy_shared_routine(jsonb), private.copy_shared_mesocycle(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.get_profile_plan_library(uuid), public.create_private_plan_share_request(uuid, text, text), public.list_received_private_plan_share_requests(), public.accept_private_plan_share_request(uuid), public.reject_private_plan_share_request(uuid) from public, anon;
grant execute on function public.get_profile_plan_library(uuid), public.create_private_plan_share_request(uuid, text, text), public.list_received_private_plan_share_requests(), public.accept_private_plan_share_request(uuid), public.reject_private_plan_share_request(uuid) to authenticated;
