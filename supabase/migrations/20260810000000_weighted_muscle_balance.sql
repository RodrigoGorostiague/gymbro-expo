-- Muscle balance is a weighted parent-group projection shared by private and social profiles.
alter table public.profiles
  add column if not exists muscle_balance_target_id text not null default 'balanced'
  check (muscle_balance_target_id in ('balanced', 'upper', 'lower'));

create or replace function public.list_catalog_muscle_groups_with_parents()
returns table (
  id text,
  name text,
  type text,
  level integer,
  visible_in_filters boolean,
  display_name text,
  path text,
  parent_group_ids text[]
)
language sql stable security definer set search_path = '' as $$
  with recursive parents as (
    select group_item.id from public.muscle_groups group_item
    where group_item.type = 'Grupo padre' and group_item.visible_in_filters
  ), descendants(parent_id, id) as (
    select parent.id, parent.id from parents parent
    union
    select descendants.parent_id, relation.child_muscle_group_id
    from descendants
    join public.muscle_group_relations relation on relation.parent_muscle_group_id = descendants.id
  )
  select group_item.id, group_item.name, group_item.type, group_item.level,
    group_item.visible_in_filters, group_item.display_name, group_item.path,
    coalesce(array_agg(distinct descendants.parent_id order by descendants.parent_id) filter (where descendants.parent_id is not null), '{}'::text[])
  from public.muscle_groups group_item
  left join descendants on descendants.id = group_item.id
  group by group_item.id, group_item.name, group_item.type, group_item.level,
    group_item.visible_in_filters, group_item.display_name, group_item.path
  order by group_item.path, group_item.name, group_item.id
$$;

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
    'share_social_statistics', share_social_statistics, 'share_social_muscle_distribution', share_social_muscle_distribution,
    'muscle_balance_target_id', muscle_balance_target_id
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
    or exists (select 1 from jsonb_object_keys(profile_input) as keys(value) where keys.value <> all(array['alias', 'avatar_id', 'equipped_frame_id', 'equipped_title_id', 'categories', 'category_visibility', 'auto_share_completed_workouts', 'share_routine_template', 'share_mesocycle_template', 'share_performed_set_details', 'share_social_activity', 'share_social_progress', 'share_social_consistency', 'share_social_statistics', 'share_social_muscle_distribution', 'muscle_balance_target_id']))
    or jsonb_typeof(profile_input -> 'alias') <> 'string' or jsonb_typeof(profile_input -> 'avatar_id') <> 'string'
    or jsonb_typeof(profile_input -> 'equipped_frame_id') <> 'string' or jsonb_typeof(profile_input -> 'equipped_title_id') not in ('string', 'null')
    or jsonb_typeof(profile_input -> 'categories') <> 'object' or jsonb_typeof(profile_input -> 'category_visibility') <> 'object'
    or (profile_input ? 'muscle_balance_target_id' and (jsonb_typeof(profile_input -> 'muscle_balance_target_id') <> 'string' or profile_input ->> 'muscle_balance_target_id' not in ('balanced', 'upper', 'lower')))
    or exists (select 1 from unnest(array['auto_share_completed_workouts', 'share_routine_template', 'share_mesocycle_template', 'share_performed_set_details', 'share_social_activity', 'share_social_progress', 'share_social_consistency', 'share_social_statistics', 'share_social_muscle_distribution']) key where jsonb_typeof(profile_input -> key) <> 'boolean')
    or exists (select 1 from jsonb_each(profile_input -> 'categories') as entries(key, value) where jsonb_typeof(entries.value) <> 'string')
    or exists (select 1 from jsonb_each(profile_input -> 'category_visibility') as entries(key, value) where jsonb_typeof(entries.value) <> 'boolean') then raise exception 'invalid profile input'; end if;
  alias_input := trim(profile_input ->> 'alias'); frame_id_input := profile_input ->> 'equipped_frame_id'; title_id_input := profile_input ->> 'equipped_title_id';
  select coalesce(level, 1) into current_level from public.experience_progress where owner_id = actor;
  current_level := coalesce(current_level, 1);
  if char_length(alias_input) not between 3 and 320 then raise exception 'invalid profile alias'; end if;
  if (public.profile_frame_unlock_level(frame_id_input) is null or current_level < public.profile_frame_unlock_level(frame_id_input)) and not exists (select 1 from public.reward_profile_frame_inventory where owner_id = actor and frame_id = frame_id_input) then raise exception 'profile frame is not unlocked'; end if;
  if title_id_input is not null and (public.profile_title_unlock_level(title_id_input) is null or current_level < public.profile_title_unlock_level(title_id_input)) and not exists (select 1 from public.reward_profile_title_inventory where owner_id = actor and title_id = title_id_input) then raise exception 'profile title is not unlocked'; end if;
  perform private.ensure_actor_profile(actor);
  update public.profiles set alias = alias_input, avatar_id = profile_input ->> 'avatar_id', equipped_frame_id = frame_id_input, equipped_title_id = title_id_input, categories = profile_input -> 'categories', category_visibility = profile_input -> 'category_visibility', auto_share_completed_workouts = (profile_input ->> 'auto_share_completed_workouts')::boolean, share_routine_template = (profile_input ->> 'share_routine_template')::boolean, share_mesocycle_template = (profile_input ->> 'share_mesocycle_template')::boolean, share_performed_set_details = (profile_input ->> 'share_performed_set_details')::boolean, share_social_activity = (profile_input ->> 'share_social_activity')::boolean, share_social_progress = (profile_input ->> 'share_social_progress')::boolean, share_social_consistency = (profile_input ->> 'share_social_consistency')::boolean, share_social_statistics = (profile_input ->> 'share_social_statistics')::boolean, share_social_muscle_distribution = (profile_input ->> 'share_social_muscle_distribution')::boolean, muscle_balance_target_id = coalesce(profile_input ->> 'muscle_balance_target_id', muscle_balance_target_id) where id = actor;
