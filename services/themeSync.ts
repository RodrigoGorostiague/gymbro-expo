import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile } from '../types';
import { FIREBASE_COLLECTIONS } from '../constants/kiss';
import { getDb, isFirebaseConfigured } from './kissSync';

export async function syncEquippedTheme(
  profile: UserProfile,
  themeId: string | null,
): Promise<void> {
  const firestore = getDb();
  if (!firestore) return;

  try {
    await setDoc(doc(firestore, FIREBASE_COLLECTIONS.equippedThemes, profile), {
      themeId,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Firestore rules may not be deployed yet; local theme still works.
  }
}

export function subscribeToEquippedThemes(
  onUpdate: (themes: Partial<Record<UserProfile, string | null>>) => void,
): () => void {
  const firestore = getDb();
  if (!firestore) return () => undefined;

  const profiles: UserProfile[] = ['rodaja', 'brisas'];
  const unsubs = profiles.map((profile) =>
    onSnapshot(
      doc(firestore, FIREBASE_COLLECTIONS.equippedThemes, profile),
      (snap) => {
        if (!snap.exists()) return;
        const themeId = (snap.data().themeId as string | null | undefined) ?? null;
        onUpdate({ [profile]: themeId });
      },
      () => {
        // Permission denied until rules are deployed; local themes still apply.
      },
    ),
  );

  return () => unsubs.forEach((unsub) => unsub());
}
