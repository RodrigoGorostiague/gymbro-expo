import type { JointSocialMessageKind } from '../constants/jointSocialMessages';
import { supabase, supabaseConfigurationError } from './supabase';

function client() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'Supabase is unavailable.');
  return supabase;
}

export async function sendJointSocialMessage(
  workoutId: string,
  recipientId: string,
  message: string,
  kind: JointSocialMessageKind,
): Promise<void> {
  const trimmed = message.trim();
  if (!workoutId.trim() || !recipientId.trim() || !trimmed || trimmed.length > 120) {
    throw new Error('Invalid joint social message.');
  }
  const { error } = await client().rpc('send_joint_social_message', {
    workout_id: workoutId,
    recipient: recipientId,
    message_input: trimmed,
    message_kind: kind,
  });
  if (error) throw new Error(error.message);
}
