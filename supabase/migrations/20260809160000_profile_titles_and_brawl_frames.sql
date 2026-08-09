-- Titles are public presentation metadata. Brawl titles remain unavailable until Brawls ship.
alter table public.profiles
  add column equipped_title_id text not null default 'principiante'
  check (equipped_title_id in ('principiante', 'intermedio', 'avanzado', 'gymbro', 'gymrat', 'g-boom', 'alfa', 'sigma', 'brawl-rookie', 'brawl-contender', 'brawl-challenger', 'brawl-elite', 'brawl-apex', 'brawl-titan', 'brawl-warlord', 'brawl-legend'));

alter table public.public_profiles
  add column equipped_title_id text not null default 'principiante'
  check (equipped_title_id in ('principiante', 'intermedio', 'avanzado', 'gymbro', 'gymrat', 'g-boom', 'alfa', 'sigma', 'brawl-rookie', 'brawl-contender', 'brawl-challenger', 'brawl-elite', 'brawl-apex', 'brawl-titan', 'brawl-warlord', 'brawl-legend'));

update public.public_profiles as public_profile
set equipped_title_id = profile.equipped_title_id
from public.profiles as profile
where profile.id = public_profile.id
  and public_profile.equipped_title_id is distinct from profile.equipped_title_id;

create or replace function public.refresh_public_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare visible_categories jsonb;
begin
  if tg_op = 'DELETE' then delete from public.public_profiles where id = old.id; return old; end if;
  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb) into visible_categories
  from jsonb_each(new.categories) as entry(key, value)
  where coalesce((new.category_visibility ->> entry.key)::boolean, true);
  insert into public.public_profiles (id, alias, normalized_alias, categories, avatar_id, presentation_theme_id, equipped_frame_id, equipped_title_id, updated_at)
  values (new.id, new.alias, new.normalized_alias, visible_categories, new.avatar_id, new.presentation_theme_id, new.equipped_frame_id, new.equipped_title_id, now())
  on conflict (id) do update set alias = excluded.alias, normalized_alias = excluded.normalized_alias, categories = excluded.categories,
    avatar_id = excluded.avatar_id, presentation_theme_id = excluded.presentation_theme_id, equipped_frame_id = excluded.equipped_frame_id,
    equipped_title_id = excluded.equipped_title_id, updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger profiles_public_projection on public.profiles;
create trigger profiles_public_projection
after insert or update of alias, categories, category_visibility, avatar_id, presentation_theme_id, equipped_frame_id, equipped_title_id or delete on public.profiles
for each row execute function public.refresh_public_profile();

create or replace function public.get_own_profile()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); profile jsonb;
begin
  select jsonb_build_object(
    'id', id, 'alias', alias, 'avatar_id', avatar_id, 'equipped_frame_id', equipped_frame_id, 'equipped_title_id', equipped_title_id,
    'categories', categories, 'category_visibility', category_visibility, 'auto_share_completed_workouts', auto_share_completed_workouts,
    'share_routine_template', share_routine_template, 'share_mesocycle_template', share_mesocycle_template,
    'share_performed_set_details', share_performed_set_details, 'share_social_activity', share_social_activity,
    'share_social_progress', share_social_progress, 'share_social_consistency', share_social_consistency,
    'share_social_statistics', share_social_statistics, 'share_social_muscle_distribution', share_social_muscle_distribution
  ) into profile from public.profiles where id = actor;
  return profile;
end;
$$;

