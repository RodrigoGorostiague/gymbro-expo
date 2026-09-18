-- Social profile insights are aggregate-only projections for accepted circle members.
alter table public.profiles
  add column if not exists share_social_activity boolean not null default true,
  add column if not exists share_social_progress boolean not null default true,
  add column if not exists share_social_consistency boolean not null default true,
  add column if not exists share_social_statistics boolean not null default true,
  add column if not exists share_social_muscle_distribution boolean not null default true;

create or replace function public.get_own_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor uuid := public.require_actor(); profile jsonb;
begin
  select jsonb_build_object(
    'id', id, 'alias', alias, 'avatar_id', avatar_id, 'categories', categories,
    'category_visibility', category_visibility,
    'auto_share_completed_workouts', auto_share_completed_workouts,
    'share_routine_template', share_routine_template,
    'share_mesocycle_template', share_mesocycle_template,
    'share_performed_set_details', share_performed_set_details,
    'share_social_activity', share_social_activity,
    'share_social_progress', share_social_progress,
    'share_social_consistency', share_social_consistency,
    'share_social_statistics', share_social_statistics,
    'share_social_muscle_distribution', share_social_muscle_distribution
  ) into profile from public.profiles where id = actor;
  return profile;
end;
$$;

create or replace function public.save_own_profile(profile_input jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := public.require_actor(); alias_input text;
begin
  if profile_input is null or jsonb_typeof(profile_input) <> 'object'
    or not profile_input ?& array['alias', 'avatar_id', 'categories', 'category_visibility', 'auto_share_completed_workouts', 'share_routine_template', 'share_mesocycle_template', 'share_performed_set_details', 'share_social_activity', 'share_social_progress', 'share_social_consistency', 'share_social_statistics', 'share_social_muscle_distribution']
    or exists (select 1 from jsonb_object_keys(profile_input) as keys(value) where keys.value <> all(array['alias', 'avatar_id', 'categories', 'category_visibility', 'auto_share_completed_workouts', 'share_routine_template', 'share_mesocycle_template', 'share_performed_set_details', 'share_social_activity', 'share_social_progress', 'share_social_consistency', 'share_social_statistics', 'share_social_muscle_distribution']))
    or jsonb_typeof(profile_input -> 'alias') <> 'string'
    or jsonb_typeof(profile_input -> 'avatar_id') <> 'string'
    or jsonb_typeof(profile_input -> 'categories') <> 'object'
    or jsonb_typeof(profile_input -> 'category_visibility') <> 'object'
    or exists (select 1 from unnest(array['auto_share_completed_workouts', 'share_routine_template', 'share_mesocycle_template', 'share_performed_set_details', 'share_social_activity', 'share_social_progress', 'share_social_consistency', 'share_social_statistics', 'share_social_muscle_distribution']) key where jsonb_typeof(profile_input -> key) <> 'boolean')
    or exists (select 1 from jsonb_each(profile_input -> 'categories') as entries(key, value) where jsonb_typeof(entries.value) <> 'string')
    or exists (select 1 from jsonb_each(profile_input -> 'category_visibility') as entries(key, value) where jsonb_typeof(entries.value) <> 'boolean') then
    raise exception 'invalid profile input';
  end if;
  alias_input := trim(profile_input ->> 'alias');
  if char_length(alias_input) not between 3 and 320 then raise exception 'invalid profile alias'; end if;
  perform private.ensure_actor_profile(actor);
  update public.profiles set
    alias = alias_input, avatar_id = profile_input ->> 'avatar_id', categories = profile_input -> 'categories', category_visibility = profile_input -> 'category_visibility',
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

create function public.get_social_profile_insights(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor(); profile public.profiles%rowtype;
  insight jsonb := '{}'::jsonb; radar jsonb := '[]'::jsonb;
begin
  if target = actor or private.is_blocked_pair(actor, target) or not exists (
    select 1 from public.relationships where member_low = least(actor, target) and member_high = greatest(actor, target)
  ) then raise exception 'social profile unavailable'; end if;
  select * into profile from public.profiles where id = target;
  if not found then raise exception 'social profile unavailable'; end if;

  if profile.share_social_activity then
    insight := insight || jsonb_build_object('activity', jsonb_build_object(
      'last_completed_at', (select max((attempt.value ->> 'completedAt')::timestamptz) from public.training_states state cross join lateral jsonb_array_elements(state.attempts) attempt(value) where state.owner_id = target)
    ));
  end if;
  if profile.share_social_progress then
    insight := insight || jsonb_build_object('progress', coalesce((select public.experience_progress_payload(progress) from public.experience_progress progress where progress.owner_id = target), jsonb_build_object('level', 1, 'rank', 'Principiante')));
  end if;
  if profile.share_social_consistency then
    insight := insight || jsonb_build_object('consistency', jsonb_build_object(
      'workouts_last_28_days', (select count(*) from public.training_states state cross join lateral jsonb_array_elements(state.attempts) attempt(value) where state.owner_id = target and (attempt.value ->> 'completedAt')::timestamptz >= now() - interval '28 days'),
      'active_weeks_last_90_days', (select count(distinct date_trunc('week', (attempt.value ->> 'completedAt')::timestamptz)) from public.training_states state cross join lateral jsonb_array_elements(state.attempts) attempt(value) where state.owner_id = target and (attempt.value ->> 'completedAt')::timestamptz >= now() - interval '90 days')
    ));
  end if;
  if profile.share_social_statistics then
    insight := insight || jsonb_build_object('statistics', jsonb_build_object(
      'workouts_last_90_days', (select count(*) from public.training_states state cross join lateral jsonb_array_elements(state.attempts) attempt(value) where state.owner_id = target and (attempt.value ->> 'completedAt')::timestamptz >= now() - interval '90 days'),
      'completed_exercises_last_90_days', (select count(*) from public.training_states state cross join lateral jsonb_array_elements(state.attempts) attempt(value) cross join lateral jsonb_array_elements(attempt.value -> 'exercises') exercise(value) where state.owner_id = target and (attempt.value ->> 'completedAt')::timestamptz >= now() - interval '90 days' and exists (select 1 from jsonb_array_elements(exercise.value -> 'sets') set_item(value) where set_item.value -> 'result' ->> 'performed' = 'true'))
    ));
  end if;
  if profile.share_social_muscle_distribution then
    with recursive exercise_groups as (
      select exercise.value as exercise, coalesce(exercise.value -> 'catalog' -> 'muscleParticipations', '[]'::jsonb) as participations
      from public.training_states state
      cross join lateral jsonb_array_elements(state.attempts) attempt(value)
      cross join lateral jsonb_array_elements(attempt.value -> 'exercises') exercise(value)
      where state.owner_id = target and (attempt.value ->> 'completedAt')::timestamptz >= now() - interval '90 days'
        and exists (select 1 from jsonb_array_elements(exercise.value -> 'sets') set_item(value) where set_item.value -> 'result' ->> 'performed' = 'true')
    ), parents as (
      select distinct group_item.id, group_item.display_name
      from public.muscle_groups group_item
      where group_item.type = 'Grupo padre' and group_item.visible_in_filters
    ), counts as (
      select parent.id, parent.display_name, count(distinct exercise_groups.exercise)::integer as value
      from parents parent
      left join public.muscle_group_relations relation on relation.parent_muscle_group_id = parent.id
      left join exercise_groups on exists (select 1 from jsonb_array_elements(exercise_groups.participations) participation(value) where participation.value ->> 'muscleGroupId' in (parent.id, relation.child_muscle_group_id))
      group by parent.id, parent.display_name
    ) select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', display_name, 'value', value) order by display_name), '[]'::jsonb) into radar from counts;
    insight := insight || jsonb_build_object('muscle_distribution', radar);
  end if;
  return insight;
end;
$$;

revoke all on function public.get_social_profile_insights(uuid) from public, anon;
grant execute on function public.get_social_profile_insights(uuid) to authenticated;
