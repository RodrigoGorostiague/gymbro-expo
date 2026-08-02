create or replace function public.graph_respond_request(requester_input uuid, accepted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  pending_kind public.relationship_kind;
  recipient_alias text;
begin
  perform public.lock_pair(actor, requester_input);
  delete from public.relationship_requests
  where requester_id = requester_input and recipient_id = actor
  returning requested_kind into pending_kind;
  if not found then raise exception 'request unavailable'; end if;
  if not accepted then return; end if;

  perform public.upsert_relationship(actor, requester_input, pending_kind);
  select alias into recipient_alias from public.profiles where id = actor;
  perform private.create_notification(
    requester_input,
    'relationship_accepted',
    'Solicitud aceptada',
    coalesce(recipient_alias, 'Tu conexión') || ' aceptó tu solicitud.',
    jsonb_build_object('url', '/community/circle'),
    'relationship-accepted:' || requester_input || ':' || actor || ':' || pending_kind::text
  );
end;
$$;
