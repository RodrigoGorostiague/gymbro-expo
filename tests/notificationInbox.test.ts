import { beforeEach, describe, expect, test, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../services/supabase', () => ({ supabase: { rpc }, supabaseConfigurationError: null }));

import {
  listNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead,
  registerNotificationDeviceToken,
  unregisterNotificationDeviceToken,
} from '../services/notificationInbox';

describe('notification inbox RPC boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  test('maps only the safe notification projection returned for the authenticated recipient', async () => {
    rpc.mockResolvedValue({
      data: [
        { id: 'notice-1', kind: 'relationship_request', title: 'New request', body: 'Bro wants to connect', data: { targetId: 'member-2' }, read_at: null, created_at: '2026-08-02T20:00:00Z' },
        { id: 'invalid', kind: 'bad', title: 'Bad', body: null, data: [], read_at: null, created_at: '2026-08-02T20:01:00Z' },
      ],
      error: null,
    });

    await expect(listNotificationInbox()).resolves.toEqual([{
      id: 'notice-1', kind: 'relationship_request', title: 'New request', body: 'Bro wants to connect', data: { targetId: 'member-2' }, readAt: null, createdAt: '2026-08-02T20:00:00Z',
    }]);
    expect(rpc).toHaveBeenCalledWith('list_notification_inbox', { limit_count: 50 });
  });

  test('uses server-owned read mutations without sending user identity or timestamps', async () => {
    rpc.mockResolvedValue({ error: null });

    await markNotificationRead('notice-1');
    await markAllNotificationsRead();

    expect(rpc).toHaveBeenNthCalledWith(1, 'mark_notification_read', { notification_id: 'notice-1' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'mark_all_notifications_read', {});
  });

  test('surfaces RPC failures', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'notification unavailable' } });
    await expect(markNotificationRead('notice-1')).rejects.toThrow('notification unavailable');
  });

  test('registers and unregisters only the current authenticated device token', async () => {
    rpc.mockResolvedValue({ error: null });

    await registerNotificationDeviceToken('ExponentPushToken[device]', 'android');
    await unregisterNotificationDeviceToken('ExponentPushToken[device]');

    expect(rpc).toHaveBeenNthCalledWith(1, 'register_notification_device_token', {
      token_input: 'ExponentPushToken[device]',
      platform_input: 'android',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'unregister_notification_device_token', {
      token_input: 'ExponentPushToken[device]',
    });
  });
});