create or replace function public.save_own_profile(profile_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); alias_input text; frame_id_input text; title_id_input text; current_level integer;
begin
  if profile_input is null or jsonb_typeof(profile_input) <> 'object'
    or not profile_input ?& array['alias', 'avatar_id', 'equipped_frame_id', 'equipped_title_id', 'categories', 'category_visibility', 'auto_share_completed_workouts', 'share_routine_template', 'share_mesocycle_template', 'share_performed_set_details', 'share_social_activity', 'share_social_progress', 'share_social_consistency', 'share_social_statistics', 'share_social_muscle_distribution']
    or exists (select 1 from jsonb_object_keys(profile_input) as keys(value) where keys.value <> all(array['alias', 'avatar_id', 'equipped_frame_id', 'equipped_title_id', 'categories', 'category_visibility', 'auto_share_completed_workouts', 'share_routine_template', 'share_mesocycle_template', 'share_performed_set_details', 'share_social_activity', 'share_social_progress', 'share_social_consistency', 'share_social_statistics', 'share_social_muscle_distribution']))
    or jsonb_typeof(profile_input -> 'alias') <> 'string' or jsonb_typeof(profile_input -> 'avatar_id') <> 'string'
    or jsonb_typeof(profile_input -> 'equipped_frame_id') <> 'string' or jsonb_typeof(profile_input -> 'equipped_title_id') <> 'string'
    or jsonb_typeof(profile_input -> 'categories') <> 'object' or jsonb_typeof(profile_input -> 'category_visibility') <> 'object'
    or exists (select 1 from unnest(array['auto_share_completed_workouts', 'share_routine_template', 'share_mesocycle_template', 'share_performed_set_details', 'share_social_activity', 'share_social_progress', 'share_social_consistency', 'share_social_statistics', 'share_social_muscle_distribution']) key where jsonb_typeof(profile_input -> key) <> 'boolean')
    or exists (select 1 from jsonb_each(profile_input -> 'categories') as entries(key, value) where jsonb_typeof(entries.value) <> 'string')
    or exists (select 1 from jsonb_each(profile_input -> 'category_visibility') as entries(key, value) where jsonb_typeof(entries.value) <> 'boolean') then raise exception 'invalid profile input'; end if;
  alias_input := trim(profile_input ->> 'alias'); frame_id_input := profile_input ->> 'equipped_frame_id'; title_id_input := profile_input ->> 'equipped_title_id';
  select coalesce(level, 1) into current_level from public.experience_progress where owner_id = actor;
  current_level := coalesce(current_level, 1);
  if char_length(alias_input) not between 3 and 320 then raise exception 'invalid profile alias'; end if;
  if public.profile_frame_unlock_level(frame_id_input) is null or current_level < public.profile_frame_unlock_level(frame_id_input)
    or public.profile_frame_unlock_level(title_id_input) is null or current_level < public.profile_frame_unlock_level(title_id_input) then raise exception 'profile frame or title is not unlocked'; end if;
  perform private.ensure_actor_profile(actor);
  update public.profiles set alias = alias_input, avatar_id = profile_input ->> 'avatar_id', equipped_frame_id = frame_id_input,
    equipped_title_id = title_id_input, categories = profile_input -> 'categories', category_visibility = profile_input -> 'category_visibility',
    auto_share_completed_workouts = (profile_input ->> 'auto_share_completed_workouts')::boolean,
    share_routine_template = (profile_input ->> 'share_routine_template')::boolean,
    share_mesocycle_template = (profile_input ->> 'share_mesocycle_template')::boolean,
    share_performed_set_details = (profile_input ->> 'share_performed_set_details')::boolean,
    share_social_activity = (profile_input ->> 'share_social_activity')::boolean,
    share_social_progress = (profile_input ->> 'share_social_progress')::boolean,
    share_social_consistency = (profile_input ->> 'share_social_consistency')::boolean,
    share_social_statistics = (profile_input ->> 'share_social_statistics')::boolean,
    share_social_muscle_distribution = (profile_input ->> 'share_social_muscle_distribution')::boolean
  where id = actor;
end;
$$;

create or replace function public.list_directory(cursor text default null, page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); bounded_size integer := least(greatest(coalesce(page_size, 20), 1), 50); decoded jsonb; cursor_bucket smallint; cursor_rank uuid; cursor_id uuid; fetched record; profiles jsonb := '[]'::jsonb; row_count integer := 0; last_bucket smallint; last_rank uuid; last_id uuid;
begin
  if cursor is not null then begin decoded := convert_from(decode(cursor, 'base64'), 'UTF8')::jsonb; cursor_bucket := (decoded ->> 'b')::smallint; cursor_rank := (decoded ->> 'r')::uuid; cursor_id := (decoded ->> 'u')::uuid; if cursor_bucket is null or cursor_bucket < 0 or cursor_bucket > 127 or cursor_rank is null or cursor_id is null then raise exception 'invalid cursor'; end if; exception when others then raise exception 'invalid cursor'; end; end if;
  for fetched in select candidate.id, candidate.alias, candidate.categories, candidate.avatar_id, candidate.equipped_frame_id, candidate.equipped_title_id, candidate.presentation_theme_id, candidate.directory_bucket, candidate.directory_rank from public.public_profiles as candidate where candidate.id <> actor and not private.is_blocked_pair(actor, candidate.id) and not exists (select 1 from public.relationships as rel where rel.member_low = least(actor, candidate.id) and rel.member_high = greatest(actor, candidate.id)) and not exists (select 1 from public.relationship_requests as pending where pending.member_low = least(actor, candidate.id) and pending.member_high = greatest(actor, candidate.id)) and (cursor_id is null or (candidate.directory_bucket, candidate.directory_rank, candidate.id) > (cursor_bucket, cursor_rank, cursor_id)) order by candidate.directory_bucket, candidate.directory_rank, candidate.id limit bounded_size + 1 loop
    row_count := row_count + 1; if row_count <= bounded_size then profiles := profiles || jsonb_build_object('id', fetched.id, 'alias', fetched.alias, 'categories', fetched.categories, 'avatar_id', fetched.avatar_id, 'equipped_frame_id', fetched.equipped_frame_id, 'equipped_title_id', fetched.equipped_title_id, 'presentation_theme_id', fetched.presentation_theme_id); last_bucket := fetched.directory_bucket; last_rank := fetched.directory_rank; last_id := fetched.id; end if;
  end loop;
  return jsonb_build_object('profiles', profiles, 'next_cursor', case when row_count > bounded_size then encode(convert_to(jsonb_build_object('b', last_bucket, 'r', last_rank, 'u', last_id)::text, 'UTF8'), 'base64') else null end);
end;
$$;

