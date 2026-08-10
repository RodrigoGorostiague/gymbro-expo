-- Live coordination exposes only aggregate progress for current participants.
create type public.joint_workout_live_state as enum ('training', 'resting', 'paused');

alter table public.joint_workout_participants
  add column live_state public.joint_workout_live_state not null default 'training',
  add column completed_exercises integer not null default 0 check (completed_exercises >= 0),
  add column total_exercises integer not null default 0 check (total_exercises >= 0),
  add column completed_sets integer not null default 0 check (completed_sets >= 0),
  add column total_sets integer not null default 0 check (total_sets >= 0),
  add column rest_ends_at timestamptz,
  add column live_updated_at timestamptz not null default now(),
  add constraint joint_workout_live_exercise_progress_check check (completed_exercises <= total_exercises),
  add constraint joint_workout_live_set_progress_check check (completed_sets <= total_sets);

create or replace function public.update_joint_workout_live_progress(
  workout_id uuid,
  state_input public.joint_workout_live_state,
  completed_exercises_input integer,
  total_exercises_input integer,
  completed_sets_input integer,
  total_sets_input integer,
  rest_seconds_input integer default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  if completed_exercises_input < 0 or total_exercises_input < 0 or completed_exercises_input > total_exercises_input
    or completed_sets_input < 0 or total_sets_input < 0 or completed_sets_input > total_sets_input
    or total_exercises_input > 100 or total_sets_input > 1_000
    or (state_input = 'resting' and (rest_seconds_input is null or rest_seconds_input not between 1 and 3_600))
    or (state_input <> 'resting' and rest_seconds_input is not null) then
    raise exception 'invalid joint workout live progress';
  end if;

  update public.joint_workout_participants
  set live_state = state_input,
      completed_exercises = completed_exercises_input,
      total_exercises = total_exercises_input,
      completed_sets = completed_sets_input,
      total_sets = total_sets_input,
      rest_ends_at = case when state_input = 'resting' then now() + make_interval(secs => rest_seconds_input) else null end,
      live_updated_at = now(),
      last_seen_at = now()
  where joint_workout_id = workout_id and participant_id = actor and status = 'active';

  if not found then raise exception 'joint workout participant unavailable'; end if;
end;
$$;

create or replace function public.list_joint_workouts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', workout.id, 'initiator_id', workout.initiator_id, 'suggested_routine', null,
    'created_at', workout.created_at, 'completed_at', workout.completed_at, 'participants', (
      select jsonb_agg(jsonb_build_object('id', participant.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id,
        'equipped_frame_id', profile.equipped_frame_id, 'equipped_title_id', profile.equipped_title_id, 'presentation_theme_id', profile.presentation_theme_id,
        'status', participant.status, 'visibility', 'circle', 'is_self', participant.participant_id = actor,
        'relationship_kind', (select relationship.kind from public.relationships relationship where relationship.member_low = least(actor, participant.participant_id) and relationship.member_high = greatest(actor, participant.participant_id)),
        'live_state', case when participant.status = 'active' then participant.live_state else null end,
        'completed_exercises', case when participant.status = 'active' then participant.completed_exercises else null end,
        'total_exercises', case when participant.status = 'active' then participant.total_exercises else null end,
        'completed_sets', case when participant.status = 'active' then participant.completed_sets else null end,
        'total_sets', case when participant.status = 'active' then participant.total_sets else null end,
        'rest_ends_at', case when participant.status = 'active' then participant.rest_ends_at else null end,
        'live_updated_at', case when participant.status = 'active' then participant.live_updated_at else null end
      ) order by participant.joined_at nulls last)
      from public.joint_workout_participants participant join public.profiles profile on profile.id = participant.participant_id where participant.joint_workout_id = workout.id)
  ) order by workout.created_at desc)
  from public.joint_workouts workout where workout.completed_at is null and exists (select 1 from public.joint_workout_participants participant where participant.joint_workout_id = workout.id and participant.participant_id = actor)), '[]'::jsonb);
end;
$$;

revoke all on function public.update_joint_workout_live_progress(uuid, public.joint_workout_live_state, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.update_joint_workout_live_progress(uuid, public.joint_workout_live_state, integer, integer, integer, integer, integer) to authenticated;
