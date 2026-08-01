import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActiveWorkoutDraft, CatalogImportPlan, CatalogImportResult, CatalogLibrary, Exercise, ExerciseDefinition, ExerciseVariant, Mesocycle, MuscleGroup, PlannedSessionRef, Routine, UserProfile, WorkoutAttempt, WorkoutSession } from '../types';
import { CatalogMuscleGroup, CatalogParticipationMode, filterCatalogExercises, loadCatalogExercises, loadCatalogMuscleGroups } from '../services/catalog';
import { loadTrainingLibrary, saveTrainingLibrary, saveTrainingMesocycles, saveTrainingRoutines } from '../services/trainingLibrary';
import {
  commitCatalogLibraryImport,
  deleteCatalogLibraryDefinition,
  deleteAttempt,
  generateId,
  loadActiveWorkoutDraft,
  loadCatalogLibrary,
  loadSessions,
  loadSessionQuarantine,
  saveSessions,
  saveCapturedAttempt,
  removeActiveWorkoutDraft,
  removeActiveWorkoutDraftIfMatches,
  resetLegacyTrainingDataForNormalizedCatalog,
  saveActiveWorkoutDraft,
  saveActiveWorkoutDraftIfMatches,
  resolveSessionQuarantine,
  updateAttempt,
  updateCatalogLibrary,
} from '../utils/storage';
import { reconcileActiveWorkoutTiming } from '../utils/activeWorkoutTiming';
import { applySessionEdits, attemptToSession } from '../utils/workoutAttempts';
import { useAuth } from './AuthContext';

type PersistedWorkoutSession = WorkoutSession & { owner: UserProfile };

