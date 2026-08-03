create function public.get_community_badge_counts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  incoming_requests integer;
  unread_notifications integer;
  joint_invitations integer;
  plan_share_requests integer;
begin
  select count(*) into incoming_requests from public.relationship_requests where recipient_id = actor;
  select count(*) into unread_notifications from public.notification_inbox where recipient_id = actor and read_at is null;
  select count(*) into joint_invitations
  from public.joint_workout_participants participant
  join public.joint_workouts workout on workout.id = participant.joint_workout_id
  where participant.participant_id = actor and participant.status = 'invited' and workout.completed_at is null;
  select count(*) into plan_share_requests from public.private_plan_share_requests where recipient_id = actor and status = 'pending';

  return jsonb_build_object(
    'incomingRequests', incoming_requests,
    'unreadNotifications', unread_notifications,
    'jointInvitations', joint_invitations,
    'planShareRequests', plan_share_requests,
    'total', incoming_requests + unread_notifications + joint_invitations + plan_share_requests
  );
end;
$$;

revoke all on function public.get_community_badge_counts() from public, anon;
grant execute on function public.get_community_badge_counts() to authenticated;
