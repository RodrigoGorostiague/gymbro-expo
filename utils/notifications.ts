import { Platform } from 'react-native';

export const PARTNER_NOTIFICATION_CHANNEL = 'social_v2';
export const SOCIAL_NOTIFICATION_CHANNEL = 'social_v2';
export const COMMUNITY_NOTIFICATION_CHANNEL = 'community_v2';
const SOCIAL_NOTIFICATION_SOUND = 'notification_social.wav';

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null | undefined;
let handlerConfigured = false;

async function getNotifications(): Promise<NotificationsModule | null> {
  if (notificationsModule !== undefined) {
    return notificationsModule;
  }

  try {
    notificationsModule = await import('expo-notifications') as NotificationsModule;
  } catch {
    notificationsModule = null;
    return null;
  }

  return notificationsModule;
}

export async function isExpoGoRuntime(): Promise<boolean> {
  try {
    const constants = await import('expo-constants');
    const value = constants.default ?? constants;
    return value.appOwnership === 'expo';
  } catch {
    return false;
  }
}

async function configureForegroundHandler(Notifications: NotificationsModule): Promise<void> {
  if (!handlerConfigured && typeof Notifications.setNotificationHandler === 'function') {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    handlerConfigured = true;
  }
}

async function isPhysicalDevice(): Promise<boolean> {
  try {
    return (await import('expo-device')).isDevice;
  } catch {
    return false;
  }
}

export function supportsRemotePush(): boolean {
  return true;
}

async function configureAndroidChannels(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (typeof Notifications.setNotificationChannelAsync !== 'function' || !Notifications.AndroidImportance) return;

  await Promise.all([
    Notifications.setNotificationChannelAsync(SOCIAL_NOTIFICATION_CHANNEL, {
      name: 'Social',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: SOCIAL_NOTIFICATION_SOUND,
      enableVibrate: true,
    }),
    Notifications.setNotificationChannelAsync(COMMUNITY_NOTIFICATION_CHANNEL, {
      name: 'Comunidad',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: SOCIAL_NOTIFICATION_SOUND,
      enableVibrate: true,
    }),
  ]);
}

async function requestNotificationPermission(Notifications: NotificationsModule): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = status;
  }

  console.info(`Push notification permission status: ${finalStatus}`);
  return finalStatus === 'granted';
}

export async function setupNotifications(): Promise<boolean> {
  if (await isExpoGoRuntime()) {
    console.info('Push notification setup skipped in Expo Go.');
    return false;
  }
  const Notifications = await getNotifications();
  if (!Notifications) {
    console.warn('Push notification setup failed: expo-notifications is unavailable.');
    return false;
  }

  await configureForegroundHandler(Notifications);
  await configureAndroidChannels(Notifications);

  if (!await isPhysicalDevice()) {
    console.info('Push notification setup skipped on a non-physical device.');
    return false;
  }

  return requestNotificationPermission(Notifications);
}

export async function getExpoPushToken(): Promise<string | null> {
  if (!supportsRemotePush() || await isExpoGoRuntime() || !await isPhysicalDevice()) {
    console.info('Expo push token request skipped for this runtime.');
    return null;
  }

  const Notifications = await getNotifications();
  if (!Notifications) {
    console.warn('Expo push token request failed: expo-notifications is unavailable.');
    return null;
  }

  const granted = await setupNotifications();
  if (!granted) {
    console.info('Expo push token request skipped because notifications are not granted.');
    return null;
  }

  try {
    const Constants = (await import('expo-constants')).default;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('Expo push token request failed: EAS project ID is unavailable.');
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    console.info('Expo push token acquired.');
    return token.data;
  } catch (error) {
    console.warn('Unable to obtain an Expo push token.', error);
    return null;
  }
}

export function subscribeToExpoPushTokenRotation(
  onToken: (token: string) => void | Promise<void>,
): Promise<() => void> {
  return (async () => {
    if (!supportsRemotePush() || await isExpoGoRuntime() || !await isPhysicalDevice()) return () => undefined;

    const Notifications = await getNotifications();
    if (!Notifications) return () => undefined;

    const subscription = Notifications.addPushTokenListener(({ data }) => {
      void onToken(data);
    });
    return () => subscription.remove();
  })();
}

export function subscribeToNotificationResponses(
  onUrl: (url: string) => void,
): Promise<() => void> {
  return (async () => {
    if (await isExpoGoRuntime()) return () => undefined;
    const Notifications = await getNotifications();
    if (!Notifications) return () => undefined;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (isInternalNotificationUrl(url)) onUrl(url);
    });
    return () => subscription.remove();
  })();
}

export function isInternalNotificationUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('/')) return false;

  try {
    return new URL(value, 'https://gymbro.invalid').origin === 'https://gymbro.invalid';
  } catch {
    return false;
  }
}

export async function getLastNotificationResponseUrl(): Promise<string | null> {
  if (await isExpoGoRuntime()) return null;

  const Notifications = await getNotifications();
  if (!Notifications || typeof Notifications.getLastNotificationResponseAsync !== 'function') return null;

  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    const url = response?.notification.request.content.data?.url;
    return isInternalNotificationUrl(url) ? url : null;
  } catch {
    return null;
  }
}

export async function showPartnerNotification(
  title: string,
  message: string,
): Promise<boolean> {
  try {
    const granted = await setupNotifications();
    if (!granted) return false;

    const Notifications = await getNotifications();
    if (!Notifications) return false;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: message,
        sound: SOCIAL_NOTIFICATION_SOUND,
        ...(Platform.OS === 'ios' ? { interruptionLevel: 'active' as const } : {}),
      },
      trigger:
        Platform.OS === 'android' ? { channelId: PARTNER_NOTIFICATION_CHANNEL } : null,
    });
    return true;
  } catch {
    return false;
  }
}
