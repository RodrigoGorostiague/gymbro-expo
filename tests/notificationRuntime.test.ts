import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { router } from './helpers/expoRouterStub';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const notificationRuntime = vi.hoisted(() => ({
  getExpoPushToken: vi.fn(),
  getLastNotificationResponseUrl: vi.fn(),
  isExpoGoRuntime: vi.fn(),
  subscribeToExpoPushTokenRotation: vi.fn(),
  subscribeToNotificationResponses: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../services/notificationInbox', () => ({ registerNotificationDeviceToken: vi.fn() }));
vi.mock('../utils/notifications', () => notificationRuntime);
vi.mock('../components/InAppNotificationBadges', () => ({ InAppNotificationBadges: () => null }));

import { NotificationRuntime } from '../components/NotificationRuntime';

describe('NotificationRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationRuntime.isExpoGoRuntime.mockResolvedValue(false);
    notificationRuntime.getLastNotificationResponseUrl.mockResolvedValue('/community/feed');
  });

  test('routes an initial notification response once when the listener receives the same URL', async () => {
    let onResponse: ((url: string) => void) | undefined;
    notificationRuntime.subscribeToNotificationResponses.mockImplementation(async (callback) => {
      onResponse = callback;
      return () => undefined;
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(NotificationRuntime));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      onResponse?.('/community/feed');
    });

    expect(notificationRuntime.getLastNotificationResponseUrl).toHaveBeenCalledOnce();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/community/feed');
    renderer!.unmount();
  });
});
