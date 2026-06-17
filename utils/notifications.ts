import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { KISS_MESSAGE, KISS_NOTIFICATION_TITLE } from '../constants/kiss';

export const isExpoGo = Constants.appOwnership === 'expo';
export const PARTNER_NOTIFICATION_CHANNEL = 'partner_messages';

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null | undefined;
let handlerConfigured = false;

function getNotifications(): NotificationsModule | null {
  if (notificationsModule !== undefined) {
    return notificationsModule;
  }

  if (isExpoGo) {
    notificationsModule = null;
    return null;
  }

  try {
    notificationsModule = require('expo-notifications') as NotificationsModule;

    if (!handlerConfigured) {
      notificationsModule.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      handlerConfigured = true;
    }
  } catch {
    notificationsModule = null;
  }

  return notificationsModule;
}

export function supportsRemotePush(): boolean {
  return !isExpoGo && Device.isDevice;
}

export async function setupNotifications(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(PARTNER_NOTIFICATION_CHANNEL, {
      name: 'Mensajes de pareja',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: '#FF69B4',
    });
  }

  if (!Device.isDevice) {
    return false;
  }

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

export async function getExpoPushToken(): Promise<string | null> {
  if (!supportsRemotePush()) return null;

  const Notifications = getNotifications();
  if (!Notifications) return null;

  const granted = await setupNotifications();
  if (!granted) return null;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return token.data;
  } catch {
    return null;
  }
}

export async function showPartnerNotification(
  title: string,
  message: string,
): Promise<boolean> {
  const Notifications = getNotifications();
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
