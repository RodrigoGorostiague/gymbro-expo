-- Requests own their intended kind. Existing pending requests remain Bro for compatibility,
-- while every newly created request must state its transition explicitly.
alter table public.relationship_requests
  add column requested_kind public.relationship_kind not null default 'bro';
alter table public.relationship_requests
  alter column requested_kind drop default;

create or replace function public.graph_send_request(target uuid, requested_kind public.relationship_kind)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  current_kind public.relationship_kind;
begin
  perform public.lock_pair(actor, target);

  select kind into current_kind
  from public.relationships
  where member_low = least(actor, target) and member_high = greatest(actor, target);

  if current_kind is not null and not (current_kind = 'bro' and requested_kind = 'partner') then
    raise exception 'relationship transition unavailable';
  end if;
  if exists (
    select 1 from public.relationship_requests
    where requester_id = target and recipient_id = actor
  ) then
    raise exception 'request already pending';
  end if;

  insert into public.relationship_requests (requester_id, recipient_id, requested_kind)
  values (actor, target, requested_kind)
  on conflict (requester_id, recipient_id) do nothing;
end;
$$;

create or replace function public.graph_respond_request(requester_input uuid, accepted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  pending_kind public.relationship_kind;
begin
  perform public.lock_pair(actor, requester_input);
  delete from public.relationship_requests
  where requester_id = requester_input and recipient_id = actor
  returning requested_kind into pending_kind;
  if not found then raise exception 'request unavailable'; end if;
  if accepted then perform public.upsert_relationship(actor, requester, pending_kind); end if;
end;
$$;

create function public.graph_downgrade_partner(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  perform public.lock_pair(actor, target);
  update public.relationships
  set kind = 'bro', updated_at = now()
  where member_low = least(actor, target)
    and member_high = greatest(actor, target)
    and kind = 'partner';
  if not found then raise exception 'partner relationship unavailable'; end if;
end;
$$;

create or replace function public.graph_summary(target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  relationship_kind public.relationship_kind;
  request_kind public.relationship_kind;
begin
  if actor = target then raise exception 'self graph actions are not allowed'; end if;
  if not exists (select 1 from public.profiles where id = target) then raise exception 'profile unavailable'; end if;

  select kind into relationship_kind
  from public.relationships
  where member_low = least(actor, target) and member_high = greatest(actor, target);
  select requested_kind into request_kind
  from public.relationship_requests
  where (requester_id = actor and recipient_id = target)
     or (requester_id = target and recipient_id = actor);

  return jsonb_build_object(
    'targetId', target,
    'relationshipKind', relationship_kind,
    'requestKind', request_kind,
    'outgoingRequest', exists (select 1 from public.relationship_requests where requester_id = actor and recipient_id = target),
    'incomingRequest', exists (select 1 from public.relationship_requests where requester_id = target and recipient_id = actor),
    'blocked', exists (select 1 from public.blocks where blocker_id = actor and blocked_id = target)
  );
end;
$$;

create or replace function private.social_projection_page(
  projection text,
  prefix text default null,
  cursor text default null,
  page_size integer default 20
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  bounded_size integer := least(greatest(coalesce(page_size, 20), 1), 50);
  normalized text := case when prefix is null then null else public.normalize_alias(prefix) end;
  escaped text; decoded jsonb; cursor_alias text; cursor_id uuid; fetched record;
  profiles jsonb := '[]'::jsonb; row_count integer := 0; last_alias text; last_id uuid;
begin
  if projection not in ('search', 'circle', 'requests') then raise exception 'invalid projection'; end if;
  if projection = 'search' and normalized = '' then raise exception 'invalid prefix'; end if;
  if normalized is not null then escaped := replace(replace(replace(normalized, '\', '\\'), '%', '\%'), '_', '\_'); end if;
  if cursor is not null then
    begin
      decoded := convert_from(decode(cursor, 'base64'), 'UTF8')::jsonb;
      cursor_alias := decoded ->> 'a'; cursor_id := (decoded ->> 'u')::uuid;
      if cursor_alias is null or cursor_id is null then raise exception 'invalid cursor'; end if;
    exception when others then raise exception 'invalid cursor'; end;
  end if;
  for fetched in
    select candidate.id, candidate.alias, candidate.categories, candidate.normalized_alias,
      case when rel.kind is not null then rel.kind::text when outgoing.requester_id is not null then 'outgoing_request' when incoming.requester_id is not null then 'incoming_request' else 'discover' end as relationship_status,
      coalesce(outgoing.requested_kind, incoming.requested_kind)::text as requested_kind
    from public.public_profiles as candidate
    left join public.relationships as rel on rel.member_low = least(actor, candidate.id) and rel.member_high = greatest(actor, candidate.id)
    left join public.relationship_requests as outgoing on outgoing.requester_id = actor and outgoing.recipient_id = candidate.id
    left join public.relationship_requests as incoming on incoming.requester_id = candidate.id and incoming.recipient_id = actor
    where candidate.id <> actor and not private.is_blocked_pair(actor, candidate.id)
      and (projection <> 'search' or candidate.normalized_alias like escaped || '%')
      and (projection <> 'circle' or rel.kind is not null)
      and (projection <> 'requests' or outgoing.requester_id is not null or incoming.requester_id is not null)
      and (cursor_id is null or (candidate.normalized_alias, candidate.id) > (cursor_alias, cursor_id))
    order by candidate.normalized_alias, candidate.id limit bounded_size + 1
  loop
    row_count := row_count + 1;
    if row_count <= bounded_size then
      profiles := profiles || jsonb_build_object('id', fetched.id, 'alias', fetched.alias, 'categories', fetched.categories, 'relationship_status', fetched.relationship_status, 'requested_kind', fetched.requested_kind);
      last_alias := fetched.normalized_alias; last_id := fetched.id;
    end if;
  end loop;
  return jsonb_build_object('profiles', profiles, 'next_cursor', case when row_count > bounded_size then encode(convert_to(jsonb_build_object('a', last_alias, 'u', last_id)::text, 'UTF8'), 'base64') else null end);
end;
$$;

revoke all on function public.graph_send_request(uuid), public.graph_respond_request(uuid, boolean, public.relationship_kind) from public, anon, authenticated;
revoke all on function public.graph_send_request(uuid, public.relationship_kind), public.graph_respond_request(uuid, boolean), public.graph_downgrade_partner(uuid) from public, anon;
grant execute on function public.graph_send_request(uuid, public.relationship_kind), public.graph_respond_request(uuid, boolean), public.graph_downgrade_partner(uuid) to authenticated;
