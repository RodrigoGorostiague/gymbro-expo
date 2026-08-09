-- Alfa User is an additional level-70 frame and title. Alfa legacy remains level-70 gated.
alter table public.profiles drop constraint if exists profiles_equipped_frame_id_check;
alter table public.profiles add constraint profiles_equipped_frame_id_check check (equipped_frame_id in (
  'principiante', 'intermedio', 'avanzado', 'gymbro', 'gymrat', 'g-boom', 'alfa', 'alfa-user', 'sigma',
  'brawl-rookie', 'brawl-contender', 'brawl-challenger', 'brawl-elite', 'brawl-apex', 'brawl-titan', 'brawl-warlord', 'brawl-legend'
));

alter table public.public_profiles drop constraint if exists public_profiles_equipped_frame_id_check;
alter table public.public_profiles add constraint public_profiles_equipped_frame_id_check check (equipped_frame_id in (
  'principiante', 'intermedio', 'avanzado', 'gymbro', 'gymrat', 'g-boom', 'alfa', 'alfa-user', 'sigma',
  'brawl-rookie', 'brawl-contender', 'brawl-challenger', 'brawl-elite', 'brawl-apex', 'brawl-titan', 'brawl-warlord', 'brawl-legend'
));

create or replace function public.profile_frame_unlock_level(frame_id_input text)
returns integer language sql immutable set search_path = '' as $$
  select case frame_id_input
    when 'principiante' then 1
    when 'intermedio' then 5
    when 'avanzado' then 10
    when 'gymbro' then 20
    when 'gymrat' then 35
    when 'g-boom' then 50
    when 'alfa' then 70
    when 'alfa-user' then 70
    when 'sigma' then 85
    else null
  end
$$;

alter table public.profiles drop constraint if exists profiles_equipped_title_id_check;
alter table public.profiles add constraint profiles_equipped_title_id_check check (equipped_title_id in (
  'principiante', 'intermedio', 'avanzado', 'gymbro', 'gymrat', 'g-boom', 'alfa', 'alfa-user', 'sigma',
  'brawl-rookie', 'brawl-contender', 'brawl-challenger', 'brawl-elite', 'brawl-apex', 'brawl-titan', 'brawl-warlord', 'brawl-legend'
));

alter table public.public_profiles drop constraint if exists public_profiles_equipped_title_id_check;
alter table public.public_profiles add constraint public_profiles_equipped_title_id_check check (equipped_title_id in (
  'principiante', 'intermedio', 'avanzado', 'gymbro', 'gymrat', 'g-boom', 'alfa', 'alfa-user', 'sigma',
  'brawl-rookie', 'brawl-contender', 'brawl-challenger', 'brawl-elite', 'brawl-apex', 'brawl-titan', 'brawl-warlord', 'brawl-legend'
));

create or replace function public.profile_title_unlock_level(title_id_input text)
returns integer language sql immutable set search_path = '' as $$
  select case title_id_input
    when 'principiante' then 1
    when 'intermedio' then 5
    when 'avanzado' then 10
    when 'gymbro' then 20
    when 'gymrat' then 35
    when 'g-boom' then 50
    when 'alfa' then 70
    when 'alfa-user' then 70
    when 'sigma' then 85
    else null
  end
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
    or public.profile_title_unlock_level(title_id_input) is null or current_level < public.profile_title_unlock_level(title_id_input) then raise exception 'profile frame or title is not unlocked'; end if;
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

revoke all on function public.profile_title_unlock_level(text) from public, anon, authenticated;
