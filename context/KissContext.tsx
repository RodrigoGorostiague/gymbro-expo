import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import {
  PARTNER_MESSAGES,
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
  setupNotifications,
  showPartnerNotification,
  supportsRemotePush,
} from '../utils/notifications';
import { useAuth } from './AuthContext';

interface KissContextValue {
  isSending: boolean;
  sendPartnerMessage: (recipientId: string, type: PartnerMessageType) => Promise<void>;
  /** @deprecated a direct Partner recipient is required. */
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
      const notificationsReady = await setupNotifications();
      if (!isFirebaseConfigured()) return;

      if (supportsRemotePush() && notificationsReady) {
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
    async (recipientId: string, type: PartnerMessageType) => {
      if (!user || isSending || !recipientId.trim() || recipientId === user) return;

      const { message, title, sentLabel, emoji } = PARTNER_MESSAGES[type];

      setIsSending(true);

      try {
        if (!isFirebaseConfigured()) {
          Alert.alert(
            'Sincronización no configurada',
            'Configura Firebase en app.json (extra) para enviar mensajes al otro dispositivo.',
          );
          return;
        }

        await sendPartnerEvent(user, recipientId, { message, title });

        if (supportsRemotePush() && await setupNotifications()) {
          const partnerToken = await getPartnerPushToken(recipientId);
          if (partnerToken) {
            try {
              await sendExpoPushNotification(partnerToken, title, message);
            } catch {
              // Firestore listener still delivers when the app is open.
            }
          }
        }

        Alert.alert(`${sentLabel} ${emoji}`, 'Enviado a tu Partner.');
      } catch {
        Alert.alert('Error', 'No se pudo enviar el mensaje. Revisa la conexión.');
      } finally {
        setIsSending(false);
      }
    },
    [user, isSending],
  );

  const sendKiss = useCallback(() => Promise.reject(new Error('A direct Partner recipient is required')), []);

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
