import { Platform } from 'react-native';
import { KISS_MESSAGE, KISS_NOTIFICATION_TITLE } from '../constants/kiss';

export const PARTNER_NOTIFICATION_CHANNEL = 'partner_messages';
export const TRAINING_NOTIFICATION_CHANNEL = 'training';
export const SOCIAL_NOTIFICATION_CHANNEL = 'social';
export const COMMUNITY_NOTIFICATION_CHANNEL = 'community';

export type RestNotificationInput = {
  title: string;
  body?: string;
  seconds: number;
};

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

async function isExpoGoRuntime(): Promise<boolean> {
  try {
    return (await import('expo-constants')).default.appOwnership === 'expo';
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
    Notifications.setNotificationChannelAsync(PARTNER_NOTIFICATION_CHANNEL, {
      name: 'Mensajes de pareja',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: '#FF69B4',
    }),
    Notifications.setNotificationChannelAsync(TRAINING_NOTIFICATION_CHANNEL, {
      name: 'Entrenamiento',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
    }),
    Notifications.setNotificationChannelAsync(SOCIAL_NOTIFICATION_CHANNEL, {
      name: 'Social',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
      enableVibrate: true,
    }),
    Notifications.setNotificationChannelAsync(COMMUNITY_NOTIFICATION_CHANNEL, {
      name: 'Comunidad',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
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

  return finalStatus === 'granted';
}

export async function setupNotifications(): Promise<boolean> {
  if (await isExpoGoRuntime()) return false;
  const Notifications = await getNotifications();
  if (!Notifications) return false;

  await configureForegroundHandler(Notifications);
  await configureAndroidChannels(Notifications);

  if (!await isPhysicalDevice()) {
    return false;
  }

  return requestNotificationPermission(Notifications);
}

export async function getExpoPushToken(): Promise<string | null> {
  if (!supportsRemotePush() || await isExpoGoRuntime() || !await isPhysicalDevice()) return null;

  const Notifications = await getNotifications();
  if (!Notifications) return null;

  const granted = await setupNotifications();
  if (!granted) return null;

  try {
    const Constants = (await import('expo-constants')).default;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return token.data;
  } catch {
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
      if (typeof url === 'string' && url.startsWith('/')) onUrl(url);
    });
    return () => subscription.remove();
  })();
}

export async function scheduleRestNotification(
  input: RestNotificationInput,
): Promise<string | null> {
  if (!Number.isFinite(input.seconds) || input.seconds <= 0) return null;

  const Notifications = await getNotifications();
  if (!Notifications) return null;

  try {
    await configureAndroidChannels(Notifications);
    if (!await requestNotificationPermission(Notifications)) return null;

    return await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: input.seconds,
        ...(Platform.OS === 'android' ? { channelId: TRAINING_NOTIFICATION_CHANNEL } : {}),
      },
    });
  } catch {
    return null;
  }
}

export async function cancelRestNotification(notificationId: string): Promise<boolean> {
  if (!notificationId) return false;

  const Notifications = await getNotifications();
  if (!Notifications) return false;

  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    return true;
  } catch {
    return false;
  }
}

export async function showPartnerNotification(
  title: string,
  message: string,
): Promise<boolean> {
  const Notifications = await getNotifications();
  if (!Notifications) return false;

  try {
    const granted = await setupNotifications();
    if (!granted) return false;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: message,
        sound: 'default',
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

/** @deprecated use showPartnerNotification */
export async function showKissNotification(
  message: string = KISS_MESSAGE,
): Promise<boolean> {
  return showPartnerNotification(KISS_NOTIFICATION_TITLE, message);
}
