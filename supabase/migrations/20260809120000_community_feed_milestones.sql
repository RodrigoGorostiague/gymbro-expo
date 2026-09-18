-- Community milestones are derived only while authoritative server workflows finish.
-- Payloads deliberately contain aggregates and safe catalog labels, never attempts or sets.
alter table public.community_activities drop constraint if exists community_activities_kind_check;
alter table public.community_activities add constraint community_activities_kind_check check (kind in (
  'rank_up', 'personal_record', 'mesocycle_completed', 'mesocycle_perfect_week',
  'weekly_goal', 'weekly_streak', 'first_joint_workout', 'joint_workout_completed',
  'weekly_volume_record', 'monthly_volume_record', 'monthly_consistency', 'muscle_balance_improved'
));

create or replace function private.publish_community_activity(
  author uuid, activity_kind text, activity_source_key text, activity_payload jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.community_activities(author_id, kind, source_key, payload)
  values (author, activity_kind, activity_source_key, activity_payload)
  on conflict (author_id, source_key) do nothing;
end;
$$;

create function private.community_attempt_volume(attempt jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select coalesce(sum(
    (set_item.value -> 'result' -> 'performance' ->> 'reps')::numeric
    * case when set_item.value -> 'result' -> 'performance' ->> 'mode' = 'external-load'
      then (set_item.value -> 'result' -> 'performance' ->> 'load')::numeric
      else (set_item.value -> 'result' -> 'performance' ->> 'bodyweight')::numeric end
  ), 0)
  from jsonb_array_elements(attempt -> 'exercises') exercise(value)
  cross join lateral jsonb_array_elements(exercise.value -> 'sets') set_item(value)
  where set_item.value -> 'result' ->> 'performed' = 'true'
    and set_item.value -> 'result' -> 'performance' ->> 'mode' in ('external-load', 'bodyweight')
    and coalesce((set_item.value -> 'result' -> 'performance' ->> 'reps') ~ '^[1-9][0-9]*$', false)
    and coalesce((case when set_item.value -> 'result' -> 'performance' ->> 'mode' = 'external-load'
      then set_item.value -> 'result' -> 'performance' ->> 'load'
      else set_item.value -> 'result' -> 'performance' ->> 'bodyweight' end) ~ '^[0-9]+(\.[0-9]+)?$', false)
$$;

create function private.publish_training_community_milestones(author uuid, attempt_id_input text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  attempt public.experience_attempts%rowtype;
  lineage jsonb; mesocycle_id_value text; mesocycle_week_value integer;
  planned_count integer; completed_count integer; perfect_count integer;
  streak integer; weekly_volume numeric; monthly_volume numeric; prior_volume numeric;
  month_start date; current_month_weeks integer; prior_muscle_groups integer; current_muscle_groups integer;
  record_row record;
begin
  select * into attempt from public.experience_attempts
  where owner_id = author and attempt_id = attempt_id_input;
  if not found then return; end if;

  -- The score comes from the accepted snapshot; the display name comes only from the catalog.
  select score.exercise_key, score.score, score.unit, exercise.canonical_name into record_row
  from public.experience_exercise_best_scores(attempt.snapshot) score
  join public.exercises exercise on lower(exercise.id) = score.exercise_key
  where exists (
    select 1 from public.experience_attempts history
    cross join lateral public.experience_exercise_best_scores(history.snapshot) prior
    where history.owner_id = author and history.attempt_id <> attempt_id_input
      and prior.exercise_key = score.exercise_key and prior.mode = score.mode and prior.unit = score.unit
    group by prior.exercise_key, prior.mode, prior.unit
    having score.score > max(prior.score)
  )
  order by score.score desc, score.exercise_key
  limit 1;
  if record_row is not null then
    perform private.publish_community_activity(author, 'personal_record', format('personal-record:%s', attempt_id_input),
      jsonb_build_object('exercise_name', record_row.canonical_name, 'best_score', round(record_row.score, 2), 'score_unit', record_row.unit || '-reps'));
  end if;

  if attempt.adherence >= .7 and exists (
    select 1 from public.experience_weekly_goals goal
    where goal.owner_id = author and goal.week_start = attempt.week_start and goal.reached_at is not null
  ) then
    select target into planned_count from public.experience_weekly_goals where owner_id = author and week_start = attempt.week_start;
    perform private.publish_community_activity(author, 'weekly_goal', format('weekly-goal:%s', attempt.week_start),
      jsonb_build_object('week_start', attempt.week_start, 'target_workouts', planned_count));

    select count(*) into streak from public.experience_weekly_goals goal
    where goal.owner_id = author and goal.reached_at is not null and goal.week_start <= attempt.week_start
      and not exists (
        select 1 from generate_series(goal.week_start + 7, attempt.week_start, interval '7 days') missing(week_start)
        left join public.experience_weekly_goals present on present.owner_id = author
          and present.week_start = missing.week_start::date and present.reached_at is not null
        where present.week_start is null
      );
    if streak in (2, 4, 8, 12, 16, 24, 36, 52) then
      perform private.publish_community_activity(author, 'weekly_streak', format('weekly-streak:%s', attempt.week_start),
        jsonb_build_object('weeks', streak));
    end if;
  end if;

  lineage := attempt.snapshot -> 'lineage';
  if jsonb_typeof(lineage) = 'object' and public.training_state_nonempty_text(lineage -> 'mesocycleId')
    and coalesce((lineage ->> 'weekNumber') ~ '^[1-9][0-9]*$', false) then
    mesocycle_id_value := lineage ->> 'mesocycleId';
    mesocycle_week_value := (lineage ->> 'weekNumber')::integer;
    select count(*) into planned_count from public.reward_planned_session_ids(author, mesocycle_id_value, mesocycle_week_value);
    select count(*) filter (where adherence >= .7), count(*) filter (where adherence = 1) into completed_count, perfect_count
    from public.reward_attempts where owner_id = author and mesocycle_id = mesocycle_id_value and mesocycle_week = mesocycle_week_value;
    if planned_count > 0 and completed_count >= planned_count and perfect_count >= planned_count then
      perform private.publish_community_activity(author, 'mesocycle_perfect_week', format('mesocycle-perfect-week:%s:%s', mesocycle_id_value, mesocycle_week_value),
        jsonb_build_object('week_number', mesocycle_week_value));
    end if;
    select count(*) into planned_count from public.reward_planned_session_ids(author, mesocycle_id_value, null);
    select count(*) filter (where adherence >= .7) into completed_count
    from public.reward_attempts where owner_id = author and mesocycle_id = mesocycle_id_value;
    if planned_count > 0 and completed_count >= planned_count then
      perform private.publish_community_activity(author, 'mesocycle_completed', format('mesocycle-completed:%s', mesocycle_id_value), '{}'::jsonb);
    end if;
  end if;

  weekly_volume := (select coalesce(sum(private.community_attempt_volume(snapshot)), 0) from public.experience_attempts where owner_id = author and week_start = attempt.week_start);
  prior_volume := (select max(volume) from (
    select sum(private.community_attempt_volume(snapshot)) volume from public.experience_attempts
    where owner_id = author and week_start < attempt.week_start group by week_start
  ) prior_weeks);
  if prior_volume is not null and weekly_volume > prior_volume then
    perform private.publish_community_activity(author, 'weekly_volume_record', format('weekly-volume:%s', attempt.week_start),
      jsonb_build_object('volume', round(weekly_volume, 0)));
  end if;

  month_start := date_trunc('month', attempt.completed_at at time zone 'UTC')::date;
  monthly_volume := (select coalesce(sum(private.community_attempt_volume(snapshot)), 0) from public.experience_attempts
    where owner_id = author and completed_at >= month_start and completed_at < month_start + interval '1 month');
  prior_volume := (select max(volume) from (
    select sum(private.community_attempt_volume(snapshot)) volume from public.experience_attempts
    where owner_id = author and completed_at < month_start group by date_trunc('month', completed_at at time zone 'UTC')
  ) prior_months);
  if prior_volume is not null and monthly_volume > prior_volume then
    perform private.publish_community_activity(author, 'monthly_volume_record', format('monthly-volume:%s', month_start),
      jsonb_build_object('volume', round(monthly_volume, 0)));
  end if;

  select count(distinct week_start) into current_month_weeks from public.experience_attempts
  where owner_id = author and adherence >= .7 and completed_at >= month_start and completed_at < month_start + interval '1 month';
  if current_month_weeks >= 4 then
    perform private.publish_community_activity(author, 'monthly_consistency', format('monthly-consistency:%s', month_start),
      jsonb_build_object('active_weeks', current_month_weeks));
  end if;

  if (select share_social_muscle_distribution from public.profiles where id = author) then
    select count(*) into current_muscle_groups from public.muscle_groups parent
    where parent.type = 'Grupo padre' and parent.visible_in_filters and exists (
      select 1 from public.experience_attempts history
      cross join lateral jsonb_array_elements(history.snapshot -> 'exercises') exercise(value)
      left join public.muscle_group_relations relation on relation.parent_muscle_group_id = parent.id
      where history.owner_id = author and history.completed_at >= month_start and history.completed_at < month_start + interval '1 month'
        and exists (select 1 from jsonb_array_elements(coalesce(exercise.value -> 'catalog' -> 'muscleParticipations', '[]'::jsonb)) participation(value)
          where participation.value ->> 'muscleGroupId' in (parent.id, relation.child_muscle_group_id))
    );
    select count(*) into prior_muscle_groups from public.muscle_groups parent
    where parent.type = 'Grupo padre' and parent.visible_in_filters and exists (
      select 1 from public.experience_attempts history
      cross join lateral jsonb_array_elements(history.snapshot -> 'exercises') exercise(value)
      left join public.muscle_group_relations relation on relation.parent_muscle_group_id = parent.id
      where history.owner_id = author and history.completed_at >= month_start - interval '1 month' and history.completed_at < month_start
        and exists (select 1 from jsonb_array_elements(coalesce(exercise.value -> 'catalog' -> 'muscleParticipations', '[]'::jsonb)) participation(value)
          where participation.value ->> 'muscleGroupId' in (parent.id, relation.child_muscle_group_id))
    );
    if current_muscle_groups >= 3 and current_muscle_groups > coalesce(prior_muscle_groups, 0) then
      perform private.publish_community_activity(author, 'muscle_balance_improved', format('muscle-balance:%s', month_start),
        jsonb_build_object('covered_muscle_groups', current_muscle_groups));
    end if;
  end if;
end;
$$;

alter function public.finalize_training_attempt(jsonb) rename to finalize_training_attempt_base;

create function public.finalize_training_attempt(attempt_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); result jsonb;
begin
  result := public.finalize_training_attempt_base(attempt_input);
  perform private.publish_training_community_milestones(actor, result -> 'attempt' ->> 'id');
  return result;
end;
$$;

create or replace function public.finish_joint_workout(workout_id uuid, visibility_input public.joint_workout_visibility, completed_workout_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); remaining integer; affected integer; is_initiator boolean;
begin
  if not private.is_valid_joint_completed_workout(completed_workout_input) then raise exception 'invalid joint completed workout'; end if;
  update public.joint_workout_participants set status = 'completed', visibility = visibility_input,
    completed_workout = completed_workout_input, finished_at = now(), last_seen_at = now()
  where joint_workout_id = workout_id and participant_id = actor and status = 'active';
  get diagnostics affected = row_count;
  if affected = 0 then
    if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'completed') then
      update public.workout_start_activities set closed_at = now() where author_id = actor and closed_at is null;
      return;
    end if;
    raise exception 'joint workout participant unavailable';
  end if;
  update public.workout_start_activities set closed_at = now() where author_id = actor and closed_at is null;
  select initiator_id = actor into is_initiator from public.joint_workouts where id = workout_id for update;
  if is_initiator then
    update public.joint_workout_participants set status = 'declined', last_seen_at = now() where joint_workout_id = workout_id and status = 'invited';
  end if;
  insert into public.joint_workout_posts (joint_workout_id) values (workout_id) on conflict do nothing;
  select count(*) into remaining from public.joint_workout_participants where joint_workout_id = workout_id and status = 'active';
  if remaining = 0 then
    update public.joint_workout_participants set status = 'declined', last_seen_at = now() where joint_workout_id = workout_id and status = 'invited';
    update public.joint_workouts set completed_at = coalesce(completed_at, now()) where id = workout_id;
  end if;
  if exists (select 1 from public.community_activities where author_id = actor and kind in ('first_joint_workout', 'joint_workout_completed')) then
    perform private.publish_community_activity(actor, 'joint_workout_completed', format('joint-workout:%s', workout_id), '{}'::jsonb);
  else
    perform private.publish_community_activity(actor, 'first_joint_workout', 'first-joint-workout', '{}'::jsonb);
  end if;
end;
$$;

revoke all on function private.publish_community_activity(uuid, text, text, jsonb), private.community_attempt_volume(jsonb), private.publish_training_community_milestones(uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_training_attempt_base(jsonb) from public, anon, authenticated;
revoke all on function public.finalize_training_attempt(jsonb), public.finish_joint_workout(uuid, public.joint_workout_visibility, jsonb) from public, anon;
grant execute on function public.finalize_training_attempt(jsonb), public.finish_joint_workout(uuid, public.joint_workout_visibility, jsonb) to authenticated;
