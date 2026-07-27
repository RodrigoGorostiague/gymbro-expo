import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Exercise, ExerciseCatalog, ExerciseVariant, Mesocycle, MuscleGroup, PlannedSessionRef, Routine, UserProfile, WorkoutAttempt, WorkoutSession } from '../types';
import {
  addCatalogExercise,
  assertRoutineMutationReady,
  createCatalogVariant,
  deleteCatalogExercise,
  deleteCatalogVariant,
  deleteAttempt,
  generateId,
  loadAttempts,
  loadCatalogWithRoutines,
  loadHiddenSharedRoutineIds,
  loadMesocycles,
  resetLegacyMesocycleStorage,
  loadSessions,
  loadSessionQuarantine,
  saveMesocycles,
  saveRoutines,
  saveHiddenSharedRoutineIds,
  saveSessions,
  saveCapturedAttempt,
  resolveSessionQuarantine,
  renameCatalogVariant,
  updateAttempt,
  updateCatalogExercise,
} from '../utils/storage';
import { applySessionEdits, attemptToSession } from '../utils/workoutAttempts';
import { updateSharedRoutine } from '../services/shareSync';
import { useAuth } from './AuthContext';
import { useShare } from './ShareContext';

type PersistedWorkoutSession = WorkoutSession & { owner: UserProfile };

interface DataContextValue {
  exercises: Exercise[];
  variants: ExerciseVariant[];
  routines: Routine[];
  mesocycles: Mesocycle[];
  sessions: WorkoutSession[];
  attempts: WorkoutAttempt[];
  quarantinedSessionCount: number;
  isLoading: boolean;
  dataState: 'loading' | 'ready' | 'error';
  dataError: string | null;
  retryData: () => void;
  resolveQuarantine: (action: 'delete' | 'assign') => Promise<void>;
  addExercise: (exercise: Omit<Exercise, 'id'>) => Promise<Exercise>;
  updateExercise: (exercise: Exercise) => Promise<void>;
  deleteExercise: (id: string) => Promise<void>;
  createVariant: (name: string) => Promise<ExerciseVariant>;
  renameVariant: (source: ExerciseVariant, name: string) => Promise<ExerciseVariant>;
  deleteVariant: (source: ExerciseVariant) => Promise<void>;
  getExercise: (id: string) => Exercise | undefined;
  addRoutine: (name: string, muscleGroups: MuscleGroup[]) => Routine;
  updateRoutine: (routine: Routine) => void;
  deleteRoutine: (id: string) => void;
  getRoutine: (id: string) => Routine | undefined;
  addMesocycle: (mesocycle: Omit<Mesocycle, 'id' | 'createdAt'>) => Promise<Mesocycle>;
  updateMesocycle: (mesocycle: Mesocycle) => Promise<void>;
  deleteMesocycle: (id: string) => Promise<void>;
  getMesocycle: (id: string) => Mesocycle | undefined;
  resolvePlannedRoutine: (ref: PlannedSessionRef) => Routine | undefined;
  addSession: (session: Omit<WorkoutSession, 'id'>) => Promise<WorkoutSession>;
  updateSession: (id: string, session: WorkoutSession) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  addAttempt: (attempt: WorkoutAttempt) => Promise<void>;
  editAttempt: (attempt: WorkoutAttempt) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { acceptedShares } = useShare();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [variants, setVariants] = useState<ExerciseVariant[]>([]);
  const [localRoutines, setLocalRoutines] = useState<Routine[]>([]);
  const [mesocycles, setMesocycles] = useState<Mesocycle[]>([]);
  const [hiddenSharedRoutineIds, setHiddenSharedRoutineIds] = useState<string[]>([]);
  const [sessions, setSessions] = useState<PersistedWorkoutSession[]>([]);
  const [attempts, setAttempts] = useState<WorkoutAttempt[]>([]);
  const [quarantinedSessionCount, setQuarantinedSessionCount] = useState(0);
  const mesocyclesRef = useRef<Mesocycle[]>([]);
  const sessionsRef = useRef<PersistedWorkoutSession[]>([]);
  const routinesLoadedRef = useRef(false);
  const mesocyclesLoadedRef = useRef(false);
  const activeUserRef = useRef(user);
  activeUserRef.current = user;
  const mesocycleMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sessionMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [isLoading, setIsLoading] = useState(true);
  const [dataState, setDataState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dataError, setDataError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!user) {
      routinesLoadedRef.current = false;
      mesocyclesLoadedRef.current = false;
      mesocyclesRef.current = [];
      setMesocycles([]);
      sessionsRef.current = [];
      setSessions([]);
      setAttempts([]);
      setQuarantinedSessionCount(0);
      setIsLoading(false);
      setDataState('ready');
      setDataError(null);
      return;
    }

