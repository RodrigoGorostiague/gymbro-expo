-- Follow-up for databases that applied the joint evolution before its invalidation policy.
-- Realtime is invalidation-only; base table privileges remain revoked.
drop policy if exists joint_participants_realtime_projection on public.joint_workout_participants;
create policy joint_participants_realtime_projection on public.joint_workout_participants
for select to authenticated using (private.can_view_joint_post(public.require_actor(), joint_workout_id));
