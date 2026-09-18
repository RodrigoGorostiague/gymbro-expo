-- Durable server-only Expo push outbox for notification_inbox events.
create table public.notification_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notification_inbox(id) on delete cascade,
  device_token_id uuid not null references public.notification_device_tokens(id) on delete cascade,
  token text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ticketed', 'delivered', 'invalid_device')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  expo_ticket_id text,
  last_error_code text,
  last_error_message text,
  last_attempt_at timestamptz,
  receipt_checked_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, device_token_id)
);

create table public.notification_push_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.notification_push_deliveries(id) on delete cascade,
  stage text not null check (stage in ('ticket', 'receipt', 'transport')),
  succeeded boolean not null,
  error_code text,
  error_message text,
  response jsonb not null default '{}'::jsonb check (jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now()
);

create index notification_push_deliveries_pending_idx
  on public.notification_push_deliveries (next_attempt_at, id)
  where status = 'pending';
create index notification_push_deliveries_receipts_idx
  on public.notification_push_deliveries (receipt_checked_at, id)
  where status = 'ticketed';
create index notification_push_attempts_delivery_idx
  on public.notification_push_attempts (delivery_id, created_at desc);
create trigger notification_push_deliveries_updated_at before update on public.notification_push_deliveries
  for each row execute function public.touch_updated_at();

alter table public.notification_push_deliveries enable row level security;
alter table public.notification_push_attempts enable row level security;
revoke all on public.notification_push_deliveries, public.notification_push_attempts from anon, authenticated;

create function public.claim_notification_push_deliveries(batch_size integer default 100)
returns table (
  delivery_id uuid, notification_id uuid, token text, platform text, kind text,
  title text, body text, data jsonb
) language plpgsql security definer set search_path = '' as $$
begin
  -- Fan out unread inbox events only. This avoids a first-run replay of already read history.
  insert into public.notification_push_deliveries (notification_id, device_token_id, token)
  select notification.id, device.id, device.token
  from public.notification_inbox notification
  join public.notification_device_tokens device on device.owner_id = notification.recipient_id
  where notification.read_at is null and device.enabled
  on conflict (notification_id, device_token_id) do nothing;

  -- A worker crash must not strand a leased delivery indefinitely.
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

create function public.record_notification_push_tickets(ticket_outcomes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare outcome jsonb; delivery public.notification_push_deliveries%rowtype;
begin
  if jsonb_typeof(ticket_outcomes) <> 'array' then raise exception 'invalid ticket outcomes'; end if;
  for outcome in select value from jsonb_array_elements(ticket_outcomes) loop
    select * into delivery from public.notification_push_deliveries
    where id = (outcome->>'delivery_id')::uuid and status = 'processing'
    for update;
    if not found then continue; end if;
    if outcome->>'status' = 'ticketed' then
      update public.notification_push_deliveries set status = 'ticketed', expo_ticket_id = outcome->>'ticketId',
        lease_expires_at = null, next_attempt_at = now(), last_error_code = null, last_error_message = null
      where id = delivery.id;
      insert into public.notification_push_attempts(delivery_id, stage, succeeded, response)
      values (delivery.id, 'ticket', true, coalesce(outcome->'raw', '{}'::jsonb));
    else
      update public.notification_push_deliveries set status = 'pending', lease_expires_at = null,
        next_attempt_at = now() + make_interval(secs => least(3600, 30 * power(2, least(delivery.attempt_count, 7))::integer)),
        last_error_code = outcome->>'errorCode', last_error_message = outcome->>'errorMessage'
      where id = delivery.id;
      insert into public.notification_push_attempts(delivery_id, stage, succeeded, error_code, error_message, response)
      values (delivery.id, 'ticket', false, outcome->>'errorCode', outcome->>'errorMessage', coalesce(outcome->'raw', '{}'::jsonb));
    end if;
  end loop;
end;
$$;

create function public.record_notification_push_transport_failure(delivery_ids uuid[], failure_message text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notification_push_deliveries
  set status = 'pending', lease_expires_at = null,
    next_attempt_at = now() + make_interval(secs => least(3600, 30 * power(2, least(attempt_count, 7))::integer)),
    last_error_message = left(coalesce(failure_message, 'Expo push request failed.'), 500)
  where id = any(delivery_ids) and status = 'processing';
  insert into public.notification_push_attempts(delivery_id, stage, succeeded, error_message)
  select id, 'transport', false, left(coalesce(failure_message, 'Expo push request failed.'), 500)
  from public.notification_push_deliveries where id = any(delivery_ids);
end;
$$;

create function public.claim_notification_push_receipts(batch_size integer default 100)
returns table (delivery_id uuid, expo_ticket_id text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with candidates as (
    select delivery.id
    from public.notification_push_deliveries delivery
    where delivery.status = 'ticketed' and delivery.expo_ticket_id is not null
      and coalesce(delivery.receipt_checked_at, '-infinity'::timestamptz) <= now() - interval '1 minute'
    order by delivery.receipt_checked_at nulls first, delivery.id
    for update skip locked
    limit least(greatest(coalesce(batch_size, 100), 1), 100)
  )
  update public.notification_push_deliveries delivery
  set receipt_checked_at = now()
  from candidates
  where delivery.id = candidates.id
  returning delivery.id, delivery.expo_ticket_id;
end;
$$;

create function public.record_notification_push_receipts(receipt_outcomes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare outcome jsonb; delivery public.notification_push_deliveries%rowtype;
begin
  if jsonb_typeof(receipt_outcomes) <> 'array' then raise exception 'invalid receipt outcomes'; end if;
  for outcome in select value from jsonb_array_elements(receipt_outcomes) loop
    select * into delivery from public.notification_push_deliveries where id = (outcome->>'delivery_id')::uuid for update;
    if not found or delivery.status <> 'ticketed' then continue; end if;
    if outcome->>'status' = 'delivered' then
      update public.notification_push_deliveries set status = 'delivered', delivered_at = now(), lease_expires_at = null,
        last_error_code = null, last_error_message = null where id = delivery.id;
    elsif outcome->>'status' = 'invalid_device' then
      update public.notification_push_deliveries set status = 'invalid_device', lease_expires_at = null,
        last_error_code = outcome->>'errorCode', last_error_message = outcome->>'errorMessage' where id = delivery.id;
      update public.notification_device_tokens set enabled = false where id = delivery.device_token_id;
    else
      update public.notification_push_deliveries set status = 'pending', expo_ticket_id = null,
        next_attempt_at = now() + interval '5 minutes', last_error_code = outcome->>'errorCode',
        last_error_message = outcome->>'errorMessage' where id = delivery.id;
    end if;
    insert into public.notification_push_attempts(delivery_id, stage, succeeded, error_code, error_message, response)
    values (delivery.id, 'receipt', outcome->>'status' = 'delivered', outcome->>'errorCode', outcome->>'errorMessage', coalesce(outcome->'raw', '{}'::jsonb));
  end loop;
end;
$$;

revoke all on function public.claim_notification_push_deliveries(integer), public.record_notification_push_tickets(jsonb), public.record_notification_push_transport_failure(uuid[], text), public.claim_notification_push_receipts(integer), public.record_notification_push_receipts(jsonb) from public, anon, authenticated;
grant execute on function public.claim_notification_push_deliveries(integer), public.record_notification_push_tickets(jsonb), public.record_notification_push_transport_failure(uuid[], text), public.claim_notification_push_receipts(integer), public.record_notification_push_receipts(jsonb) to service_role;
