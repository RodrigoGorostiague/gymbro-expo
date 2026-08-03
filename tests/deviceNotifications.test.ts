import { beforeEach, describe, expect, test, vi } from 'vitest';

const expoConstants = vi.hoisted(() => ({
  appOwnership: null as string | null,
  expoConfig: { extra: { eas: { projectId: 'project-id' } } },
  easConfig: null as { projectId: string } | null,
}));
const device = vi.hoisted(() => ({ isDevice: true }));
const platform = vi.hoisted(() => ({ OS: 'android' }));
const notifications = vi.hoisted(() => ({
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => undefined),
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: vi.fn(async () => ({ data: 'ExponentPushToken[current]' })),
  addPushTokenListener: vi.fn(),
  scheduleNotificationAsync: vi.fn(async () => 'rest-notification-id'),
  cancelScheduledNotificationAsync: vi.fn(async () => undefined),
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
    device.isDevice = true;
    platform.OS = 'android';
    notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
  });

  test('creates stable Android channels and preserves the partner channel', async () => {
    const { setupNotifications } = await import('../utils/notifications');

    await expect(setupNotifications()).resolves.toBe(true);
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith('partner_messages', expect.objectContaining({ name: 'Mensajes de pareja' }));
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith('training', expect.objectContaining({ name: 'Entrenamiento' }));
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith('social', expect.objectContaining({ name: 'Social' }));
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith('community', expect.objectContaining({ name: 'Comunidad' }));
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

  test('does not import native notifications for rest scheduling in Expo Go', async () => {
    expoConstants.appOwnership = 'expo';
    device.isDevice = false;
    const { cancelRestNotification, scheduleRestNotification } = await import('../utils/notifications');

    await expect(scheduleRestNotification({ title: 'Rest complete', body: 'Start your next set', seconds: 90 })).resolves.toBeNull();
    await expect(cancelRestNotification('rest-notification-id')).resolves.toBe(false);

    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
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
});
