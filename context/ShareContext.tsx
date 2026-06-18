import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { Routine, SharedRoutineDoc } from '../types';
import {
  acceptShare as acceptShareSync,
  createShare,
  rejectShare as rejectShareSync,
  subscribeToShareEvents,
  updateSharedRoutine as updateSharedRoutineSync,
} from '../services/shareSync';
import { sendShareNotification } from '../services/kissSync';
import { useAuth } from './AuthContext';

interface ShareContextValue {
  pendingShares: SharedRoutineDoc[];
  acceptedShares: SharedRoutineDoc[];
  isSyncing: boolean;
  shareRoutine: (routineId: string, routine: Routine) => Promise<string>;
  acceptShare: (shareId: string) => Promise<void>;
  rejectShare: (shareId: string) => Promise<void>;
  updateSharedRoutine: (shareId: string, routine: Routine) => Promise<void>;
  hasPendingShare: (routineId: string) => boolean;
}

const ShareContext = createContext<ShareContextValue | null>(null);

export function ShareProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [pendingShares, setPendingShares] = useState<SharedRoutineDoc[]>([]);
  const [acceptedShares, setAcceptedShares] = useState<SharedRoutineDoc[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!user) return;

    setIsSyncing(true);
    const unsubscribe = subscribeToShareEvents(user, (categories) => {
      setPendingShares(categories.pending);
      setAcceptedShares(categories.accepted);
      setIsSyncing(false);
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  const shareRoutine = useCallback(
    async (routineId: string, routine: Routine): Promise<string> => {
      if (!user) throw new Error('No autenticado');
      if (hasPendingShare(routineId)) {
        Alert.alert('Error', 'Ya compartiste esta rutina');
        throw new Error('Ya compartiste esta rutina');
      }

      const shareId = await createShare(user, routine);
      await sendShareNotification(user, 'routine_share', shareId, routine.name);
      return shareId;
    },
    [user, pendingShares],
  );

  const acceptShare = useCallback(
    async (shareId: string) => {
      await acceptShareSync(shareId);
      if (user) {
        const share = pendingShares.find((s) => s.id === shareId);
        if (share) {
          await sendShareNotification(
            user,
            'routine_accepted',
            shareId,
            share.routine.name,
          );
        }
      }
    },
    [user, pendingShares],
  );

  const rejectShare = useCallback(
    async (shareId: string) => {
      await rejectShareSync(shareId);
      if (user) {
        const share = pendingShares.find((s) => s.id === shareId);
        if (share) {
          await sendShareNotification(
            user,
            'routine_rejected',
            shareId,
            share.routine.name,
          );
        }
      }
    },
    [user, pendingShares],
  );

  const updateSharedRoutine = useCallback(
    async (shareId: string, routine: Routine) => {
      await updateSharedRoutineSync(shareId, routine);
    },
    [],
  );

  const hasPendingShare = useCallback(
    (routineId: string) => {
      return pendingShares.some((s) => s.routine.name === routineId);
    },
    [pendingShares],
  );

  const value = useMemo(
    () => ({
      pendingShares,
      acceptedShares,
      isSyncing,
      shareRoutine,
      acceptShare,
      rejectShare,
      updateSharedRoutine,
      hasPendingShare,
    }),
    [
      pendingShares,
      acceptedShares,
      isSyncing,
      shareRoutine,
      acceptShare,
      rejectShare,
      updateSharedRoutine,
      hasPendingShare,
    ],
  );

  return (
    <ShareContext.Provider value={value}>{children}</ShareContext.Provider>
  );
}

export function useShare() {
  const ctx = useContext(ShareContext);
  if (!ctx) throw new Error('useShare must be used within ShareProvider');
  return ctx;
}
