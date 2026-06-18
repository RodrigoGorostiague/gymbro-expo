import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Routine, SharedRoutineDoc, UserProfile } from '../types';
import { FIREBASE_COLLECTIONS } from '../constants/kiss';
import { getDb } from './kissSync';

export interface ShareCategories {
  pending: SharedRoutineDoc[];
  accepted: SharedRoutineDoc[];
  rejected: SharedRoutineDoc[];
}

export type ShareEventsCallback = (categories: ShareCategories) => void;

function categorize(docs: Map<string, SharedRoutineDoc>): ShareCategories {
  const pending: SharedRoutineDoc[] = [];
  const accepted: SharedRoutineDoc[] = [];
  const rejected: SharedRoutineDoc[] = [];
  for (const d of docs.values()) {
    if (d.status === 'pending') pending.push(d);
    else if (d.status === 'accepted') accepted.push(d);
    else if (d.status === 'rejected') rejected.push(d);
  }
  return { pending, accepted, rejected };
}

export async function createShare(
  sharedBy: UserProfile,
  routine: Routine,
): Promise<string> {
  const firestore = getDb();
  if (!firestore) throw new Error('Firebase no configurado');

  const now = Date.now();
  const docRef = await addDoc(
    collection(firestore, FIREBASE_COLLECTIONS.sharedRoutines),
    {
      sharedBy,
      sharedWith: sharedBy === 'rodaja' ? 'brisas' : 'rodaja',
      status: 'pending' as const,
      routine: { name: routine.name, exercises: routine.exercises },
      createdAt: now,
      updatedAt: now,
    },
  );
  return docRef.id;
}

export async function acceptShare(shareId: string): Promise<void> {
  const firestore = getDb();
  if (!firestore) throw new Error('Firebase no configurado');

  await updateDoc(
    doc(firestore, FIREBASE_COLLECTIONS.sharedRoutines, shareId),
    { status: 'accepted', updatedAt: Date.now() },
  );
}

export async function rejectShare(shareId: string): Promise<void> {
  const firestore = getDb();
  if (!firestore) throw new Error('Firebase no configurado');

  await updateDoc(
    doc(firestore, FIREBASE_COLLECTIONS.sharedRoutines, shareId),
    { status: 'rejected', updatedAt: Date.now() },
  );
}

export async function updateSharedRoutine(
  shareId: string,
  routine: Routine,
): Promise<void> {
  const firestore = getDb();
  if (!firestore) throw new Error('Firebase no configurado');

  await updateDoc(
    doc(firestore, FIREBASE_COLLECTIONS.sharedRoutines, shareId),
    {
      routine: { name: routine.name, exercises: routine.exercises },
      updatedAt: Date.now(),
    },
  );
}

export function subscribeToShareEvents(
  profile: UserProfile,
  callback: ShareEventsCallback,
): () => void {
  const firestore = getDb();
  if (!firestore) return () => undefined;

  const allDocs = new Map<string, SharedRoutineDoc>();
  const colRef = collection(firestore, FIREBASE_COLLECTIONS.sharedRoutines);

  const q1 = query(colRef, where('sharedBy', '==', profile));
  const q2 = query(colRef, where('sharedWith', '==', profile));

  const processSnapshot = (
    snapshot: { docs: { id: string; data: () => Record<string, unknown> }[] },
    source: 'by' | 'with',
  ) => {
    // Remove stale docs from this source
    for (const [id, d] of allDocs) {
      if ((source === 'by' && d.sharedBy === profile) ||
          (source === 'with' && d.sharedWith === profile)) {
        allDocs.delete(id);
      }
    }
    // Add fresh docs from this source
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      allDocs.set(docSnap.id, {
        id: docSnap.id,
        sharedBy: data.sharedBy as UserProfile,
        sharedWith: data.sharedWith as UserProfile,
        status: data.status as SharedRoutineDoc['status'],
        routine: data.routine as SharedRoutineDoc['routine'],
        createdAt: data.createdAt as number,
        updatedAt: data.updatedAt as number,
      });
    });
    callback(categorize(allDocs));
  };

  const unsub1 = onSnapshot(
    q1,
    (snap) => processSnapshot(snap, 'by'),
    () => {},
  );
  const unsub2 = onSnapshot(
    q2,
    (snap) => processSnapshot(snap, 'with'),
    () => {},
  );

  return () => {
    unsub1();
    unsub2();
  };
}
