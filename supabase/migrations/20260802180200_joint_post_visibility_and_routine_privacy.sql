-- Correct post audience parity and remove inviter routine disclosure from recipient projections.
create or replace function private.can_view_joint_post(viewer uuid, workout uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.joint_workout_participants participant
    where participant.joint_workout_id = workout
      and participant.status = 'completed'
      and private.can_view_joint_participant(viewer, participant.participant_id, participant.visibility)
  )
$$;

create or replace function public.list_joint_workouts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', workout.id, 'initiator_id', workout.initiator_id,
    'suggested_routine', case when workout.initiator_id = actor then workout.suggested_routine else null end,
    'created_at', workout.created_at, 'completed_at', workout.completed_at,
    'participants', (select jsonb_agg(jsonb_build_object('id', p.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id, 'presentation_theme_id', profile.presentation_theme_id, 'status', p.status, 'visibility', p.visibility, 'is_self', p.participant_id = actor, 'relationship_kind', (select r.kind from public.relationships r where r.member_low = least(actor, p.participant_id) and r.member_high = greatest(actor, p.participant_id))) order by p.joined_at nulls last) from public.joint_workout_participants p join public.profiles profile on profile.id = p.participant_id where p.joint_workout_id = workout.id)) order by workout.created_at desc)
  from public.joint_workouts workout where exists (select 1 from public.joint_workout_participants p where p.joint_workout_id = workout.id and p.participant_id = actor) and workout.completed_at is null), '[]'::jsonb);
end;
$$;

create or replace function public.get_joint_workout_detail(workout_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); result jsonb;
begin
  if not exists (select 1 from public.joint_workout_posts where joint_workout_id = workout_id) or not private.can_view_joint_post(actor, workout_id) then raise exception 'joint workout unavailable'; end if;
  select jsonb_build_object('id', workout.id, 'initiator_id', workout.initiator_id,
    'suggested_routine', case when workout.initiator_id = actor then workout.suggested_routine else null end,
    'created_at', post.created_at, 'completed_at', workout.completed_at, 'participants', (
    select jsonb_agg(jsonb_build_object('id', p.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id, 'presentation_theme_id', profile.presentation_theme_id, 'status', p.status, 'visibility', p.visibility,
      'relationship_kind', (select r.kind from public.relationships r where r.member_low = least(actor, p.participant_id) and r.member_high = greatest(actor, p.participant_id)),
      'workout', case when p.status = 'completed' and private.can_view_joint_participant(actor, p.participant_id, p.visibility) then p.completed_workout else null end,
      'share_payload', case when p.status = 'completed' and private.can_view_joint_participant(actor, p.participant_id, p.visibility) then jsonb_build_object('version', 1, 'routine', p.routine_snapshot) else null end,
      'can_invite_bro', p.participant_id <> actor and not private.is_current_joint_connection(actor, p.participant_id)) order by p.joined_at nulls last)
    from public.joint_workout_participants p join public.profiles profile on profile.id = p.participant_id where p.joint_workout_id = workout.id
  )) into result from public.joint_workouts workout join public.joint_workout_posts post on post.joint_workout_id = workout.id where workout.id = workout_id;
  return result;
end;
$$;