interface DataContextValue {
  exercises: Exercise[];
  definitions: ExerciseDefinition[];
  variants: ExerciseVariant[];
  catalogMuscleGroups: CatalogMuscleGroup[];
  filterCatalogExercises: (groupId: string, mode: CatalogParticipationMode) => Promise<Exercise[]>;
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
  deleteDefinition: (id: string, replacementId?: string) => Promise<void>;
  importCatalogContent: (plan: CatalogImportPlan) => Promise<CatalogImportResult>;
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
  ensureRecapPublicationKey: (sessionId: string) => Promise<string>;
  activeWorkoutDraft: ActiveWorkoutDraft | null;
  cancelActiveWorkout: () => Promise<void>;
  startActiveWorkout: (draft: ActiveWorkoutDraft) => Promise<void>;
  updateActiveWorkout: (draft: ActiveWorkoutDraft) => Promise<void>;
  refreshActiveWorkoutTiming: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

const definitionAsExercise = (definition: ExerciseDefinition): Exercise => ({
  id: definition.id,
  name: definition.name,
  muscleGroups: [...definition.muscleGroups],
  loadMode: definition.loadMode,
  loadUnit: definition.loadUnit,
  variant: definition.variant,
  defaultSets: definition.defaultSets.map((set) => ({ ...set })),
});

function sameActiveWorkoutDraft(
  current: ActiveWorkoutDraft | null,
  next: ActiveWorkoutDraft | null,
): boolean {
  return JSON.stringify(current) === JSON.stringify(next);
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [definitions, setDefinitions] = useState<ExerciseDefinition[]>([]);
  const [variants, setVariants] = useState<ExerciseVariant[]>([]);
  const [catalogMuscleGroups, setCatalogMuscleGroups] = useState<CatalogMuscleGroup[]>([]);
  const [localRoutines, setLocalRoutines] = useState<Routine[]>([]);
  const [mesocycles, setMesocycles] = useState<Mesocycle[]>([]);
  const [sessions, setSessions] = useState<PersistedWorkoutSession[]>([]);
  const [attempts, setAttempts] = useState<WorkoutAttempt[]>([]);
  const [activeWorkoutDraft, setActiveWorkoutDraft] = useState<ActiveWorkoutDraft | null>(null);
  const activeWorkoutDraftRef = useRef<ActiveWorkoutDraft | null>(null);
  activeWorkoutDraftRef.current = activeWorkoutDraft;
  const [quarantinedSessionCount, setQuarantinedSessionCount] = useState(0);
  const mesocyclesRef = useRef<Mesocycle[]>([]);
  const sessionsRef = useRef<PersistedWorkoutSession[]>([]);
  const routinesLoadedRef = useRef(false);
  const mesocyclesLoadedRef = useRef(false);
  const activeUserRef = useRef(user);
  const catalogLibraryRef = useRef<CatalogLibrary | null>(null);
  activeUserRef.current = user;
  const mesocycleMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sessionMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const trainingLibraryMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
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
      setDefinitions([]);
      setExercises([]);
      setCatalogMuscleGroups([]);
      setActiveWorkoutDraft(null);
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
      await resetLegacyTrainingDataForNormalizedCatalog();
      const [library, trainingLibrary, loadedSessions, quarantine, draft, loadedCatalogExercises, loadedCatalogMuscleGroups] =
        await Promise.all([
          loadCatalogLibrary(user),
          loadTrainingLibrary(),
          loadSessions(user),
          loadSessionQuarantine(),
          loadActiveWorkoutDraft(user),
          loadCatalogExercises(),
          loadCatalogMuscleGroups(),
        ]);
      const training = trainingLibrary.routines.length === 0 && trainingLibrary.mesocycles.length === 0
        && (library.routines.length > 0 || library.mesocycles.length > 0)
        ? await saveTrainingLibrary({ routines: library.routines, mesocycles: library.mesocycles }).then(() => ({ routines: library.routines, mesocycles: library.mesocycles }))
        : trainingLibrary;
      const migratedSessions = loadedSessions.filter(
        (session): session is PersistedWorkoutSession =>
          'owner' in session && session.owner === user,
      );
      if (!active) return;
      catalogLibraryRef.current = library;
      setDefinitions([]);
      setExercises(loadedCatalogExercises);
      setVariants([...new Set(loadedCatalogExercises.map((definition) => definition.variant))]);
      setCatalogMuscleGroups(loadedCatalogMuscleGroups);
      setLocalRoutines(training.routines);
      routinesLoadedRef.current = true;
      mesocyclesRef.current = training.mesocycles;
      setMesocycles(training.mesocycles);
      mesocyclesLoadedRef.current = true;
      const sortedSessions = migratedSessions.sort(
        (a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt),
      );
      sessionsRef.current = sortedSessions;
      setSessions(sortedSessions);
      setAttempts(library.attempts);
      setActiveWorkoutDraft(draft);
      setQuarantinedSessionCount(quarantine.length);
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
  const startActiveWorkout = async (draft: ActiveWorkoutDraft) => {
    const owner = activeUserRef.current;
    if (!owner || draft.owner !== owner) throw new Error('Se requiere el propietario activo.');
    if (activeWorkoutDraft && activeWorkoutDraft.attemptId !== draft.attemptId) throw new Error('Ya hay un entrenamiento activo para este perfil.');
    await saveActiveWorkoutDraft(draft);
    if (activeUserRef.current === owner) setActiveWorkoutDraft(draft);
  };
  const updateActiveWorkout = async (draft: ActiveWorkoutDraft) => {
    if (!activeWorkoutDraft || draft.owner !== activeWorkoutDraft.owner || draft.attemptId !== activeWorkoutDraft.attemptId) throw new Error('El borrador activo no coincide.');
    await startActiveWorkout(draft);
  };
  const cancelActiveWorkout = async () => { const owner = activeUserRef.current; if (!owner) throw new Error('Se requiere autenticación.'); await removeActiveWorkoutDraft(owner); if (activeUserRef.current === owner) setActiveWorkoutDraft(null); };
  const refreshActiveWorkoutTiming = async () => {
    const owner = activeUserRef.current;
    const expectedAttemptId = activeWorkoutDraftRef.current?.attemptId;
    if (!owner || !expectedAttemptId) return;
    const operation = sessionMutationQueueRef.current.then(async () => {
      const loaded = await loadActiveWorkoutDraft(owner);
      if (activeUserRef.current !== owner || activeWorkoutDraftRef.current?.attemptId !== expectedAttemptId) return;
      if (!loaded) {
        await removeActiveWorkoutDraftIfMatches(owner, expectedAttemptId);
        if (activeWorkoutDraftRef.current?.attemptId === expectedAttemptId) setActiveWorkoutDraft(null);
        return;
      }
      const timing = reconcileActiveWorkoutTiming(loaded, Date.now());
      if (timing.cleanup === 'remove-draft') {
        await removeActiveWorkoutDraftIfMatches(owner, expectedAttemptId);
        if (activeWorkoutDraftRef.current?.attemptId === expectedAttemptId) setActiveWorkoutDraft(null);
      } else if (timing.cleanup === 'clear-rest' && timing.draft) {
        if (await saveActiveWorkoutDraftIfMatches(timing.draft, expectedAttemptId)) setActiveWorkoutDraft(timing.draft);
      } else if (!sameActiveWorkoutDraft(activeWorkoutDraftRef.current, timing.draft)) {
        setActiveWorkoutDraft(timing.draft);
      }
    });
    sessionMutationQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  };

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

  const routines = localRoutines;

  const publishCatalogLibrary = (library: CatalogLibrary) => {
    catalogLibraryRef.current = library;
    setLocalRoutines(library.routines);
    mesocyclesRef.current = library.mesocycles;
    setMesocycles(library.mesocycles);
    setAttempts(library.attempts);
  };

  const mutateCatalogLibrary = async (mutation: (library: CatalogLibrary) => CatalogLibrary) => {
    const owner = activeUserRef.current;
    if (!owner) throw new Error('Se requiere autenticación.');
    const library = await updateCatalogLibrary(owner, mutation);
    if (activeUserRef.current === owner) publishCatalogLibrary(library);
    return library;
  };

  const persistRoutines = (next: Routine[]) => {
    if (!routinesLoadedRef.current) throw new Error('Las rutinas aún no terminaron de cargar.');
    setLocalRoutines(next);
    const operation = trainingLibraryMutationQueueRef.current.then(() => saveTrainingRoutines(next));
    trainingLibraryMutationQueueRef.current = operation.then(() => undefined, () => undefined);
    void operation;
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
      const save = trainingLibraryMutationQueueRef.current.then(() => saveTrainingMesocycles(next));
      trainingLibraryMutationQueueRef.current = save.then(() => undefined, () => undefined);
      await save;
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
    const owner = activeUserRef.current;
    if (!owner) throw new Error('Se requiere autenticación.');
    const definition: ExerciseDefinition = {
      ...exercise,
      id: `custom:${owner}:${generateId()}`,
      source: { kind: 'custom', owner, originId: generateId() },
      loadMode: exercise.loadMode ?? 'external-load',
      loadUnit: exercise.loadUnit ?? 'kg',
    };
    await mutateCatalogLibrary((library) => ({ ...library, definitions: [...library.definitions, definition] }));
    return definitionAsExercise(definition);
  };

  const updateExercise = async (exercise: Exercise): Promise<void> => {
    await mutateCatalogLibrary((library) => {
      const existing = library.definitions.find((definition) => definition.id === exercise.id);
      if (!existing) throw new Error('El ejercicio ya no existe en el catálogo.');
      if (existing.source.kind !== 'custom' || existing.source.owner !== library.owner) throw new Error('Las definiciones del sistema son inmutables. Edita la prescripción dentro de una rutina.');
      return { ...library, definitions: library.definitions.map((definition) => definition.id === exercise.id ? {
        ...existing,
        name: exercise.name,
        muscleGroups: exercise.muscleGroups,
        loadMode: exercise.loadMode ?? existing.loadMode,
        loadUnit: exercise.loadUnit ?? existing.loadUnit,
        variant: exercise.variant,
        defaultSets: exercise.defaultSets,
      } : definition) };
    });
  };

  const deleteExercise = async (id: string): Promise<void> => {
    await deleteDefinition(id);
  };

  const deleteDefinition = async (id: string, replacementId?: string): Promise<void> => {
    const owner = activeUserRef.current;
    if (!owner) throw new Error('Se requiere autenticación.');
    const library = await deleteCatalogLibraryDefinition(owner, id, replacementId);
    if (activeUserRef.current === owner) publishCatalogLibrary(library);
  };

  const importCatalogContent = async (plan: CatalogImportPlan): Promise<CatalogImportResult> => {
    const owner = activeUserRef.current;
    if (!owner || plan.recipient !== owner) throw new Error('La importación debe pertenecer al perfil activo.');
    const result = await commitCatalogLibraryImport(owner, plan);
    if (activeUserRef.current === owner) publishCatalogLibrary(result.library);
    return result;
  };

  const createVariant = async (name: string): Promise<ExerciseVariant> => {
    throw new Error(`Las variantes son parte de definiciones inmutables. Crea un ejercicio personalizado con "${name}".`);
  };

  const renameVariant = async (
    source: ExerciseVariant,
    name: string,
  ): Promise<ExerciseVariant> => {
    throw new Error(`Las variantes son parte de definiciones inmutables; no se puede renombrar "${source}" a "${name}".`);
  };

  const deleteVariant = async (source: ExerciseVariant): Promise<void> => {
    throw new Error(`Las variantes son parte de definiciones inmutables; no se puede eliminar "${source}".`);
  };

  const getExercise = (id: string) => exercises.find((exercise) => exercise.id === id);
  const filterExercisesByMuscleGroup = (groupId: string, mode: CatalogParticipationMode) => (
    filterCatalogExercises(groupId, mode)
  );

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
    persistRoutines(localRoutines.map((r) => (r.id === routine.id ? routine : r)));
  };

