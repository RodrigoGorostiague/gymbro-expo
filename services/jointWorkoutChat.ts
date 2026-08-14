import { supabase, supabaseConfigurationError } from './supabase';

export type JointWorkoutChatMessage = {
  id: string;
  senderId: string;
  senderAlias: string;
  senderAvatarId: string;
  body: string;
  mentionedParticipantIds: string[];
  createdAt: string;
};

function client() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'Supabase is unavailable.');
  return supabase;
}

function asMessage(value: unknown): JointWorkoutChatMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.sender_id !== 'string' || typeof row.sender_alias !== 'string'
    || typeof row.sender_avatar_id !== 'string' || typeof row.body !== 'string' || typeof row.created_at !== 'string'
    || !Array.isArray(row.mentioned_participant_ids) || !row.mentioned_participant_ids.every((id) => typeof id === 'string')) return null;
  return { id: row.id, senderId: row.sender_id, senderAlias: row.sender_alias, senderAvatarId: row.sender_avatar_id, body: row.body, mentionedParticipantIds: row.mentioned_participant_ids, createdAt: row.created_at };
}

export async function listJointWorkoutChatMessages(workoutId: string): Promise<JointWorkoutChatMessage[]> {
  if (!workoutId.trim()) throw new Error('Invalid joint workout chat.');
  const { data, error } = await client().rpc('list_joint_workout_chat_messages', { workout_id: workoutId });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.flatMap((value) => {
    const message = asMessage(value);
    return message ? [message] : [];
  }) : [];
}

export async function sendJointWorkoutChatMessage(workoutId: string, message: string, mentionedParticipantIds: readonly string[]): Promise<void> {
  const trimmed = message.trim();
  const mentions = [...new Set(mentionedParticipantIds.filter((id) => id.trim()))];
  if (!workoutId.trim() || !trimmed || trimmed.length > 500) throw new Error('Invalid joint workout chat message.');
  const { error } = await client().rpc('send_joint_workout_chat_message', { workout_id: workoutId, message_input: trimmed, mentioned_participant_ids: mentions });
  if (error) throw new Error(error.message);
}

export async function subscribeToJointWorkoutChatChanges(workoutId: string, onChange: () => void): Promise<() => void> {
  if (!workoutId.trim()) return () => undefined;
  const instance = client();
  const { data, error } = await instance.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session) return () => undefined;
  await instance.realtime.setAuth(data.session.access_token);
  const channel = instance.channel(`joint-workout-chat:${workoutId}`);
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'joint_workout_chat_messages', filter: `joint_workout_id=eq.${workoutId}` }, onChange).subscribe();
  return () => { void instance.removeChannel(channel); };
}
