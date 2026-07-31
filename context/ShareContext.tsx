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
  hasPendingShare: (routineName: string) => boolean;
}

const ShareContext = createContext<ShareContextValue | null>(null);

export function ShareProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [allPendingShares, setAllPendingShares] = useState<SharedRoutineDoc[]>([]);
  const [pendingShares, setPendingShares] = useState<SharedRoutineDoc[]>([]);
  const [acceptedShares, setAcceptedShares] = useState<SharedRoutineDoc[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    console.log('[ShareProvider] Resolved current user for share listener:', user);

    if (!user) {
      setAllPendingShares([]);
      setPendingShares([]);
      setAcceptedShares([]);
      setIsSyncing(false);
      return;
    }

    setIsSyncing(true);
    const unsubscribe = subscribeToShareEvents(
      user,
      (categories) => {
        const receiverPendingShares = categories.pending.filter(
          (share) => share.sharedWith === user,
        );
        const receiverAcceptedShares = categories.accepted.filter(
          (share) => share.sharedWith === user,
        );

        console.log('[ShareProvider] Share listener snapshot summary', {
          user,
          pendingTotal: categories.pending.length,
          receiverPending: receiverPendingShares.length,
          acceptedTotal: categories.accepted.length,
          receiverAccepted: receiverAcceptedShares.length,
          rejectedTotal: categories.rejected.length,
        });

        setAllPendingShares(categories.pending);
        setPendingShares(receiverPendingShares);
        setAcceptedShares(receiverAcceptedShares);
        setIsSyncing(false);
      },
      (error) => {
        console.error('[ShareProvider] Share listener error', {
          user,
          message: error.message,
        });
        setIsSyncing(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [user]);

  const acceptShare = useCallback(
    async (shareId: string) => {
      const share = pendingShares.find((s) => s.id === shareId);
      if (!share) {
        throw new Error('La rutina compartida no está disponible para este destinatario');
      }

      await acceptShareSync(shareId);
      if (user) {
        await sendShareNotification(
          user,
          'routine_accepted',
          shareId,
          share.routine.name,
        );
      }
    },
    [user, pendingShares],
  );

  const rejectShare = useCallback(
    async (shareId: string) => {
      const share = pendingShares.find((s) => s.id === shareId);
      if (!share) {
        throw new Error('La rutina compartida no está disponible para este destinatario');
      }

      await rejectShareSync(shareId);
      if (user) {
        await sendShareNotification(
          user,
          'routine_rejected',
          shareId,
          share.routine.name,
        );
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
    (routineName: string) => {
      return allPendingShares.some(
        (share) => share.sharedBy === user && share.routine.name === routineName,
      );
    },
    [allPendingShares, user],
  );

  const shareRoutine = useCallback(
    async (_routineId: string, routine: Routine): Promise<string> => {
      if (!user) throw new Error('No autenticado');
      if (hasPendingShare(routine.name)) {
        Alert.alert('Error', 'Ya compartiste esta rutina');
        throw new Error('Ya compartiste esta rutina');
      }

      const shareId = await createShare(user, routine);
      await sendShareNotification(user, 'routine_share', shareId, routine.name);
      return shareId;
    },
    [user, hasPendingShare],
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