    let active = true;
    setIsLoading(true);
    setDataState('loading');
    setDataError(null);
    routinesLoadedRef.current = false;
    mesocyclesLoadedRef.current = false;
    const operation = sessionMutationQueueRef.current.then(async () => {
      const [loadedRoutineData, loadedMesocycles, loadedSessions, loadedHiddenShareIds, loadedAttempts, quarantine] =
        await Promise.all([
          loadCatalogWithRoutines(),
          resetLegacyMesocycleStorage(user).then(() => loadMesocycles(user)),
          loadSessions(),
          loadHiddenSharedRoutineIds(),
          loadAttempts(user),
          loadSessionQuarantine(),
        ]);
      const { catalog: loadedCatalog, catalogError, routines: loadedRoutines } = loadedRoutineData;
      const migratedSessions = loadedSessions.filter(
        (session): session is PersistedWorkoutSession =>
          'owner' in session && (session.owner === 'rodaja' || session.owner === 'brisas'),
      );
      if (!active) return;
      if (loadedCatalog) {
        setExercises(loadedCatalog.exercises);
        setVariants(loadedCatalog.variants);
      }
      setLocalRoutines(loadedRoutines);
      routinesLoadedRef.current = true;
      mesocyclesRef.current = loadedMesocycles;
      setMesocycles(loadedMesocycles);
      mesocyclesLoadedRef.current = true;
      const sortedSessions = migratedSessions.sort(
        (a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt),
      );
      sessionsRef.current = sortedSessions;
      setSessions(sortedSessions);
      setAttempts(loadedAttempts);
      setQuarantinedSessionCount(quarantine.length);
      setHiddenSharedRoutineIds(loadedHiddenShareIds);
      if (catalogError) throw catalogError;
      setIsLoading(false);
      setDataState('ready');
      setDataError(null);
    });
    operation.catch((error) => {
      if (!active) return;
      setIsLoading(false);
      setDataState('error');
      setDataError(error instanceof Error ? error.message : 'No se pudieron cargar los datos de entrenamiento.');
    });
    sessionMutationQueueRef.current = operation.then(() => undefined, () => undefined);
    return () => {
      active = false;
    };
  }, [user, reloadToken]);

  const retryData = () => setReloadToken((value) => value + 1);

  const resolveQuarantine = async (action: 'delete' | 'assign') => {
    const owner = activeUserRef.current;
    if (!owner) throw new Error('Se requiere autenticación.');
    const operation = sessionMutationQueueRef.current.then(async () => {
      const next = await resolveSessionQuarantine(action, owner);
      sessionsRef.current = next;
      setSessions(next);
      setQuarantinedSessionCount(0);
    });

    sessionMutationQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  };

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
    assertRoutineMutationReady(routinesLoadedRef.current);
    setLocalRoutines(next);
    saveRoutines(next);
  };

  const publishExerciseCatalog = (catalog: ExerciseCatalog) => {
    setExercises(catalog.exercises);
    setVariants(catalog.variants);
  };

  const persistHiddenSharedRoutineIds = (next: string[]) => {
    setHiddenSharedRoutineIds(next);
    saveHiddenSharedRoutineIds(next);
  };

  const enqueueMesocycleMutation = <T,>(
    mutation: (current: Mesocycle[]) => {
      next: Mesocycle[];
      result: T;
    },
  ): Promise<T> => {
    const owner = activeUserRef.current;
    if (!owner) return Promise.reject(new Error('Se requiere autenticación.'));
    const operation = mesocycleMutationQueueRef.current.then(async () => {
      if (!mesocyclesLoadedRef.current) {
        throw new Error('Mesocycles have not finished loading yet.');
      }

      const { next, result } = mutation(mesocyclesRef.current);
      await saveMesocycles(owner, next);
      if (activeUserRef.current === owner) {
        mesocyclesRef.current = next;
        setMesocycles(next);
      }
      return result;
    });

    mesocycleMutationQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  };

  const addExercise = async (exercise: Omit<Exercise, 'id'>): Promise<Exercise> => {
    const { catalog, result } = await addCatalogExercise(exercise);
    publishExerciseCatalog(catalog);
    return result;
  };

  const updateExercise = async (exercise: Exercise): Promise<void> => {
    const { catalog } = await updateCatalogExercise(exercise);
    publishExerciseCatalog(catalog);
  };

  const deleteExercise = async (id: string): Promise<void> => {
    const { catalog } = await deleteCatalogExercise(id);
    publishExerciseCatalog(catalog);
  };

  const createVariant = async (name: string): Promise<ExerciseVariant> => {
    const { catalog, result } = await createCatalogVariant(name);
    publishExerciseCatalog(catalog);
    return result;
  };

  const renameVariant = async (
    source: ExerciseVariant,
    name: string,
  ): Promise<ExerciseVariant> => {
    const { catalog, result } = await renameCatalogVariant(source, name);
    publishExerciseCatalog(catalog);
    return result;
  };

  const deleteVariant = async (source: ExerciseVariant): Promise<void> => {
    const { catalog } = await deleteCatalogVariant(source);
    publishExerciseCatalog(catalog);
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

  const addMesocycle = async (
    mesocycle: Omit<Mesocycle, 'id' | 'createdAt'>,
  ): Promise<Mesocycle> => {
    const created: Mesocycle = {
      ...mesocycle,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };

    return enqueueMesocycleMutation((current) => ({
      next: [created, ...current],
      result: created,
    }));
  };

  const updateMesocycle = async (mesocycle: Mesocycle): Promise<void> => {
    return enqueueMesocycleMutation((current) => {
      if (!current.some(({ id }) => id === mesocycle.id)) {
        throw new Error('Mesocycle not found.');
      }

      return {
        next: current.map((item) => item.id === mesocycle.id ? mesocycle : item),
        result: undefined,
      };
    });
  };

  const deleteMesocycle = async (id: string): Promise<void> => {
    return enqueueMesocycleMutation((current) => {
      if (!current.some((mesocycle) => mesocycle.id === id)) {
        throw new Error('Mesocycle not found.');
      }

      return {
        next: current.filter((mesocycle) => mesocycle.id !== id),
        result: undefined,
      };
    });
  };

  const getMesocycle = (id: string) => mesocycles.find((mesocycle) => mesocycle.id === id);

  const resolvePlannedRoutine = (ref: PlannedSessionRef): Routine | undefined => (
    routines.find((routine) => routine.id === ref.routineId)
    ?? (ref.source === 'shared' && ref.shareId
      ? routines.find((routine) => routine.shareId === ref.shareId)
      : undefined)
  );

  const enqueueSessionMutation = <T,>(
    mutation: (current: PersistedWorkoutSession[]) => {
      next: PersistedWorkoutSession[];
      result: T;
    },
  ): Promise<T> => {
    const operation = sessionMutationQueueRef.current.then(async () => {
      const { next, result } = mutation(sessionsRef.current);
      await saveSessions(next);
      sessionsRef.current = next;
      setSessions(next);
      return result;
    });

    sessionMutationQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  };

  const addSession = (
    session: Omit<WorkoutSession, 'id'>,
  ): Promise<WorkoutSession> => {
    const owner = activeUserRef.current;
    if (!owner) return Promise.reject(new Error('Se requiere autenticación.'));
    const full: PersistedWorkoutSession = { ...session, id: generateId(), owner };
    return enqueueSessionMutation((current) => ({
      next: [full, ...current],
      result: full,
    }));
  };

  const updateSession = async (id: string, edited: WorkoutSession): Promise<void> => {
    const captured = attempts.find((attempt) => attempt.id === id && attempt.owner === activeUserRef.current);
    if (captured) {
      const owner = captured.owner;
      const next = await updateAttempt(owner, applySessionEdits(captured, edited));
      if (activeUserRef.current === owner) setAttempts(next);
      return;
    }
    return enqueueSessionMutation((current) => {
      const existing = current.find((session) => session.id === id);
      if (!existing || existing.owner !== activeUserRef.current) {
        throw new Error('No se encontró la sesión de entrenamiento.');
      }
      if (edited.id !== id || edited.routineId !== existing.routineId || edited.routineName !== existing.routineName) {
        throw new Error('No se puede cambiar la identidad de la sesión de entrenamiento.');
      }
      if (!Number.isFinite(Date.parse(edited.completedAt))) {
        throw new Error('La fecha y la hora de finalización no son válidas.');
      }
      if (!Number.isInteger(edited.durationSeconds) || edited.durationSeconds < 0) {
        throw new Error('La duración del entrenamiento debe ser una cantidad entera no negativa de segundos.');
      }
      if (!Number.isInteger(edited.restTimerSeconds) || edited.restTimerSeconds < 0) {
        throw new Error('La duración del descanso debe ser una cantidad entera no negativa de segundos.');
      }
      if (edited.exercises.length !== existing.exercises.length) {
        throw new Error('No se puede cambiar la estructura de ejercicios de la sesión de entrenamiento.');
      }

      const exercises = existing.exercises.map((exercise, exerciseIndex) => {
        const editedExercise = edited.exercises[exerciseIndex];
        if (
          !editedExercise ||
          editedExercise.exerciseId !== exercise.exerciseId ||
          editedExercise.catalogExerciseId !== exercise.catalogExerciseId ||
          editedExercise.name !== exercise.name ||
          editedExercise.sets.length !== exercise.sets.length
        ) {
          throw new Error('No se puede cambiar la estructura de ejercicios de la sesión de entrenamiento.');
        }

        return {
          ...exercise,
          sets: exercise.sets.map((set, setIndex) => {
            const editedSet = editedExercise.sets[setIndex];
            if (!editedSet || editedSet.setId !== set.setId) {
              throw new Error('No se puede cambiar la estructura de series de la sesión de entrenamiento.');
            }
            if (!Number.isFinite(editedSet.weight) || editedSet.weight < 0) {
              throw new Error('El peso de la serie debe ser un número no negativo.');
            }
            if (!Number.isInteger(editedSet.reps) || editedSet.reps < 0) {
              throw new Error('Las repeticiones de la serie deben ser una cantidad entera no negativa.');
            }
            if (typeof editedSet.completed !== 'boolean') {
              throw new Error('El estado de finalización de la serie no es válido.');
            }
            return {
              setId: set.setId,
              weight: editedSet.weight,
              reps: editedSet.reps,
              completed: editedSet.completed,
            };
          }),
        };
      });

      const nextSession: PersistedWorkoutSession = {
        ...existing,
        completedAt: edited.completedAt,
        durationSeconds: edited.durationSeconds,
        restTimerSeconds: edited.restTimerSeconds,
        exercises,
      };

      return {
        next: current
          .map((session) => (session.id === id ? nextSession : session))
          .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)),
        result: undefined,
      };
    });
  };

  const deleteSession = async (id: string): Promise<void> => {
    const captured = attempts.find((attempt) => attempt.id === id && attempt.owner === activeUserRef.current);
    if (captured) {
      const next = await deleteAttempt(captured.owner, id);
      if (activeUserRef.current === captured.owner) setAttempts(next);
      return;
    }
    return enqueueSessionMutation((current) => {
      if (
        !current.some(
          (session) => session.id === id && session.owner === activeUserRef.current,
        )
      ) {
        throw new Error('No se encontró la sesión de entrenamiento.');
      }
      return {
        next: current.filter((session) => session.id !== id),
        result: undefined,
      };
    });
  };

  const addAttempt = async (attempt: WorkoutAttempt): Promise<void> => {
    const owner = activeUserRef.current;
    if (!owner || attempt.owner !== owner) throw new Error('El propietario del intento debe coincidir con el perfil activo.');
    const next = await saveCapturedAttempt(owner, attempt);
    if (activeUserRef.current === owner) setAttempts(next);
  };

  const editAttempt = async (attempt: WorkoutAttempt): Promise<void> => {
    const owner = activeUserRef.current;
    if (!owner || attempt.owner !== owner) throw new Error('El propietario del intento debe coincidir con el perfil activo.');
    const next = await updateAttempt(owner, attempt);
    if (activeUserRef.current === owner) setAttempts(next);
  };

  const activeAttempts = user ? attempts.filter((attempt) => attempt.owner === user) : [];
  const capturedIds = new Set(activeAttempts.map(({ id }) => id));
  const activeSessions = user
    ? [...activeAttempts.map(attemptToSession), ...sessions.filter((session) => session.owner === user && !capturedIds.has(session.id))]
        .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
    : [];

  return (
    <DataContext.Provider
      value={{
        exercises,
        variants,
        routines,
        mesocycles,
        sessions: activeSessions,
        attempts: activeAttempts,
        quarantinedSessionCount,
        isLoading,
        dataState,
        dataError,
        retryData,
        resolveQuarantine,
        addExercise,
        updateExercise,
        deleteExercise,
        createVariant,
        renameVariant,
        deleteVariant,
        getExercise,
        addRoutine,
        updateRoutine,
        deleteRoutine,
        getRoutine,
        addMesocycle,
        updateMesocycle,
        deleteMesocycle,
        getMesocycle,
        resolvePlannedRoutine,
        addSession,
        updateSession,
        deleteSession,
        addAttempt,
        editAttempt,
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
