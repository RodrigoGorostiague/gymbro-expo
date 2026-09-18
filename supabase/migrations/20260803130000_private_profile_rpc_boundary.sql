-- Private profile data is accessible only through authenticated, actor-bound RPCs.
revoke all on table public.profiles from authenticated;

create or replace function public.get_own_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor();
  profile jsonb;
begin
  select jsonb_build_object(
    'id', id,
    'alias', alias,
    'avatar_id', avatar_id,
    'categories', categories,
    'category_visibility', category_visibility,
    'auto_share_completed_workouts', auto_share_completed_workouts,
    'share_routine_template', share_routine_template,
    'share_mesocycle_template', share_mesocycle_template,
    'share_performed_set_details', share_performed_set_details
  ) into profile
  from public.profiles
  where id = actor;

  return profile;
end;
$$;

create or replace function public.save_own_profile(profile_input jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor();
  alias_input text;
begin
  if profile_input is null
    or jsonb_typeof(profile_input) <> 'object'
    or not profile_input ?& array[
      'alias',
      'avatar_id',
      'categories',
      'category_visibility',
      'auto_share_completed_workouts',
      'share_routine_template',
      'share_mesocycle_template',
      'share_performed_set_details'
    ]
    or exists (select 1 from jsonb_object_keys(profile_input) as keys(value) where keys.value <> all(array[
      'alias',
      'avatar_id',
      'categories',
      'category_visibility',
      'auto_share_completed_workouts',
      'share_routine_template',
      'share_mesocycle_template',
      'share_performed_set_details'
    ]))
    or jsonb_typeof(profile_input -> 'alias') <> 'string'
    or jsonb_typeof(profile_input -> 'avatar_id') <> 'string'
    or jsonb_typeof(profile_input -> 'categories') <> 'object'
    or jsonb_typeof(profile_input -> 'category_visibility') <> 'object'
    or jsonb_typeof(profile_input -> 'auto_share_completed_workouts') <> 'boolean'
    or jsonb_typeof(profile_input -> 'share_routine_template') <> 'boolean'
    or jsonb_typeof(profile_input -> 'share_mesocycle_template') <> 'boolean'
    or jsonb_typeof(profile_input -> 'share_performed_set_details') <> 'boolean'
    or (case when jsonb_typeof(profile_input -> 'categories') = 'object'
      then exists (select 1 from jsonb_each(profile_input -> 'categories') as entries(key, value) where jsonb_typeof(entries.value) <> 'string')
      else true
    end)
    or (case when jsonb_typeof(profile_input -> 'category_visibility') = 'object'
      then exists (select 1 from jsonb_each(profile_input -> 'category_visibility') as entries(key, value) where jsonb_typeof(entries.value) <> 'boolean')
      else true
    end) then
    raise exception 'invalid profile input';
  end if;

  alias_input := trim(profile_input ->> 'alias');
  if char_length(alias_input) not between 3 and 320 then
    raise exception 'invalid profile alias';
  end if;

  perform private.ensure_actor_profile(actor);
  update public.profiles
  set alias = alias_input,
    avatar_id = profile_input ->> 'avatar_id',
    categories = profile_input -> 'categories',
    category_visibility = profile_input -> 'category_visibility',
    auto_share_completed_workouts = (profile_input ->> 'auto_share_completed_workouts')::boolean,
    share_routine_template = (profile_input ->> 'share_routine_template')::boolean,
    share_mesocycle_template = (profile_input ->> 'share_mesocycle_template')::boolean,
    share_performed_set_details = (profile_input ->> 'share_performed_set_details')::boolean
  where id = actor;
end;
$$;

create or replace function public.update_own_presentation_theme(theme_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor();
begin
  if theme_id is not null and char_length(theme_id) not between 1 and 80 then
    raise exception 'invalid presentation theme';
  end if;

  perform private.ensure_actor_profile(actor);
  update public.profiles
  set presentation_theme_id = theme_id
  where id = actor;
end;
$$;

revoke all on function public.get_own_profile(), public.save_own_profile(jsonb), public.update_own_presentation_theme(text) from public, anon, authenticated;
grant execute on function public.get_own_profile(), public.save_own_profile(jsonb), public.update_own_presentation_theme(text) to authenticated;
