-- Correct graph-command behavior without rewriting the released identity migration.
-- Any later rollback must be a compensating migration that preserves graph records.

create or replace function public.graph_send_request(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  perform public.lock_pair(actor, target);
  if exists (
    select 1 from public.relationships
    where member_low = least(actor, target) and member_high = greatest(actor, target)
  ) then
    raise exception 'relationship already exists';
  end if;
  if exists (
    select 1 from public.relationship_requests
    where requester_id = target and recipient_id = actor
  ) then
    raise exception 'request already pending';
  end if;
  insert into public.relationship_requests (requester_id, recipient_id)
  values (actor, target)
  on conflict (requester_id, recipient_id) do nothing;
end;
$$;

create function public.graph_summary(target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  relationship_kind public.relationship_kind;
begin
  if actor = target then raise exception 'self graph actions are not allowed'; end if;
  if not exists (select 1 from public.profiles where id = target) then
    raise exception 'profile unavailable';
  end if;

  select kind into relationship_kind
  from public.relationships
  where member_low = least(actor, target) and member_high = greatest(actor, target);

  return jsonb_build_object(
    'targetId', target,
    'relationshipKind', relationship_kind,
    'outgoingRequest', exists (
      select 1 from public.relationship_requests where requester_id = actor and recipient_id = target
    ),
    'incomingRequest', exists (
      select 1 from public.relationship_requests where requester_id = target and recipient_id = actor
    ),
    'blocked', exists (
      select 1 from public.blocks where blocker_id = actor and blocked_id = target
    )
  );
end;
$$;

revoke all on function public.graph_summary(uuid) from public, anon;
grant execute on function public.graph_summary(uuid) to authenticated;
