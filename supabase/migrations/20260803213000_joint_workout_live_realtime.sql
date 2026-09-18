-- Realtime needs a safe SELECT policy before it can deliver membership changes.
-- The previous policy only admitted completed posts, so live invitation acceptance
-- never invalidated the initiator's group view.
create or replace function private.is_joint_workout_member(viewer uuid, workout uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.joint_workout_participants participant
    where participant.joint_workout_id = workout
      and participant.participant_id = viewer
  )
$$;

drop policy if exists joint_participants_realtime_projection on public.joint_workout_participants;
create policy joint_participants_realtime_projection on public.joint_workout_participants
for select to authenticated using (
  private.is_joint_workout_member(public.require_actor(), joint_workout_id)
  or private.can_view_joint_post(public.require_actor(), joint_workout_id)
);
