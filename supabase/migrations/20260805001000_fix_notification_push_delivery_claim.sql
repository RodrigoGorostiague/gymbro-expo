-- The RETURNS TABLE output parameter notification_id collides with the
-- delivery table column in ON CONFLICT unless PL/pgSQL prefers columns.
create or replace function public.claim_notification_push_deliveries(batch_size integer default 100)
returns table (
  delivery_id uuid, notification_id uuid, token text, platform text, kind text,
  title text, body text, data jsonb
) language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  insert into public.notification_push_deliveries (notification_id, device_token_id, token)
  select notification.id, device.id, device.token
  from public.notification_inbox notification
  join public.notification_device_tokens device on device.owner_id = notification.recipient_id
  where notification.read_at is null and device.enabled
  on conflict (notification_id, device_token_id) do nothing;

  update public.notification_push_deliveries
  set status = 'pending', lease_expires_at = null, next_attempt_at = now(),
    last_error_message = coalesce(last_error_message, 'Dispatch lease expired.')
  where status = 'processing' and lease_expires_at <= now();

  return query
  with candidates as (
    select delivery.id
    from public.notification_push_deliveries delivery
    where delivery.status = 'pending'
      and delivery.next_attempt_at <= now()
    order by delivery.next_attempt_at, delivery.id
    for update skip locked
    limit least(greatest(coalesce(batch_size, 100), 1), 100)
  ), claimed as (
    update public.notification_push_deliveries delivery
    set status = 'processing', attempt_count = delivery.attempt_count + 1,
      last_attempt_at = now(), lease_expires_at = now() + interval '5 minutes'
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  )
  select claimed.id, notification.id, claimed.token, device.platform, notification.kind,
    notification.title, notification.body, notification.data
  from claimed
  join public.notification_inbox notification on notification.id = claimed.notification_id
  join public.notification_device_tokens device on device.id = claimed.device_token_id;
end;
$$;
