import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Exercise, MuscleGroup, Routine, WorkoutSession } from '../types';
import {
  generateId,
  loadExercises,
  loadHiddenSharedRoutineIds,
  loadRoutines,
  loadSessions,
  saveExercises,
  saveRoutines,
  saveHiddenSharedRoutineIds,
  saveSessions,
} from '../utils/storage';
import { updateSharedRoutine } from '../services/shareSync';
import { useShare } from './ShareContext';

interface DataContextValue {
  exercises: Exercise[];
  routines: Routine[];
  sessions: WorkoutSession[];
  isLoading: boolean;
  addExercise: (exercise: Omit<Exercise, 'id'>) => Exercise;
  updateExercise: (exercise: Exercise) => void;
  deleteExercise: (id: string) => void;
  getExercise: (id: string) => Exercise | undefined;
  addRoutine: (name: string, muscleGroups: MuscleGroup[]) => Routine;
  updateRoutine: (routine: Routine) => void;
  deleteRoutine: (id: string) => void;
  getRoutine: (id: string) => Routine | undefined;
  addSession: (session: Omit<WorkoutSession, 'id'>) => WorkoutSession;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { acceptedShares } = useShare();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [localRoutines, setLocalRoutines] = useState<Routine[]>([]);
  const [hiddenSharedRoutineIds, setHiddenSharedRoutineIds] = useState<string[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      loadExercises(),
      loadRoutines(),
      loadSessions(),
      loadHiddenSharedRoutineIds(),
    ]).then(([loadedExercises, loadedRoutines, loadedSessions, loadedHiddenShareIds]) => {
      setExercises(loadedExercises);
      setLocalRoutines(loadedRoutines);
      setSessions(loadedSessions);
      setHiddenSharedRoutineIds(loadedHiddenShareIds);
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
    const merged: Routine[] = acceptedShares
      .filter((s) => !hiddenSharedRoutineIds.includes(s.id))
      .map((s) => ({
        id: `shared-${s.id}`,
        name: s.routine.name,
        muscleGroups: s.routine.muscleGroups ?? [],
        exercises: s.routine.exercises,
        createdAt: new Date(s.createdAt).toISOString(),
        isShared: true,
        shareId: s.id,
      }));
    return [...localOnly, ...merged];
  }, [localRoutines, acceptedShares, hiddenSharedRoutineIds]);

  const persistRoutines = (next: Routine[]) => {
    setLocalRoutines(next);
    saveRoutines(next);
  };

  const persistExercises = (next: Exercise[]) => {
    setExercises(next);
    saveExercises(next);
  };

  const persistSessions = (next: WorkoutSession[]) => {
    setSessions(next);
    saveSessions(next);
  };

  const persistHiddenSharedRoutineIds = (next: string[]) => {
    setHiddenSharedRoutineIds(next);
    saveHiddenSharedRoutineIds(next);
  };

  const addExercise = (exercise: Omit<Exercise, 'id'>): Exercise => {
    const created: Exercise = {
      ...exercise,
      id: generateId(),
    };
    persistExercises([created, ...exercises]);
    return created;
  };

  const updateExercise = (exercise: Exercise) => {
    persistExercises(exercises.map((item) => (item.id === exercise.id ? exercise : item)));
  };

  const deleteExercise = (id: string) => {
    persistExercises(exercises.filter((exercise) => exercise.id !== id));
  };

  const getExercise = (id: string) => exercises.find((exercise) => exercise.id === id);

  const addRoutine = (name: string, muscleGroups: MuscleGroup[]): Routine => {
    const routine: Routine = {
      id: generateId(),
      name,
      muscleGroups,
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
    if (routine?.isShared && routine.shareId) {
      // Local-only removal: don't touch Firestore or partner's copy
      if (!hiddenSharedRoutineIds.includes(routine.shareId)) {
        persistHiddenSharedRoutineIds([...hiddenSharedRoutineIds, routine.shareId]);
      }
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
        exercises,
        routines,
        sessions,
        isLoading,
        addExercise,
        updateExercise,
        deleteExercise,
        getExercise,
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
