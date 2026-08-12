import { beforeEach, describe, expect, test, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../services/supabase', () => ({ supabase: { rpc }, supabaseConfigurationError: null }));

import { sendJointSocialMessage } from '../services/jointSocialMessages';

describe('Joint social message service boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  test('sends the bounded session message payload to the server-owned RPC', async () => {
    rpc.mockResolvedValue({ error: null });

    await expect(sendJointSocialMessage('workout-1', 'bro-1', 'Una más', 'custom')).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('send_joint_social_message', {
      workout_id: 'workout-1', recipient: 'bro-1', message_input: 'Una más', message_kind: 'custom',
    });
  });

  test('rejects blank and oversized messages before making an RPC', async () => {
    await expect(sendJointSocialMessage('workout-1', 'bro-1', ' ', 'custom')).rejects.toThrow('Invalid joint social message.');
    await expect(sendJointSocialMessage('workout-1', 'bro-1', 'x'.repeat(121), 'custom')).rejects.toThrow('Invalid joint social message.');
    expect(rpc).not.toHaveBeenCalled();
  });
});