end;
$$;

create or replace function public.get_social_profile_insights(target uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); profile public.profiles%rowtype; insight jsonb := '{}'::jsonb; radar jsonb := '[]'::jsonb;
begin
  if target = actor or private.is_blocked_pair(actor, target) or not exists (select 1 from public.relationships where member_low = least(actor, target) and member_high = greatest(actor, target)) then raise exception 'social profile unavailable'; end if;
  select * into profile from public.profiles where id = target;
  if not found then raise exception 'social profile unavailable'; end if;
  if profile.share_social_activity then insight := insight || jsonb_build_object('activity', jsonb_build_object('last_completed_at', (select max((attempt.value ->> 'completedAt')::timestamptz) from public.training_states state cross join lateral jsonb_array_elements(state.attempts) attempt(value) where state.owner_id = target))); end if;
  if profile.share_social_progress then insight := insight || jsonb_build_object('progress', coalesce((select public.experience_progress_payload(progress) from public.experience_progress progress where progress.owner_id = target), jsonb_build_object('level', 1, 'rank', 'Principiante'))); end if;
  if profile.share_social_consistency then insight := insight || jsonb_build_object('consistency', jsonb_build_object('workouts_last_28_days', (select count(*) from public.training_states state cross join lateral jsonb_array_elements(state.attempts) attempt(value) where state.owner_id = target and (attempt.value ->> 'completedAt')::timestamptz >= now() - interval '28 days'), 'active_weeks_last_90_days', (select count(distinct date_trunc('week', (attempt.value ->> 'completedAt')::timestamptz)) from public.training_states state cross join lateral jsonb_array_elements(state.attempts) attempt(value) where state.owner_id = target and (attempt.value ->> 'completedAt')::timestamptz >= now() - interval '90 days'))); end if;
  if profile.share_social_statistics then insight := insight || jsonb_build_object('statistics', jsonb_build_object('workouts_last_90_days', (select count(*) from public.training_states state cross join lateral jsonb_array_elements(state.attempts) attempt(value) where state.owner_id = target and (attempt.value ->> 'completedAt')::timestamptz >= now() - interval '90 days'), 'completed_exercises_last_90_days', (select count(*) from public.training_states state cross join lateral jsonb_array_elements(state.attempts) attempt(value) cross join lateral jsonb_array_elements(attempt.value -> 'exercises') exercise(value) where state.owner_id = target and (attempt.value ->> 'completedAt')::timestamptz >= now() - interval '90 days' and exists (select 1 from jsonb_array_elements(exercise.value -> 'sets') set_item(value) where set_item.value -> 'result' ->> 'performed' = 'true')))); end if;
  if profile.share_social_muscle_distribution then
    with recursive parents as (
      select group_item.id, group_item.display_name from public.muscle_groups group_item where group_item.type = 'Grupo padre' and group_item.visible_in_filters
    ), descendants(parent_id, id) as (
      select parent.id, parent.id from parents parent
      union
      select descendants.parent_id, relation.child_muscle_group_id from descendants join public.muscle_group_relations relation on relation.parent_muscle_group_id = descendants.id
    ), exercise_groups as (
      select attempt.ordinality as attempt_index, exercise.ordinality as exercise_index,
        case when jsonb_array_length(coalesce(exercise.value -> 'catalog' -> 'muscleParticipations', '[]'::jsonb)) > 0 then exercise.value -> 'catalog' -> 'muscleParticipations'
        when exercise.value -> 'attribution' ->> 'primary' is not null then jsonb_build_array(jsonb_build_object('muscleGroupId', exercise.value -> 'attribution' ->> 'primary', 'relevance', 1)) || coalesce((select jsonb_agg(jsonb_build_object('muscleGroupId', secondary.value, 'relevance', .5)) from jsonb_array_elements_text(coalesce(exercise.value -> 'attribution' -> 'secondary', '[]'::jsonb)) secondary(value)), '[]'::jsonb)
        else '[]'::jsonb end as participations
      from public.training_states state cross join lateral jsonb_array_elements(state.attempts) with ordinality attempt(value, ordinality) cross join lateral jsonb_array_elements(attempt.value -> 'exercises') with ordinality exercise(value, ordinality)
      where state.owner_id = target and (attempt.value ->> 'completedAt')::timestamptz >= now() - interval '90 days' and exists (select 1 from jsonb_array_elements(exercise.value -> 'sets') set_item(value) where set_item.value -> 'result' ->> 'performed' = 'true')
    ), exercise_contributions as (
      select exercise_groups.attempt_index, exercise_groups.exercise_index, descendants.parent_id, least(1::numeric, sum(case when jsonb_typeof(participation.value -> 'relevance') = 'number' then (participation.value ->> 'relevance')::numeric when participation.value ->> 'role' = 'Principal' then 1::numeric else .5::numeric end)) as value
      from exercise_groups cross join lateral jsonb_array_elements(exercise_groups.participations) participation(value) join descendants on descendants.id = participation.value ->> 'muscleGroupId'
      group by exercise_groups.attempt_index, exercise_groups.exercise_index, descendants.parent_id
    ), counts as (
      select parents.id, parents.display_name, coalesce(round(sum(exercise_contributions.value), 3), 0) as value
      from parents left join exercise_contributions on exercise_contributions.parent_id = parents.id group by parents.id, parents.display_name
    ) select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', display_name, 'value', value) order by display_name), '[]'::jsonb) into radar from counts;
    insight := insight || jsonb_build_object('muscle_distribution', radar);
  end if;
  return insight;
end;
$$;

revoke all on function public.list_catalog_muscle_groups_with_parents() from public, anon;
grant execute on function public.list_catalog_muscle_groups_with_parents() to authenticated;
