import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Routine, WorkoutSession } from '../types';
import {
  generateId,
  loadRoutines,
  loadSessions,
  saveRoutines,
  saveSessions,
} from '../utils/storage';
import { updateSharedRoutine } from '../services/shareSync';
import { useShare } from './ShareContext';

interface DataContextValue {
  routines: Routine[];
  sessions: WorkoutSession[];
  isLoading: boolean;
  addRoutine: (name: string) => Routine;
  updateRoutine: (routine: Routine) => void;
  deleteRoutine: (id: string) => void;
  getRoutine: (id: string) => Routine | undefined;
  addSession: (session: Omit<WorkoutSession, 'id'>) => WorkoutSession;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { acceptedShares } = useShare();
  const [localRoutines, setLocalRoutines] = useState<Routine[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadRoutines(), loadSessions()]).then(([loadedRoutines, loadedSessions]) => {
      setLocalRoutines(loadedRoutines);
      setSessions(loadedSessions);
      setIsLoading(false);
    });
  }, []);

  // Merge accepted shares into routines array
  const routines = useMemo(() => {
    // Filter out previously-merged shared routines that are no longer accepted
    const localOnly = localRoutines.filter(
      (r) => !r.isShared || acceptedShares.some((s) => s.id === r.shareId),
    );
    // Add accepted shares as merged routines with isShared/shareId metadata
    const merged: Routine[] = acceptedShares.map((s) => ({
      id: `shared-${s.id}`,
      name: s.routine.name,
      exercises: s.routine.exercises,
      createdAt: new Date(s.createdAt).toISOString(),
      isShared: true,
      shareId: s.id,
    }));
    return [...localOnly, ...merged];
  }, [localRoutines, acceptedShares]);

  const persistRoutines = (next: Routine[]) => {
    setLocalRoutines(next);
    saveRoutines(next);
  };

  const persistSessions = (next: WorkoutSession[]) => {
    setSessions(next);
    saveSessions(next);
  };

  const addRoutine = (name: string): Routine => {
    const routine: Routine = {
      id: generateId(),
      name,
      exercises: [],
      createdAt: new Date().toISOString(),
    };
    persistRoutines([routine, ...localRoutines]);
    return routine;
  };

  const updateRoutine = (routine: Routine) => {
    if (routine.isShared && routine.shareId) {
      updateSharedRoutine(routine.shareId, routine);
      return;
    }
    persistRoutines(localRoutines.map((r) => (r.id === routine.id ? routine : r)));
  };

  const deleteRoutine = (id: string) => {
    const routine = routines.find((r) => r.id === id);
    if (routine?.isShared) {
      // Local-only removal: don't touch Firestore or partner's copy
      setLocalRoutines((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    persistRoutines(localRoutines.filter((r) => r.id !== id));
  };

  const getRoutine = (id: string) => routines.find((r) => r.id === id);

  const addSession = (session: Omit<WorkoutSession, 'id'>): WorkoutSession => {
    const full: WorkoutSession = { ...session, id: generateId() };
    persistSessions([full, ...sessions]);
    return full;
  };

  return (
    <DataContext.Provider
      value={{
        routines,
        sessions,
        isLoading,
        addRoutine,
        updateRoutine,
        deleteRoutine,
        getRoutine,
        addSession,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
