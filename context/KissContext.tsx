import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import {
  PARTNER_MESSAGES,
  PARTNER_PROFILE,
  PartnerMessageType,
} from '../constants/kiss';
import {
  getPartnerPushToken,
  isFirebaseConfigured,
  sendExpoPushNotification,
  sendPartnerEvent,
  savePushToken,
  subscribeToIncomingKisses,
} from '../services/kissSync';
import {
  getExpoPushToken,
  isExpoGo,
  setupNotifications,
  showPartnerNotification,
  supportsRemotePush,
} from '../utils/notifications';
import { useAuth } from './AuthContext';

interface KissContextValue {
  isSending: boolean;
  sendPartnerMessage: (type: PartnerMessageType) => Promise<void>;
  /** @deprecated use sendPartnerMessage('kiss') */
  sendKiss: () => Promise<void>;
}

const KissContext = createContext<KissContextValue | null>(null);

function notifyIncomingMessage(title: string, message: string) {
  showPartnerNotification(title, message).then((shown) => {
    if (!shown) {
      Alert.alert(title, message);
    }
  });
}

export function KissProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!user) return;

    let unsubscribe: (() => void) | undefined;

    (async () => {
      await setupNotifications();
      if (!isFirebaseConfigured()) return;

      if (supportsRemotePush()) {
        const token = await getExpoPushToken();
        if (token) {
          await savePushToken(user, token);
        }
      }

      unsubscribe = subscribeToIncomingKisses(user, ({ title, message }) =>
        notifyIncomingMessage(title, message),
      );
    })();

    return () => {
      unsubscribe?.();
    };
  }, [user]);

  const sendPartnerMessage = useCallback(
    async (type: PartnerMessageType) => {
      if (!user || isSending) return;

      const { message, title, sentLabel, emoji } = PARTNER_MESSAGES[type];
      const partner = PARTNER_PROFILE[user];

      setIsSending(true);

      try {
        if (!isFirebaseConfigured()) {
          Alert.alert(
            'Sincronización no configurada',
            'Configura Firebase en app.json (extra) para enviar mensajes al otro dispositivo.',
          );
          return;
        }

        await sendPartnerEvent(user, { message, title });

        if (supportsRemotePush()) {
          const partnerToken = await getPartnerPushToken(user);
          if (partnerToken) {
            try {
              await sendExpoPushNotification(partnerToken, title, message);
            } catch {
              // Firestore listener still delivers when the app is open.
            }
          }
        }

        const expoGoHint = isExpoGo
          ? '\n\nEn Expo Go las notificaciones en segundo plano no funcionan. Si la otra persona tiene la aplicación abierta, lo verá al instante.'
          : '';

        Alert.alert(`${sentLabel} ${emoji}`, `Enviado a ${partner}.${expoGoHint}`);
      } catch {
        Alert.alert('Error', 'No se pudo enviar el mensaje. Revisa la conexión.');
      } finally {
        setIsSending(false);
      }
    },
    [user, isSending],
  );

  const sendKiss = useCallback(
    () => sendPartnerMessage('kiss'),
    [sendPartnerMessage],
  );

  return (
    <KissContext.Provider value={{ isSending, sendPartnerMessage, sendKiss }}>
      {children}
    </KissContext.Provider>
  );
}

export function useKiss() {
  const ctx = useContext(KissContext);
  if (!ctx) throw new Error('useKiss must be used within KissProvider');
  return ctx;
}
