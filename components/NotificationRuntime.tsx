import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { registerNotificationDeviceToken } from '../services/notificationInbox';
import {
  getExpoPushToken,
  isExpoGoRuntime,
  subscribeToExpoPushTokenRotation,
  subscribeToNotificationResponses,
} from '../utils/notifications';

export function NotificationRuntime() {
  const { user } = useAuth();

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;
    if (user && (Platform.OS === 'ios' || Platform.OS === 'android')) {
      const platform = Platform.OS;
      const register = (token: string) => registerNotificationDeviceToken(token, platform).catch(() => undefined);
      void isExpoGoRuntime().then((inExpoGo) => {
        if (!active || inExpoGo) return;
        void getExpoPushToken().then((token) => {
          if (token) return register(token);
        });
        void subscribeToExpoPushTokenRotation(register).then((cleanup) => {
          if (active) unsubscribe = cleanup;
          else cleanup();
        });
      });
    }
    return () => { active = false; unsubscribe(); };
  }, [user]);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void isExpoGoRuntime().then((inExpoGo) => {
      if (!active || inExpoGo) return;
      void subscribeToNotificationResponses((url) => router.push(url)).then((cleanup) => {
        if (active) unsubscribe = cleanup;
        else cleanup();
      });
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  return null;
}
