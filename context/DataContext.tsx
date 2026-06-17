import React, { createContext, useContext, useEffect, useState } from 'react';
import { Routine, WorkoutSession } from '../types';
import {
  generateId,
  loadRoutines,
  loadSessions,
  saveRoutines,
  saveSessions,
} from '../utils/storage';

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
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadRoutines(), loadSessions()]).then(([loadedRoutines, loadedSessions]) => {
      setRoutines(loadedRoutines);
      setSessions(loadedSessions);
      setIsLoading(false);
    });
  }, []);

  const persistRoutines = (next: Routine[]) => {
    setRoutines(next);
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
    persistRoutines([routine, ...routines]);
    return routine;
  };

  const updateRoutine = (routine: Routine) => {
    persistRoutines(routines.map((r) => (r.id === routine.id ? routine : r)));
  };

  const deleteRoutine = (id: string) => {
    persistRoutines(routines.filter((r) => r.id !== id));
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
