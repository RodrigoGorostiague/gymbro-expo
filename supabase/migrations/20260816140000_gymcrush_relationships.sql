-- `partner` remains the persisted relationship kind while the product calls it GymCrush.
drop trigger if exists relationships_exclusive_partner on public.relationships;

create or replace function private.assert_gymcrush_sexes(actor_input uuid, target_input uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_sex text; target_sex text;
begin
  select sex into actor_sex from public.profiles where id = actor_input;
  select sex into target_sex from public.profiles where id = target_input;
  if actor_sex is null or target_sex is null or actor_sex not in ('male', 'female') or target_sex not in ('male', 'female') or actor_sex = target_sex then
    raise exception 'GymCrush requires users with different declared sexes';
  end if;
end;
$$;

create or replace function public.graph_send_request(target uuid, requested_kind public.relationship_kind)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); current_kind public.relationship_kind;
begin
  perform public.lock_pair(actor, target);
  if requested_kind = 'partner' then perform private.assert_gymcrush_sexes(actor, target); end if;
  select kind into current_kind from public.relationships where member_low = least(actor, target) and member_high = greatest(actor, target);
  if current_kind is not null and not (current_kind = 'bro' and requested_kind = 'partner') then raise exception 'relationship transition unavailable'; end if;
  if exists (select 1 from public.relationship_requests where requester_id = target and recipient_id = actor) then raise exception 'request already pending'; end if;
  insert into public.relationship_requests (requester_id, recipient_id, requested_kind) values (actor, target, requested_kind) on conflict (requester_id, recipient_id) do nothing;
end;
$$;

create or replace function public.graph_respond_request(requester_input uuid, accepted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); pending_kind public.relationship_kind; recipient_alias text;
begin
  perform public.lock_pair(actor, requester_input);
  delete from public.relationship_requests where requester_id = requester_input and recipient_id = actor returning requested_kind into pending_kind;
  if not found then raise exception 'request unavailable'; end if;
  if not accepted then return; end if;
  if pending_kind = 'partner' then
    perform private.assert_gymcrush_sexes(actor, requester_input);
    update public.relationships
    set kind = 'bro', updated_at = now()
    where kind = 'partner'
      and (member_low = actor or member_high = actor or member_low = requester_input or member_high = requester_input)
      and (member_low, member_high) <> (least(actor, requester_input), greatest(actor, requester_input));
  end if;
  perform public.upsert_relationship(actor, requester_input, pending_kind);
  select alias into recipient_alias from public.profiles where id = actor;
  perform private.create_notification(requester_input, 'relationship_accepted', 'Solicitud aceptada', coalesce(recipient_alias, 'Tu conexión') || ' aceptó tu solicitud.', jsonb_build_object('url', '/community/circle'), 'relationship-accepted:' || requester_input || ':' || actor || ':' || pending_kind::text);
end;
$$;

revoke all on function private.assert_gymcrush_sexes(uuid, uuid) from public, anon, authenticated;
revoke all on function public.graph_send_request(uuid, public.relationship_kind), public.graph_respond_request(uuid, boolean) from public, anon;
grant execute on function public.graph_send_request(uuid, public.relationship_kind), public.graph_respond_request(uuid, boolean) to authenticated;
