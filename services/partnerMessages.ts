import type { PartnerMessageType } from '../constants/kiss';
import { supabase, supabaseConfigurationError } from './supabase';

function client() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'Supabase is unavailable.');
  return supabase;
}

export async function sendPartnerMessage(recipientId: string, messageType: PartnerMessageType): Promise<void> {
  if (!recipientId.trim()) throw new Error('A Partner recipient is required.');
  const { error } = await client().rpc('send_partner_message', {
    recipient: recipientId,
    message_type: messageType,
  });
  if (error) throw new Error(error.message);
}
