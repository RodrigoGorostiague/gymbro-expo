import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Firestore,
  Timestamp,
} from 'firebase/firestore';
import Constants from 'expo-constants';
import {
  ShareNotificationType,
  UserProfile,
} from '../types';
import {
  FIREBASE_COLLECTIONS,
  KISS_MESSAGE,
  PARTNER_PROFILE,
  SHARE_NOTIFICATION_TYPES,
} from '../constants/kiss';
import { PARTNER_NOTIFICATION_CHANNEL } from '../utils/notifications';

export interface PartnerEventPayload {
  message: string;
  title: string;
  type?: ShareNotificationType;
  shareId?: string;
  routineName?: string;
}

const extra = Constants.expoConfig?.extra ?? {};

export const firebaseConfig = {
  apiKey: extra.firebaseApiKey as string | undefined,
  authDomain: extra.firebaseAuthDomain as string | undefined,
  projectId: extra.firebaseProjectId as string | undefined,
  storageBucket: extra.firebaseStorageBucket as string | undefined,
  messagingSenderId: extra.firebaseMessagingSenderId as string | undefined,
  appId: extra.firebaseAppId as string | undefined,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function getDb(): Firestore | null {
  if (!isFirebaseConfigured()) return null;
  if (!app) {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  }
  if (!db) {
    db = getFirestore(app);
  }
  return db;
}

export async function savePushToken(profile: UserProfile, token: string): Promise<void> {
  const firestore = getDb();
  if (!firestore) return;

  await setDoc(doc(firestore, FIREBASE_COLLECTIONS.pushTokens, profile), {
    token,
    updatedAt: serverTimestamp(),
  });
}

export async function getPartnerPushToken(profile: UserProfile): Promise<string | null> {
  const firestore = getDb();
  if (!firestore) return null;

  const partner = PARTNER_PROFILE[profile];
  const snap = await getDoc(doc(firestore, FIREBASE_COLLECTIONS.pushTokens, partner));
  if (!snap.exists()) return null;
  return (snap.data().token as string) ?? null;
}

export async function sendPartnerEvent(
  from: UserProfile,
  payload: PartnerEventPayload,
): Promise<void> {
  const firestore = getDb();
  if (!firestore) throw new Error('Firebase no configurado');

  const to = PARTNER_PROFILE[from];
  const docData: Record<string, unknown> = {
    from,
    to,
    message: payload.message,
    title: payload.title,
    createdAt: serverTimestamp(),
    delivered: false,
  };
  if (payload.type) docData.type = payload.type;
  if (payload.shareId) docData.shareId = payload.shareId;
  if (payload.routineName) docData.routineName = payload.routineName;

  await addDoc(collection(firestore, FIREBASE_COLLECTIONS.kisses), docData);
}

/** @deprecated use sendPartnerEvent */
export async function sendKissEvent(from: UserProfile): Promise<void> {
  await sendPartnerEvent(from, {
    message: KISS_MESSAGE,
    title: '💋 GymBro',
  });
}

export async function sendShareNotification(
  from: UserProfile,
  type: ShareNotificationType,
  shareId: string,
  routineName: string,
): Promise<void> {
  const formatter = SHARE_NOTIFICATION_TYPES[type];
  const message = formatter.message(from, routineName);
  const title = formatter.title(from, routineName);

  await sendPartnerEvent(from, {
    message,
    title,
    type,
    shareId,
    routineName,
  });
}

export async function sendExpoPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
): Promise<void> {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: expoPushToken,
      title,
      body,
      sound: 'default',
      channelId: PARTNER_NOTIFICATION_CHANNEL,
      priority: 'high',
    }),
  });

  if (!response.ok) {
    throw new Error('No se pudo enviar la notificación push');
  }
}

export function subscribeToIncomingKisses(
  profile: UserProfile,
  onMessage: (payload: PartnerEventPayload) => void,
): () => void {
  const firestore = getDb();
  if (!firestore) return () => undefined;

  const q = query(collection(firestore, FIREBASE_COLLECTIONS.kisses), where('to', '==', profile));

  return onSnapshot(
    q,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;

        const data = change.doc.data();
        if (data.delivered) return;

        const createdAt = data.createdAt as Timestamp | undefined;
        if (createdAt) {
          const ageMs = Date.now() - createdAt.toMillis();
          if (ageMs > 120_000) return;
        }

        onMessage({
          message: (data.message as string) ?? KISS_MESSAGE,
          title: (data.title as string) ?? '💬 GymBro',
        });
        updateDoc(change.doc.ref, { delivered: true });
      });
    },
    () => {
      // Permission denied until Firestore rules are deployed.
    },
  );
}
