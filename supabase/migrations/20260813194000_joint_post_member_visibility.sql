-- A joint-workout member can always reopen the shared post and its participant results.
-- Circle/public visibility still controls viewers outside that completed session.
create or replace function private.can_view_joint_post(viewer uuid, workout uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_joint_workout_member(viewer, workout)
    or exists (
      select 1
      from public.joint_workout_participants participant
      where participant.joint_workout_id = workout
        and participant.status = 'completed'
        and private.is_current_joint_connection(viewer, participant.participant_id)
    )
$$;

create or replace function public.get_joint_workout_detail(workout_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); result jsonb;
begin
  if not exists (select 1 from public.joint_workout_posts where joint_workout_id = workout_id)
    or not private.can_view_joint_post(actor, workout_id) then
    raise exception 'joint workout unavailable';
  end if;

  select jsonb_build_object('id', workout.id, 'initiator_id', workout.initiator_id,
    'suggested_routine', case when workout.initiator_id = actor then workout.suggested_routine else null end,
    'created_at', post.created_at, 'completed_at', workout.completed_at, 'participants', (
    select jsonb_agg(jsonb_build_object('id', participant.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id,
      'equipped_frame_id', profile.equipped_frame_id, 'equipped_title_id', profile.equipped_title_id, 'presentation_theme_id', profile.presentation_theme_id,
      'status', participant.status, 'visibility', participant.visibility,
      'relationship_kind', (select relationship.kind from public.relationships relationship where relationship.member_low = least(actor, participant.participant_id) and relationship.member_high = greatest(actor, participant.participant_id)),
      'workout', case when participant.status = 'completed' and (private.is_joint_workout_member(actor, workout.id) or private.can_view_joint_participant(actor, participant.participant_id, participant.visibility)) then participant.completed_workout - 'sharePayload' else null end,
      'share_payload', case when participant.status = 'completed' and (private.is_joint_workout_member(actor, workout.id) or private.can_view_joint_participant(actor, participant.participant_id, participant.visibility)) then participant.completed_workout -> 'sharePayload' else null end,
      'can_invite_bro', participant.participant_id <> actor and not private.is_current_joint_connection(actor, participant.participant_id)) order by participant.joined_at nulls last)
    from public.joint_workout_participants participant join public.profiles profile on profile.id = participant.participant_id
    where participant.joint_workout_id = workout.id
  )) into result
  from public.joint_workouts workout join public.joint_workout_posts post on post.joint_workout_id = workout.id
  where workout.id = workout_id;
  return result;
end;
$$;
