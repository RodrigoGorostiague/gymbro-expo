-- Durable, user-owned notification inbox primitives. Producers opt in through
-- private.create_notification from their existing server-authorized RPCs.
create table public.notification_inbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (char_length(kind) between 1 and 64),
  title text not null check (char_length(title) between 1 and 160),
  body text check (body is null or char_length(body) <= 500),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  deduplication_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (actor_id is null or actor_id <> recipient_id)
);

create table public.notification_device_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  token text not null check (char_length(token) between 1 and 512),
  platform text not null check (platform in ('ios', 'android', 'web')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token)
);

create unique index notification_inbox_recipient_deduplication_key
on public.notification_inbox (recipient_id, deduplication_key)
where deduplication_key is not null;

create index notification_inbox_recipient_created_at
on public.notification_inbox (recipient_id, created_at desc, id desc);

create index notification_inbox_recipient_unread
on public.notification_inbox (recipient_id, created_at desc, id desc)
where read_at is null;

create index notification_device_tokens_owner_enabled
on public.notification_device_tokens (owner_id, updated_at desc)
where enabled;

create trigger notification_device_tokens_updated_at before update on public.notification_device_tokens
for each row execute function public.touch_updated_at();

create function private.create_notification(
  recipient uuid,
  notification_kind text,
  notification_title text,
  notification_body text default null,
  notification_data jsonb default '{}'::jsonb,
  notification_deduplication_key text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare notification_id uuid;
begin
  if not exists (select 1 from public.profiles where id = recipient) then
    raise exception 'notification recipient unavailable';
  end if;
  if notification_kind is null or char_length(notification_kind) not between 1 and 64
    or notification_title is null or char_length(notification_title) not between 1 and 160
    or (notification_body is not null and char_length(notification_body) > 500)
    or jsonb_typeof(notification_data) <> 'object' then
    raise exception 'invalid notification input';
  end if;

  insert into public.notification_inbox (
    recipient_id, actor_id, kind, title, body, data, deduplication_key
  ) values (
    recipient, auth.uid(), notification_kind, notification_title, notification_body,
    notification_data, notification_deduplication_key
  )
  on conflict (recipient_id, deduplication_key) where deduplication_key is not null
  do update set created_at = now(), read_at = null, title = excluded.title,
    body = excluded.body, data = excluded.data, actor_id = excluded.actor_id
  returning id into notification_id;

  return notification_id;
end;
$$;

create function public.list_notification_inbox(limit_count integer default 50)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', notification.id,
    'kind', notification.kind,
    'title', notification.title,
    'body', notification.body,
    'data', notification.data,
    'read_at', notification.read_at,
    'created_at', notification.created_at
  ) order by notification.created_at desc, notification.id desc), '[]'::jsonb)
  from (
    select * from public.notification_inbox
    where recipient_id = public.require_actor()
    order by created_at desc, id desc
    limit least(greatest(coalesce(limit_count, 50), 1), 100)
  ) notification
$$;

create function public.mark_notification_read(notification_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notification_inbox
  set read_at = coalesce(read_at, now())
  where id = notification_id and recipient_id = public.require_actor();
  if not found then raise exception 'notification unavailable'; end if;
end;
$$;

create function public.mark_all_notifications_read()
returns void language sql security definer set search_path = '' as $$
  update public.notification_inbox set read_at = now()
  where recipient_id = public.require_actor() and read_at is null
$$;

create function public.register_notification_device_token(token_input text, platform_input text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  if token_input is null or char_length(token_input) not between 1 and 512
    or platform_input not in ('ios', 'android', 'web') then
    raise exception 'invalid notification device token';
  end if;
  insert into public.notification_device_tokens(owner_id, token, platform)
  values (actor, token_input, platform_input)
  on conflict (token) do update set owner_id = excluded.owner_id,
    platform = excluded.platform, enabled = true, updated_at = now();
end;
$$;

create function public.unregister_notification_device_token(token_input text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notification_device_tokens
  where owner_id = public.require_actor() and token = token_input;
end;
$$;

alter table public.notification_inbox enable row level security;
alter table public.notification_device_tokens enable row level security;

revoke all on public.notification_inbox, public.notification_device_tokens from anon, authenticated;
revoke all on function private.create_notification(uuid, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.list_notification_inbox(integer), public.mark_notification_read(uuid), public.mark_all_notifications_read(), public.register_notification_device_token(text, text), public.unregister_notification_device_token(text) from public, anon;
grant execute on function public.list_notification_inbox(integer), public.mark_notification_read(uuid), public.mark_all_notifications_read(), public.register_notification_device_token(text, text), public.unregister_notification_device_token(text) to authenticated;
