-- Realtime evaluates the existing RLS policy only after authenticated clients have SELECT.
grant select on public.joint_workout_chat_messages to authenticated;
