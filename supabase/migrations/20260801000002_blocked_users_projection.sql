-- The blocker alone needs a safe path to reverse a block after all mutual surfaces disappear.
-- This is a forward-only migration; rollback requires a compensating migration that revokes and drops this RPC.

create function public.list_blocked_users(cursor text default null, page_size integer default 20)
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
      cursor_alias := decoded ->> 'a';
      cursor_id := (decoded ->> 'u')::uuid;
      if cursor_alias is null or cursor_id is null then raise exception 'invalid cursor'; end if;
    exception when others then
      raise exception 'invalid cursor';
    end;
  end if;

  for fetched in
    select profile.id, profile.alias, profile.categories, profile.normalized_alias
    from public.blocks as block
    join public.public_profiles as profile on profile.id = block.blocked_id
    where block.blocker_id = actor
      and (cursor_id is null or (profile.normalized_alias, profile.id) > (cursor_alias, cursor_id))
    order by profile.normalized_alias, profile.id
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

revoke all on function public.list_blocked_users(text, integer) from public, anon;
grant execute on function public.list_blocked_users(text, integer) to authenticated;
