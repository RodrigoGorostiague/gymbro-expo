import { beforeEach, describe, expect, test, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../services/supabase', () => ({ supabase: { rpc }, supabaseConfigurationError: null }));

import { listJointWorkoutChatMessages, sendJointWorkoutChatMessage } from '../services/jointWorkoutChat';

describe('Joint workout private chat service boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  test('sends the bounded session message payload to the server-owned RPC', async () => {
    rpc.mockResolvedValue({ error: null });

    await expect(sendJointWorkoutChatMessage('workout-1', 'Una más', ['bro-1'])).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('send_joint_workout_chat_message', {
      workout_id: 'workout-1', message_input: 'Una más', mentioned_participant_ids: ['bro-1'],
    });
  });

  test('rejects blank and oversized messages before making an RPC', async () => {
    await expect(sendJointWorkoutChatMessage('workout-1', ' ', ['bro-1'])).rejects.toThrow('Invalid joint workout chat message.');
    await expect(sendJointWorkoutChatMessage('workout-1', 'x'.repeat(501), ['bro-1'])).rejects.toThrow('Invalid joint workout chat message.');
    await expect(sendJointWorkoutChatMessage('workout-1', 'Hola', [])).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('send_joint_workout_chat_message', {
      workout_id: 'workout-1', message_input: 'Hola', mentioned_participant_ids: [],
    });
  });

  test('maps only valid private messages from the server-owned list RPC', async () => {
    rpc.mockResolvedValue({ error: null, data: [{ id: 'message-1', sender_id: 'bro-1', sender_alias: 'Cami', sender_avatar_id: 'capigirl', body: 'Hola', mentioned_participant_ids: ['self'], created_at: '2026-08-13T00:00:00Z' }, { body: 'invalid' }] });
    await expect(listJointWorkoutChatMessages('workout-1')).resolves.toEqual([{ id: 'message-1', senderId: 'bro-1', senderAlias: 'Cami', senderAvatarId: 'capigirl', body: 'Hola', mentionedParticipantIds: ['self'], createdAt: '2026-08-13T00:00:00Z' }]);
  });
});