create or replace function private.social_projection_page(projection text, prefix text default null, cursor text default null, page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); bounded_size integer := least(greatest(coalesce(page_size, 20), 1), 50); normalized text := case when prefix is null then null else public.normalize_alias(prefix) end; escaped text; decoded jsonb; cursor_alias text; cursor_id uuid; fetched record; profiles jsonb := '[]'::jsonb; row_count integer := 0; last_alias text; last_id uuid;
begin
  if projection not in ('search', 'circle', 'requests') then raise exception 'invalid projection'; end if; if projection = 'search' and normalized = '' then raise exception 'invalid prefix'; end if; if normalized is not null then escaped := replace(replace(replace(normalized, '\\', '\\\\'), '%', '\\%'), '_', '\\_'); end if;
  if cursor is not null then begin decoded := convert_from(decode(cursor, 'base64'), 'UTF8')::jsonb; cursor_alias := decoded ->> 'a'; cursor_id := (decoded ->> 'u')::uuid; if cursor_alias is null or cursor_id is null then raise exception 'invalid cursor'; end if; exception when others then raise exception 'invalid cursor'; end; end if;
  for fetched in select candidate.id, candidate.alias, candidate.categories, candidate.avatar_id, candidate.equipped_frame_id, candidate.equipped_title_id, candidate.presentation_theme_id, candidate.normalized_alias, case when rel.kind is not null then rel.kind::text when outgoing.requester_id is not null then 'outgoing_request' when incoming.requester_id is not null then 'incoming_request' else 'discover' end as relationship_status, coalesce(outgoing.requested_kind, incoming.requested_kind)::text as requested_kind from public.public_profiles as candidate left join public.relationships as rel on rel.member_low = least(actor, candidate.id) and rel.member_high = greatest(actor, candidate.id) left join public.relationship_requests as outgoing on outgoing.requester_id = actor and outgoing.recipient_id = candidate.id left join public.relationship_requests as incoming on incoming.requester_id = candidate.id and incoming.recipient_id = actor where candidate.id <> actor and not private.is_blocked_pair(actor, candidate.id) and (projection <> 'search' or candidate.normalized_alias like escaped || '%') and (projection <> 'circle' or rel.kind is not null) and (projection <> 'requests' or outgoing.requester_id is not null or incoming.requester_id is not null) and (cursor_id is null or (candidate.normalized_alias, candidate.id) > (cursor_alias, cursor_id)) order by candidate.normalized_alias, candidate.id limit bounded_size + 1 loop
    row_count := row_count + 1; if row_count <= bounded_size then profiles := profiles || jsonb_build_object('id', fetched.id, 'alias', fetched.alias, 'categories', fetched.categories, 'avatar_id', fetched.avatar_id, 'equipped_frame_id', fetched.equipped_frame_id, 'equipped_title_id', fetched.equipped_title_id, 'presentation_theme_id', fetched.presentation_theme_id, 'relationship_status', fetched.relationship_status, 'requested_kind', fetched.requested_kind); last_alias := fetched.normalized_alias; last_id := fetched.id; end if;
  end loop;
  return jsonb_build_object('profiles', profiles, 'next_cursor', case when row_count > bounded_size then encode(convert_to(jsonb_build_object('a', last_alias, 'u', last_id)::text, 'UTF8'), 'base64') else null end);
end;
$$;

create or replace function public.list_blocked_users(cursor text default null, page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); bounded_size integer := least(greatest(coalesce(page_size, 20), 1), 50); decoded jsonb; cursor_alias text; cursor_id uuid; fetched record; profiles jsonb := '[]'::jsonb; row_count integer := 0; last_alias text; last_id uuid;
begin
  if cursor is not null then begin decoded := convert_from(decode(cursor, 'base64'), 'UTF8')::jsonb; cursor_alias := decoded ->> 'a'; cursor_id := (decoded ->> 'u')::uuid; if cursor_alias is null or cursor_id is null then raise exception 'invalid cursor'; end if; exception when others then raise exception 'invalid cursor'; end; end if;
  for fetched in select profile.id, profile.alias, profile.categories, profile.avatar_id, profile.equipped_frame_id, profile.equipped_title_id, profile.normalized_alias from public.blocks as block join public.public_profiles as profile on profile.id = block.blocked_id where block.blocker_id = actor and (cursor_id is null or (profile.normalized_alias, profile.id) > (cursor_alias, cursor_id)) order by profile.normalized_alias, profile.id limit bounded_size + 1 loop
    row_count := row_count + 1; if row_count <= bounded_size then profiles := profiles || jsonb_build_object('id', fetched.id, 'alias', fetched.alias, 'categories', fetched.categories, 'avatar_id', fetched.avatar_id, 'equipped_frame_id', fetched.equipped_frame_id, 'equipped_title_id', fetched.equipped_title_id); last_alias := fetched.normalized_alias; last_id := fetched.id; end if;
  end loop;
  return jsonb_build_object('profiles', profiles, 'next_cursor', case when row_count > bounded_size then encode(convert_to(jsonb_build_object('a', last_alias, 'u', last_id)::text, 'UTF8'), 'base64') else null end);
end;
$$;
