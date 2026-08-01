create extension if not exists unaccent with schema extensions;
create schema private;

create type public.relationship_kind as enum ('bro', 'partner');

create function public.normalize_alias(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(trim(extensions.unaccent(value)), '\s+', ' ', 'g'))
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  alias text not null check (char_length(alias) between 3 and 32),
  normalized_alias text generated always as (public.normalize_alias(alias)) stored unique,
  categories jsonb not null default '{}'::jsonb check (jsonb_typeof(categories) = 'object'),
  category_visibility jsonb not null default '{}'::jsonb check (jsonb_typeof(category_visibility) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.public_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  alias text not null,
  normalized_alias text not null unique,
  categories jsonb not null default '{}'::jsonb,
  directory_bucket smallint not null default floor(random() * 128)::smallint check (directory_bucket between 0 and 127),
  directory_rank uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

create table public.relationship_requests (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  member_low uuid generated always as (least(requester_id, recipient_id)) stored,
  member_high uuid generated always as (greatest(requester_id, recipient_id)) stored,
  created_at timestamptz not null default now(),
  primary key (requester_id, recipient_id),
  check (requester_id <> recipient_id),
  unique (member_low, member_high)
);

create table public.relationships (
  member_low uuid not null references public.profiles(id) on delete cascade,
  member_high uuid not null references public.profiles(id) on delete cascade,
  kind public.relationship_kind not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (member_low, member_high),
  check (member_low < member_high)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index public_profiles_directory_page on public.public_profiles (directory_bucket, directory_rank, id);
create index public_profiles_alias_prefix on public.public_profiles (normalized_alias text_pattern_ops, id);
create index relationships_member_low on public.relationships (member_low) where kind = 'partner';
create index relationships_member_high on public.relationships (member_high) where kind = 'partner';
create index blocks_blocked on public.blocks (blocked_id, blocker_id);

create function public.refresh_public_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  visible_categories jsonb;
begin
  if tg_op = 'DELETE' then
    delete from public.public_profiles where id = old.id;
    return old;
  end if;

  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  into visible_categories
  from jsonb_each(new.categories) as entry(key, value)
  where coalesce((new.category_visibility ->> entry.key)::boolean, true);

  insert into public.public_profiles (id, alias, normalized_alias, categories, updated_at)
  values (new.id, new.alias, new.normalized_alias, visible_categories, now())
  on conflict (id) do update set
    alias = excluded.alias,
    normalized_alias = excluded.normalized_alias,
    categories = excluded.categories,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

create trigger profiles_public_projection
after insert or update of alias, categories, category_visibility or delete on public.profiles
for each row execute function public.refresh_public_profile();

create function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger relationships_updated_at before update on public.relationships
for each row execute function public.touch_updated_at();

create function public.require_actor()
returns uuid language plpgsql stable set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'authentication required'; end if;
  return actor;
end;
$$;

create function public.lock_pair(actor uuid, target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if actor = target then raise exception 'self graph actions are not allowed'; end if;
  perform 1 from public.profiles where id in (actor, target) order by id for update;
  if not found or (select count(*) from public.profiles where id in (actor, target)) <> 2 then
    raise exception 'profile unavailable';
  end if;
  if exists (select 1 from public.blocks where (blocker_id, blocked_id) in ((actor, target), (target, actor))) then
    raise exception 'graph action blocked';
  end if;
end;
$$;

create function public.upsert_relationship(actor uuid, target uuid, requested_kind public.relationship_kind)
returns void language plpgsql security definer set search_path = '' as $$
declare low_member uuid := least(actor, target); high_member uuid := greatest(actor, target);
begin
  if requested_kind = 'partner' then
    update public.relationships
    set kind = 'bro'
    where kind = 'partner'
      and (member_low in (actor, target) or member_high in (actor, target));
  end if;
  insert into public.relationships (member_low, member_high, kind)
  values (low_member, high_member, requested_kind)
  on conflict (member_low, member_high) do update set kind = excluded.kind, updated_at = now();
end;
$$;

create function public.graph_send_request(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  perform public.lock_pair(actor, target);
  if exists (select 1 from public.relationships where member_low = least(actor, target) and member_high = greatest(actor, target)) then
    raise exception 'relationship already exists';
  end if;
  insert into public.relationship_requests (requester_id, recipient_id) values (actor, target);
end;
$$;

create function public.graph_respond_request(requester uuid, accepted boolean, requested_kind public.relationship_kind default 'bro')
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  perform public.lock_pair(actor, requester);
  delete from public.relationship_requests where requester_id = requester and recipient_id = actor;
  if not found then raise exception 'request unavailable'; end if;
  if accepted then perform public.upsert_relationship(actor, requester, requested_kind); end if;
end;
$$;

create function public.graph_cancel_request(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  perform public.lock_pair(actor, target);
  delete from public.relationship_requests where requester_id = actor and recipient_id = target;
  if not found then raise exception 'request unavailable'; end if;
end;
$$;

create function public.graph_block(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  if actor = target then raise exception 'self block is not allowed'; end if;
  perform 1 from public.profiles where id in (actor, target) order by id for update;
  if (select count(*) from public.profiles where id in (actor, target)) <> 2 then raise exception 'profile unavailable'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (actor, target) on conflict do nothing;
  delete from public.relationship_requests where member_low = least(actor, target) and member_high = greatest(actor, target);
  delete from public.relationships where member_low = least(actor, target) and member_high = greatest(actor, target);
end;
$$;

create function public.graph_unblock(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  delete from public.blocks where blocker_id = actor and blocked_id = target;
  if not found then raise exception 'block unavailable'; end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.public_profiles enable row level security;
alter table public.relationship_requests enable row level security;
alter table public.relationships enable row level security;
alter table public.blocks enable row level security;

create function private.is_blocked_pair(left_member uuid, right_member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id, blocked_id) in ((left_member, right_member), (right_member, left_member))
  )
$$;

create policy profiles_owner_read on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_owner_write on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_owner_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy public_profiles_safe_read on public.public_profiles for select to authenticated using (
  id <> auth.uid() and not private.is_blocked_pair(auth.uid(), id)
);
create policy requests_participant_read on public.relationship_requests for select to authenticated using (requester_id = auth.uid() or recipient_id = auth.uid());
create policy relationships_participant_read on public.relationships for select to authenticated using (member_low = auth.uid() or member_high = auth.uid());
create policy blocks_owner_read on public.blocks for select to authenticated using (blocker_id = auth.uid());

revoke all on public.relationships, public.relationship_requests, public.blocks, public.public_profiles from anon, authenticated;
grant select on public.public_profiles, public.relationship_requests, public.relationships, public.blocks to authenticated;
revoke all on function public.lock_pair(uuid, uuid), public.upsert_relationship(uuid, uuid, public.relationship_kind) from public, anon, authenticated;
revoke all on function private.is_blocked_pair(uuid, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_blocked_pair(uuid, uuid) to authenticated;
revoke all on function public.graph_send_request(uuid), public.graph_respond_request(uuid, boolean, public.relationship_kind), public.graph_cancel_request(uuid), public.graph_block(uuid), public.graph_unblock(uuid) from public, anon;
grant execute on function public.graph_send_request(uuid), public.graph_respond_request(uuid, boolean, public.relationship_kind), public.graph_cancel_request(uuid), public.graph_block(uuid), public.graph_unblock(uuid) to authenticated;

alter publication supabase_realtime add table public.public_profiles;
