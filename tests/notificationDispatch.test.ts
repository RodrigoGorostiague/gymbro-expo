import { describe, expect, it } from 'vitest';
import {
  asReceiptOutcome,
  expoPushMessage,
  isPermanentInvalidDeviceReceipt,
  notificationChannel,
} from '../supabase/functions/notification-dispatch/logic';

describe('notification dispatch mapping', () => {
  it('maps social and community events to the versioned Android channels', () => {
    expect(notificationChannel('relationship_request')).toBe('social_v2');
    expect(notificationChannel('community_workout_recap')).toBe('community_v2');
  });

  it('uses the installed social sound and forwards only internal URLs', () => {
    expect(expoPushMessage({
      delivery_id: 'delivery', notification_id: 'notification', token: 'ExponentPushToken[token]', platform: 'android',
      kind: 'plan_share_received', title: 'Plan received', body: 'Review it.', data: { url: '/community/plan-inbox' },
    })).toMatchObject({
      sound: 'notification_social.wav', channelId: 'community_v2',
      data: { notificationId: 'notification', url: '/community/plan-inbox' },
    });
    expect(expoPushMessage({
      delivery_id: 'delivery', notification_id: 'notification', token: 'ExponentPushToken[token]', platform: 'ios',
      kind: 'partner_message', title: 'GymBro', body: null, data: { url: 'https://unsafe.example' },
    }).data).toEqual({ notificationId: 'notification' });
  });
});

describe('Expo receipt handling', () => {
  it('disables only permanent DeviceNotRegistered receipts', () => {
    const invalid = { status: 'error', message: 'Device is not registered', details: { error: 'DeviceNotRegistered' } };
    expect(isPermanentInvalidDeviceReceipt(invalid)).toBe(true);
    expect(asReceiptOutcome(invalid).status).toBe('invalid_device');
    expect(asReceiptOutcome({ status: 'error', details: { error: 'InvalidCredentials' } }).status).toBe('retry');
  });
});
