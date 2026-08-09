import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { registerNotificationDeviceToken } from '../services/notificationInbox';
import {
  getExpoPushToken,
  getLastNotificationResponseUrl,
  isExpoGoRuntime,
  subscribeToExpoPushTokenRotation,
  subscribeToNotificationResponses,
} from '../utils/notifications';
import { InAppNotificationBadges } from './InAppNotificationBadges';

export function NotificationRuntime() {
  const { user } = useAuth();
  const routedNotificationUrls = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;
    if (user && (Platform.OS === 'ios' || Platform.OS === 'android')) {
      const platform = Platform.OS;
      console.info('Starting device push token registration.');
      const register = (token: string) => registerNotificationDeviceToken(token, platform)
        .then(() => console.info('Device push token registered.'))
        .catch((error: unknown) => {
          console.warn('Unable to register the device push token.', error);
        });
      void isExpoGoRuntime().then((inExpoGo) => {
        if (!active || inExpoGo) {
          if (inExpoGo) console.info('Device push token registration skipped in Expo Go.');
          return;
        }
        void getExpoPushToken().then((token) => {
          if (token) return register(token);
        }).catch((error: unknown) => console.warn('Unable to obtain an Expo push token.', error));
        void subscribeToExpoPushTokenRotation(register).then((cleanup) => {
          if (active) unsubscribe = cleanup;
          else cleanup();
        });
      });
    } else if (!user) {
      console.info('Device push token registration is waiting for an authenticated user.');
    }
    return () => { active = false; unsubscribe(); };
  }, [user]);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;
    const routeOnce = (url: string) => {
      if (!active || routedNotificationUrls.current.has(url)) return;
      routedNotificationUrls.current.add(url);
      router.push(url);
    };
    void isExpoGoRuntime().then((inExpoGo) => {
      if (!active || inExpoGo) return;
      void getLastNotificationResponseUrl().then((url) => {
        if (url) routeOnce(url);
      });
      void subscribeToNotificationResponses(routeOnce).then((cleanup) => {
        if (active) unsubscribe = cleanup;
        else cleanup();
      });
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  return <InAppNotificationBadges />;
}
