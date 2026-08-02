-- Catalog avatar identifiers stay local to the application; only a constrained id is stored.
alter table public.profiles
  add column avatar_id text not null default 'capybara-athlete'
  check (avatar_id in ('capybara-athlete'));

alter table public.public_profiles
  add column avatar_id text not null default 'capybara-athlete'
  check (avatar_id in ('capybara-athlete'));

create or replace function public.refresh_public_profile()
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

  insert into public.public_profiles (id, alias, normalized_alias, categories, avatar_id, updated_at)
  values (new.id, new.alias, new.normalized_alias, visible_categories, new.avatar_id, now())
  on conflict (id) do update set
    alias = excluded.alias,
    normalized_alias = excluded.normalized_alias,
    categories = excluded.categories,
    avatar_id = excluded.avatar_id,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger profiles_public_projection on public.profiles;
create trigger profiles_public_projection
after insert or update of alias, categories, category_visibility, avatar_id or delete on public.profiles
for each row execute function public.refresh_public_profile();

create or replace function public.list_directory(cursor text default null, page_size integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor();
  bounded_size integer := least(greatest(coalesce(page_size, 20), 1), 50);
  decoded jsonb;
  cursor_bucket smallint;
  cursor_rank uuid;
  cursor_id uuid;
  fetched record;
  profiles jsonb := '[]'::jsonb;
  row_count integer := 0;
  last_bucket smallint;
  last_rank uuid;
  last_id uuid;
begin
  if cursor is not null then
    begin
      decoded := convert_from(decode(cursor, 'base64'), 'UTF8')::jsonb;
      cursor_bucket := (decoded ->> 'b')::smallint;
      cursor_rank := (decoded ->> 'r')::uuid;
      cursor_id := (decoded ->> 'u')::uuid;
      if cursor_bucket is null or cursor_bucket < 0 or cursor_bucket > 127 or cursor_rank is null or cursor_id is null then raise exception 'invalid cursor'; end if;
    exception when others then raise exception 'invalid cursor';
    end;
  end if;

  for fetched in
    select candidate.id, candidate.alias, candidate.categories, candidate.avatar_id, candidate.directory_bucket, candidate.directory_rank
    from public.public_profiles as candidate
    where candidate.id <> actor
      and not private.is_blocked_pair(actor, candidate.id)
      and not exists (select 1 from public.relationships as rel where rel.member_low = least(actor, candidate.id) and rel.member_high = greatest(actor, candidate.id))
      and not exists (select 1 from public.relationship_requests as pending where pending.member_low = least(actor, candidate.id) and pending.member_high = greatest(actor, candidate.id))
      and (cursor_id is null or (candidate.directory_bucket, candidate.directory_rank, candidate.id) > (cursor_bucket, cursor_rank, cursor_id))
    order by candidate.directory_bucket, candidate.directory_rank, candidate.id
    limit bounded_size + 1
  loop
    row_count := row_count + 1;
    if row_count <= bounded_size then
      profiles := profiles || jsonb_build_object('id', fetched.id, 'alias', fetched.alias, 'categories', fetched.categories, 'avatar_id', fetched.avatar_id);
      last_bucket := fetched.directory_bucket; last_rank := fetched.directory_rank; last_id := fetched.id;
    end if;
  end loop;

  return jsonb_build_object('profiles', profiles, 'next_cursor', case when row_count > bounded_size then encode(convert_to(jsonb_build_object('b', last_bucket, 'r', last_rank, 'u', last_id)::text, 'UTF8'), 'base64') else null end);
end;
$$;

create or replace function private.social_projection_page(projection text, prefix text default null, cursor text default null, page_size integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor();
  bounded_size integer := least(greatest(coalesce(page_size, 20), 1), 50);
  normalized text := case when prefix is null then null else public.normalize_alias(prefix) end;
  escaped text;
  decoded jsonb;
  cursor_alias text;
  cursor_id uuid;
  fetched record;
  profiles jsonb := '[]'::jsonb;
  row_count integer := 0;
  last_alias text;
  last_id uuid;
begin
  if projection not in ('search', 'circle', 'requests') then raise exception 'invalid projection'; end if;
  if projection = 'search' and normalized = '' then raise exception 'invalid prefix'; end if;
  if normalized is not null then escaped := replace(replace(replace(normalized, '\', '\\'), '%', '\%'), '_', '\_'); end if;
  if cursor is not null then
    begin
      decoded := convert_from(decode(cursor, 'base64'), 'UTF8')::jsonb;
      cursor_alias := decoded ->> 'a'; cursor_id := (decoded ->> 'u')::uuid;
      if cursor_alias is null or cursor_id is null then raise exception 'invalid cursor'; end if;
    exception when others then raise exception 'invalid cursor';
    end;
  end if;

  for fetched in
    select candidate.id, candidate.alias, candidate.categories, candidate.avatar_id, candidate.normalized_alias,
      case when rel.kind is not null then rel.kind::text when outgoing.requester_id is not null then 'outgoing_request' when incoming.requester_id is not null then 'incoming_request' else 'discover' end as relationship_status
    from public.public_profiles as candidate
    left join public.relationships as rel on rel.member_low = least(actor, candidate.id) and rel.member_high = greatest(actor, candidate.id)
    left join public.relationship_requests as outgoing on outgoing.requester_id = actor and outgoing.recipient_id = candidate.id
    left join public.relationship_requests as incoming on incoming.requester_id = candidate.id and incoming.recipient_id = actor
    where candidate.id <> actor
      and not private.is_blocked_pair(actor, candidate.id)
      and (projection <> 'search' or candidate.normalized_alias like escaped || '%')
      and (projection <> 'circle' or rel.kind is not null)
      and (projection <> 'requests' or outgoing.requester_id is not null or incoming.requester_id is not null)
      and (cursor_id is null or (candidate.normalized_alias, candidate.id) > (cursor_alias, cursor_id))
    order by candidate.normalized_alias, candidate.id
    limit bounded_size + 1
  loop
    row_count := row_count + 1;
    if row_count <= bounded_size then
      profiles := profiles || jsonb_build_object('id', fetched.id, 'alias', fetched.alias, 'categories', fetched.categories, 'avatar_id', fetched.avatar_id, 'relationship_status', fetched.relationship_status);
      last_alias := fetched.normalized_alias; last_id := fetched.id;
    end if;
  end loop;

  return jsonb_build_object('profiles', profiles, 'next_cursor', case when row_count > bounded_size then encode(convert_to(jsonb_build_object('a', last_alias, 'u', last_id)::text, 'UTF8'), 'base64') else null end);
end;
$$;

create or replace function public.list_blocked_users(cursor text default null, page_size integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor();
  bounded_size integer := least(greatest(coalesce(page_size, 20), 1), 50);
  decoded jsonb;
  cursor_alias text;
  cursor_id uuid;
  fetched record;
  profiles jsonb := '[]'::jsonb;
  row_count integer := 0;
  last_alias text;
  last_id uuid;
begin
  if cursor is not null then
    begin
      decoded := convert_from(decode(cursor, 'base64'), 'UTF8')::jsonb;
      cursor_alias := decoded ->> 'a'; cursor_id := (decoded ->> 'u')::uuid;
      if cursor_alias is null or cursor_id is null then raise exception 'invalid cursor'; end if;
    exception when others then raise exception 'invalid cursor';
    end;
  end if;

  for fetched in
    select profile.id, profile.alias, profile.categories, profile.avatar_id, profile.normalized_alias
    from public.blocks as block join public.public_profiles as profile on profile.id = block.blocked_id
    where block.blocker_id = actor and (cursor_id is null or (profile.normalized_alias, profile.id) > (cursor_alias, cursor_id))
    order by profile.normalized_alias, profile.id
    limit bounded_size + 1
  loop
    row_count := row_count + 1;
    if row_count <= bounded_size then
      profiles := profiles || jsonb_build_object('id', fetched.id, 'alias', fetched.alias, 'categories', fetched.categories, 'avatar_id', fetched.avatar_id);
      last_alias := fetched.normalized_alias; last_id := fetched.id;
    end if;
  end loop;

  return jsonb_build_object('profiles', profiles, 'next_cursor', case when row_count > bounded_size then encode(convert_to(jsonb_build_object('a', last_alias, 'u', last_id)::text, 'UTF8'), 'base64') else null end);
end;
$$;
