import { beforeEach, describe, expect, test, vi } from 'vitest';

const expoConstants = vi.hoisted(() => ({
  appOwnership: null as string | null,
  expoGoConfig: null as Record<string, unknown> | null,
  expoConfig: { extra: { eas: { projectId: 'project-id' } } },
  easConfig: null as { projectId: string } | null,
}));
const device = vi.hoisted(() => ({ isDevice: true }));
const platform = vi.hoisted(() => ({ OS: 'android' }));
const notifications = vi.hoisted(() => ({
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => undefined),
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: vi.fn(async () => ({ data: 'ExponentPushToken[current]' })),
  addPushTokenListener: vi.fn(),
  getLastNotificationResponseAsync: vi.fn<() => Promise<unknown>>(async () => null),
  addNotificationResponseReceivedListener: vi.fn(),
}));

vi.mock('expo-constants', () => ({ default: expoConstants }));
vi.mock('expo-device', () => device);
vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('expo-notifications', () => notifications);

describe('device notification layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    expoConstants.appOwnership = null;
    expoConstants.expoGoConfig = null;
    device.isDevice = true;
    platform.OS = 'android';
    notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
  });

  test('creates versioned Android channels with the supplied custom sounds', async () => {
    const { setupNotifications } = await import('../utils/notifications');

    await expect(setupNotifications()).resolves.toBe(true);
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith('social_v2', expect.objectContaining({ name: 'Social', sound: 'notification_social.wav' }));
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith('community_v2', expect.objectContaining({ name: 'Comunidad', sound: 'notification_social.wav' }));
  });

  test('forwards an Expo token rotation and removes its listener', async () => {
    const remove = vi.fn();
    let listener: ((token: { data: string }) => void) | undefined;
    notifications.addPushTokenListener.mockImplementation((callback) => {
      listener = callback;
      return { remove };
    });
    const onToken = vi.fn();
    const { subscribeToExpoPushTokenRotation } = await import('../utils/notifications');

    const unsubscribe = await subscribeToExpoPushTokenRotation(onToken);
    listener?.({ data: 'ExponentPushToken[rotated]' });
    unsubscribe();

    expect(onToken).toHaveBeenCalledWith('ExponentPushToken[rotated]');
    expect(remove).toHaveBeenCalledOnce();
  });

  test('does not request remote tokens or listeners in Expo Go', async () => {
    expoConstants.appOwnership = 'expo';
    const { getExpoPushToken, subscribeToExpoPushTokenRotation } = await import('../utils/notifications');

    await expect(getExpoPushToken()).resolves.toBeNull();
    const unsubscribe = await subscribeToExpoPushTokenRotation(vi.fn());
    unsubscribe();

    expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(notifications.addPushTokenListener).not.toHaveBeenCalled();
  });

  test('does not mistake embedded Expo Go config for Expo Go', async () => {
    expoConstants.expoGoConfig = {};
    const { isExpoGoRuntime } = await import('../utils/notifications');

    await expect(isExpoGoRuntime()).resolves.toBe(false);
  });

  test('routes only validated URLs from cold-start and response notifications', async () => {
    const remove = vi.fn();
    let listener: ((response: { notification: { request: { content: { data?: { url?: unknown } } } } }) => void) | undefined;
    notifications.getLastNotificationResponseAsync.mockResolvedValue({
      notification: { request: { content: { data: { url: '/community/notifications' } } } },
    });
    notifications.addNotificationResponseReceivedListener.mockImplementation((callback) => {
      listener = callback;
      return { remove };
    });
    const onUrl = vi.fn();
    const { getLastNotificationResponseUrl, subscribeToNotificationResponses } = await import('../utils/notifications');

    await expect(getLastNotificationResponseUrl()).resolves.toBe('/community/notifications');
    const unsubscribe = await subscribeToNotificationResponses(onUrl);
    listener?.({ notification: { request: { content: { data: { url: '/community/feed' } } } } });
    listener?.({ notification: { request: { content: { data: { url: '//example.com' } } } } });
    listener?.({ notification: { request: { content: { data: { url: '/\\example.com' } } } } });
    listener?.({ notification: { request: { content: { data: { url: 'https://example.com' } } } } });
    unsubscribe();

    expect(onUrl).toHaveBeenCalledTimes(1);
    expect(onUrl).toHaveBeenCalledWith('/community/feed');
    expect(remove).toHaveBeenCalledOnce();
  });

  test('does not read cold-start responses in Expo Go', async () => {
    expoConstants.appOwnership = 'expo';
    const { getLastNotificationResponseUrl } = await import('../utils/notifications');

    await expect(getLastNotificationResponseUrl()).resolves.toBeNull();

    expect(notifications.getLastNotificationResponseAsync).not.toHaveBeenCalled();
  });
});
