-- Preserve the recipient/requester distinction after replacing the legacy RPC.
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
  if accepted then perform public.upsert_relationship(actor, requester_input, pending_kind); end if;
end;
$$;