  const deleteRoutine = (id: string) => {
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
    const owner = activeUserRef.current;
    if (!owner) return Promise.reject(new Error('Se requiere autenticación.'));
    const operation = sessionMutationQueueRef.current.then(async () => {
      const { next, result } = mutation(sessionsRef.current);
      await saveSessions(next, owner);
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

  const ensureRecapPublicationKey = async (sessionId: string): Promise<string> => {
    const attempt = attempts.find((item) => item.id === sessionId && item.owner === activeUserRef.current);
    if (attempt) {
      if (attempt.recapPublicationKey) return attempt.recapPublicationKey;
      const recapPublicationKey = generateId();
      const next = await updateAttempt(attempt.owner, { ...attempt, recapPublicationKey });
      if (activeUserRef.current === attempt.owner) setAttempts(next);
      return recapPublicationKey;
    }
    return enqueueSessionMutation((current) => {
      const session = current.find((item) => item.id === sessionId && item.owner === activeUserRef.current);
      if (!session) throw new Error('No se encontró la sesión de entrenamiento.');
      if (session.recapPublicationKey) return { next: current, result: session.recapPublicationKey };
      const recapPublicationKey = generateId();
      return {
        next: current.map((item) => item.id === sessionId ? { ...item, recapPublicationKey } : item),
        result: recapPublicationKey,
      };
    });
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
        definitions,
        variants,
        catalogMuscleGroups,
        filterCatalogExercises: filterExercisesByMuscleGroup,
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
        deleteDefinition,
        importCatalogContent,
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
         ensureRecapPublicationKey,
         activeWorkoutDraft,
         cancelActiveWorkout,
         startActiveWorkout,
          updateActiveWorkout,
          refreshActiveWorkoutTiming,
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
