-- Server-owned discovery RPCs with keyset cursors and privacy/block exclusions.
-- Any rollback must be a compensating migration that preserves identity and graph records.

create function public.list_directory(cursor text default null, page_size integer default 20)
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
      if cursor_bucket is null or cursor_bucket < 0 or cursor_bucket > 127 or cursor_rank is null or cursor_id is null then
        raise exception 'invalid cursor';
      end if;
    exception when others then
      raise exception 'invalid cursor';
    end;
  end if;

  for fetched in
    select candidate.id, candidate.alias, candidate.categories, candidate.directory_bucket, candidate.directory_rank
    from public.public_profiles as candidate
    where candidate.id <> actor
      and not private.is_blocked_pair(actor, candidate.id)
      and not exists (
        select 1 from public.relationships as rel
        where rel.member_low = least(actor, candidate.id)
          and rel.member_high = greatest(actor, candidate.id)
      )
      and not exists (
        select 1 from public.relationship_requests as pending
        where pending.member_low = least(actor, candidate.id)
          and pending.member_high = greatest(actor, candidate.id)
      )
      and (
        cursor_id is null
        or (candidate.directory_bucket, candidate.directory_rank, candidate.id) > (cursor_bucket, cursor_rank, cursor_id)
      )
    order by candidate.directory_bucket, candidate.directory_rank, candidate.id
    limit bounded_size + 1
  loop
    row_count := row_count + 1;
    if row_count <= bounded_size then
      profiles := profiles || jsonb_build_object('id', fetched.id, 'alias', fetched.alias, 'categories', fetched.categories);
      last_bucket := fetched.directory_bucket;
      last_rank := fetched.directory_rank;
      last_id := fetched.id;
    end if;
  end loop;

  return jsonb_build_object(
    'profiles', profiles,
    'next_cursor', case
      when row_count > bounded_size then encode(convert_to(jsonb_build_object('b', last_bucket, 'r', last_rank, 'u', last_id)::text, 'UTF8'), 'base64')
      else null
    end
  );
end;
$$;

create function public.search_aliases(prefix text, cursor text default null, page_size integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor();
  bounded_size integer := least(greatest(coalesce(page_size, 20), 1), 50);
  normalized text := public.normalize_alias(coalesce(prefix, ''));
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
  if normalized = '' then
    raise exception 'invalid prefix';
  end if;
  escaped := replace(replace(replace(normalized, '\', '\\'), '%', '\%'), '_', '\_');

  if cursor is not null then
    begin
      decoded := convert_from(decode(cursor, 'base64'), 'UTF8')::jsonb;
      cursor_alias := decoded ->> 'a';
      cursor_id := (decoded ->> 'u')::uuid;
      if cursor_alias is null or cursor_id is null then
        raise exception 'invalid cursor';
      end if;
    exception when others then
      raise exception 'invalid cursor';
    end;
  end if;

  for fetched in
    select candidate.id, candidate.alias, candidate.categories, candidate.normalized_alias
    from public.public_profiles as candidate
    where candidate.normalized_alias like escaped || '%'
      and candidate.id <> actor
      and not private.is_blocked_pair(actor, candidate.id)
      and not exists (
        select 1 from public.relationships as rel
        where rel.member_low = least(actor, candidate.id)
          and rel.member_high = greatest(actor, candidate.id)
      )
      and not exists (
        select 1 from public.relationship_requests as pending
        where pending.member_low = least(actor, candidate.id)
          and pending.member_high = greatest(actor, candidate.id)
      )
      and (
        cursor_id is null
        or (candidate.normalized_alias, candidate.id) > (cursor_alias, cursor_id)
      )
    order by candidate.normalized_alias, candidate.id
    limit bounded_size + 1
  loop
    row_count := row_count + 1;
    if row_count <= bounded_size then
      profiles := profiles || jsonb_build_object('id', fetched.id, 'alias', fetched.alias, 'categories', fetched.categories);
      last_alias := fetched.normalized_alias;
      last_id := fetched.id;
    end if;
  end loop;

  return jsonb_build_object(
    'profiles', profiles,
    'next_cursor', case
      when row_count > bounded_size then encode(convert_to(jsonb_build_object('a', last_alias, 'u', last_id)::text, 'UTF8'), 'base64')
      else null
    end
  );
end;
$$;

revoke all on function public.list_directory(text, integer), public.search_aliases(text, text, integer) from public, anon;
grant execute on function public.list_directory(text, integer), public.search_aliases(text, text, integer) to authenticated;
