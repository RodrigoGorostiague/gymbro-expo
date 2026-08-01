-- Relationship-aware Community projections. Discovery remains limited to new connections.
-- This forward-only correction preserves graph records and keeps block checks server-side.

create function private.social_projection_page(
  projection text,
  prefix text default null,
  cursor text default null,
  page_size integer default 20
)
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
  if normalized is not null then
    escaped := replace(replace(replace(normalized, '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  if cursor is not null then
    begin
      decoded := convert_from(decode(cursor, 'base64'), 'UTF8')::jsonb;
      cursor_alias := decoded ->> 'a';
      cursor_id := (decoded ->> 'u')::uuid;
      if cursor_alias is null or cursor_id is null then raise exception 'invalid cursor'; end if;
    exception when others then
      raise exception 'invalid cursor';
    end;
  end if;

  for fetched in
    select candidate.id, candidate.alias, candidate.categories, candidate.normalized_alias,
      case
        when rel.kind is not null then rel.kind::text
        when outgoing.requester_id is not null then 'outgoing_request'
        when incoming.requester_id is not null then 'incoming_request'
        else 'discover'
      end as relationship_status
    from public.public_profiles as candidate
    left join public.relationships as rel
      on rel.member_low = least(actor, candidate.id) and rel.member_high = greatest(actor, candidate.id)
    left join public.relationship_requests as outgoing
      on outgoing.requester_id = actor and outgoing.recipient_id = candidate.id
    left join public.relationship_requests as incoming
      on incoming.requester_id = candidate.id and incoming.recipient_id = actor
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
      profiles := profiles || jsonb_build_object(
        'id', fetched.id,
        'alias', fetched.alias,
        'categories', fetched.categories,
        'relationship_status', fetched.relationship_status
      );
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

create or replace function public.search_aliases(prefix text, cursor text default null, page_size integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.social_projection_page('search', prefix, cursor, page_size); $$;

create function public.list_circle(cursor text default null, page_size integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.social_projection_page('circle', null, cursor, page_size); $$;

create function public.list_requests(cursor text default null, page_size integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.social_projection_page('requests', null, cursor, page_size); $$;

revoke all on function private.social_projection_page(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.list_circle(text, integer), public.list_requests(text, integer) from public, anon;
grant execute on function public.search_aliases(text, text, integer), public.list_circle(text, integer), public.list_requests(text, integer) to authenticated;
