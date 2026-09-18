import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Firestore, getFirestore } from 'firebase/firestore';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

const firebaseConfig = {
  apiKey: extra.firebaseApiKey as string | undefined,
  authDomain: extra.firebaseAuthDomain as string | undefined,
  projectId: extra.firebaseProjectId as string | undefined,
  storageBucket: extra.firebaseStorageBucket as string | undefined,
  messagingSenderId: extra.firebaseMessagingSenderId as string | undefined,
  appId: extra.firebaseAppId as string | undefined,
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function getFirestoreDb(): Firestore | null {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) return null;
  if (!app) app = getApps()[0] ?? initializeApp(firebaseConfig);
  if (!db) db = getFirestore(app);
  return db;
}
