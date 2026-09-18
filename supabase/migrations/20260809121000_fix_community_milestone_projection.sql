-- Correct the initially deployed milestone projection without rewriting migration history.
create or replace function private.publish_training_community_milestones(author uuid, attempt_id_input text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  attempt public.experience_attempts%rowtype;
  lineage jsonb; mesocycle_id_value text; mesocycle_week_value integer;
  planned_count integer; completed_count integer; perfect_count integer;
  streak integer; weekly_volume numeric; monthly_volume numeric; prior_volume numeric;
  month_start date; current_month_weeks integer; prior_muscle_groups integer; current_muscle_groups integer;
  record_row record;
begin
  select * into attempt from public.experience_attempts where owner_id = author and attempt_id = attempt_id_input;
  if not found then return; end if;

  select score.exercise_key, score.score, score.unit, exercise.canonical_name into record_row
  from public.experience_exercise_best_scores(attempt.snapshot) score join public.exercises exercise on lower(exercise.id) = score.exercise_key
  where exists (select 1 from public.experience_attempts history cross join lateral public.experience_exercise_best_scores(history.snapshot) prior
    where history.owner_id = author and history.attempt_id <> attempt_id_input and prior.exercise_key = score.exercise_key and prior.mode = score.mode and prior.unit = score.unit
    group by prior.exercise_key, prior.mode, prior.unit having score.score > max(prior.score))
  order by score.score desc, score.exercise_key limit 1;
  if record_row is not null then
    perform private.publish_community_activity(author, 'personal_record', format('personal-record:%s', attempt_id_input),
      jsonb_build_object('exercise_name', record_row.canonical_name, 'best_score', round(record_row.score, 2), 'score_unit', record_row.unit || '-reps'));
  end if;

  if attempt.adherence >= .7 and exists (select 1 from public.experience_weekly_goals goal where goal.owner_id = author and goal.week_start = attempt.week_start and goal.reached_at is not null) then
    select target into planned_count from public.experience_weekly_goals where owner_id = author and week_start = attempt.week_start;
    perform private.publish_community_activity(author, 'weekly_goal', format('weekly-goal:%s', attempt.week_start), jsonb_build_object('week_start', attempt.week_start, 'target_workouts', planned_count));
    select count(*) into streak from public.experience_weekly_goals goal where goal.owner_id = author and goal.reached_at is not null and goal.week_start <= attempt.week_start
      and not exists (select 1 from generate_series(goal.week_start + 7, attempt.week_start, interval '7 days') missing(week_start) left join public.experience_weekly_goals present on present.owner_id = author and present.week_start = missing.week_start::date and present.reached_at is not null where present.week_start is null);
    if streak in (2, 4, 8, 12, 16, 24, 36, 52) then perform private.publish_community_activity(author, 'weekly_streak', format('weekly-streak:%s', attempt.week_start), jsonb_build_object('weeks', streak)); end if;
  end if;

  lineage := attempt.snapshot -> 'lineage';
  if jsonb_typeof(lineage) = 'object' and public.training_state_nonempty_text(lineage -> 'mesocycleId') and coalesce((lineage ->> 'weekNumber') ~ '^[1-9][0-9]*$', false) then
    mesocycle_id_value := lineage ->> 'mesocycleId'; mesocycle_week_value := (lineage ->> 'weekNumber')::integer;
    select count(*) into planned_count from public.reward_planned_session_ids(author, mesocycle_id_value, mesocycle_week_value);
    select count(*) filter (where adherence >= .7), count(*) filter (where adherence = 1) into completed_count, perfect_count from public.reward_attempts where owner_id = author and mesocycle_id = mesocycle_id_value and mesocycle_week = mesocycle_week_value;
    if planned_count > 0 and completed_count >= planned_count and perfect_count >= planned_count then perform private.publish_community_activity(author, 'mesocycle_perfect_week', format('mesocycle-perfect-week:%s:%s', mesocycle_id_value, mesocycle_week_value), jsonb_build_object('week_number', mesocycle_week_value)); end if;
    select count(*) into planned_count from public.reward_planned_session_ids(author, mesocycle_id_value, null);
    select count(*) filter (where adherence >= .7) into completed_count from public.reward_attempts where owner_id = author and mesocycle_id = mesocycle_id_value;
    if planned_count > 0 and completed_count >= planned_count then perform private.publish_community_activity(author, 'mesocycle_completed', format('mesocycle-completed:%s', mesocycle_id_value), '{}'::jsonb); end if;
  end if;

  weekly_volume := (select coalesce(sum(private.community_attempt_volume(snapshot)), 0) from public.experience_attempts where owner_id = author and week_start = attempt.week_start);
  prior_volume := (select max(volume) from (select sum(private.community_attempt_volume(snapshot)) volume from public.experience_attempts where owner_id = author and week_start < attempt.week_start group by week_start) prior_weeks);
  if prior_volume is not null and weekly_volume > prior_volume then perform private.publish_community_activity(author, 'weekly_volume_record', format('weekly-volume:%s', attempt.week_start), jsonb_build_object('volume', round(weekly_volume, 0))); end if;
  month_start := date_trunc('month', attempt.completed_at at time zone 'UTC')::date;
  monthly_volume := (select coalesce(sum(private.community_attempt_volume(snapshot)), 0) from public.experience_attempts where owner_id = author and completed_at >= month_start and completed_at < month_start + interval '1 month');
  prior_volume := (select max(volume) from (select sum(private.community_attempt_volume(snapshot)) volume from public.experience_attempts where owner_id = author and completed_at < month_start group by date_trunc('month', completed_at at time zone 'UTC')) prior_months);
  if prior_volume is not null and monthly_volume > prior_volume then perform private.publish_community_activity(author, 'monthly_volume_record', format('monthly-volume:%s', month_start), jsonb_build_object('volume', round(monthly_volume, 0))); end if;
  select count(distinct week_start) into current_month_weeks from public.experience_attempts where owner_id = author and adherence >= .7 and completed_at >= month_start and completed_at < month_start + interval '1 month';
  if current_month_weeks >= 4 then perform private.publish_community_activity(author, 'monthly_consistency', format('monthly-consistency:%s', month_start), jsonb_build_object('active_weeks', current_month_weeks)); end if;

  if (select share_social_muscle_distribution from public.profiles where id = author) then
    select count(*) into current_muscle_groups from public.muscle_groups parent where parent.type = 'Grupo padre' and parent.visible_in_filters and exists (
      select 1 from public.experience_attempts history cross join lateral jsonb_array_elements(history.snapshot -> 'exercises') exercise(value) left join public.muscle_group_relations relation on relation.parent_muscle_group_id = parent.id
      where history.owner_id = author and history.completed_at >= month_start and history.completed_at < month_start + interval '1 month' and exists (select 1 from jsonb_array_elements(coalesce(exercise.value -> 'catalog' -> 'muscleParticipations', '[]'::jsonb)) participation(value) where participation.value ->> 'muscleGroupId' in (parent.id, relation.child_muscle_group_id)));
    select count(*) into prior_muscle_groups from public.muscle_groups parent where parent.type = 'Grupo padre' and parent.visible_in_filters and exists (
      select 1 from public.experience_attempts history cross join lateral jsonb_array_elements(history.snapshot -> 'exercises') exercise(value) left join public.muscle_group_relations relation on relation.parent_muscle_group_id = parent.id
      where history.owner_id = author and history.completed_at >= month_start - interval '1 month' and history.completed_at < month_start and exists (select 1 from jsonb_array_elements(coalesce(exercise.value -> 'catalog' -> 'muscleParticipations', '[]'::jsonb)) participation(value) where participation.value ->> 'muscleGroupId' in (parent.id, relation.child_muscle_group_id)));
    if current_muscle_groups >= 3 and current_muscle_groups > coalesce(prior_muscle_groups, 0) then perform private.publish_community_activity(author, 'muscle_balance_improved', format('muscle-balance:%s', month_start), jsonb_build_object('covered_muscle_groups', current_muscle_groups)); end if;
  end if;
end;
$$;
