import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActiveWorkoutDraft, CatalogImportPlan, CatalogImportResult, ExperienceProgress, Exercise, ExerciseDefinition, ExerciseVariant, Mesocycle, MuscleGroup, PlannedSessionRef, Routine, UserProfile, WorkoutAttempt, WorkoutSession } from '../types';
import { CatalogMuscleGroup, CatalogParticipationMode, filterCatalogExercises, loadCatalogExercises, loadCatalogMuscleGroups } from '../services/catalog';
import { loadTrainingLibrary, saveTrainingLibrary, saveTrainingMesocycles, saveTrainingRoutines } from '../services/trainingLibrary';
import {
  generateId,
  readLegacyCustomDefinitions,
  removeActiveWorkoutDraftIfMatches,
} from '../utils/storage';
import { reconcileActiveWorkoutTiming } from '../utils/activeWorkoutTiming';
import { hasActiveWorkoutReentryIntegrity, matchesActiveWorkout, WorkoutLaunchTarget } from '../utils/activeWorkoutReentry';
import { applySessionEdits, attemptToSession } from '../utils/workoutAttempts';
import { deleteCustomDefinition, planRecipientImport } from '../utils/catalogLibrary';
import { finalizeTrainingAttempt, importLegacyCustomDefinitions, loadTrainingState, saveTrainingState, TrainingState } from '../services/trainingState';
import { loadExperienceProgress } from '../services/experience';
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
  addRoutine: (name: string, muscleGroups: MuscleGroup[]) => Promise<Routine>;
  updateRoutine: (routine: Routine) => Promise<void>;
  deleteRoutine: (id: string) => Promise<void>;
  getRoutine: (id: string) => Routine | undefined;
  addMesocycle: (mesocycle: Omit<Mesocycle, 'id' | 'createdAt'>) => Promise<Mesocycle>;
  updateMesocycle: (mesocycle: Mesocycle) => Promise<void>;
  deleteMesocycle: (id: string) => Promise<void>;
  getMesocycle: (id: string) => Mesocycle | undefined;
  resolvePlannedRoutine: (ref: PlannedSessionRef) => Routine | undefined;
  addSession: (session: Omit<WorkoutSession, 'id'>) => Promise<WorkoutSession>;
  updateSession: (id: string, session: WorkoutSession) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  experienceProgress: ExperienceProgress | null;
  addAttempt: (attempt: WorkoutAttempt) => ReturnType<typeof finalizeTrainingAttempt>;
  editAttempt: (attempt: WorkoutAttempt) => Promise<void>;
  ensureRecapPublicationKey: (sessionId: string) => Promise<string>;
  activeWorkoutDraft: ActiveWorkoutDraft | null;
  cancelActiveWorkout: () => Promise<void>;
  startActiveWorkout: (draft: ActiveWorkoutDraft) => Promise<void>;
  updateActiveWorkout: (draft: ActiveWorkoutDraft) => Promise<void>;
  clearActiveWorkoutIfMatches: (target: WorkoutLaunchTarget) => Promise<void>;
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
  const [experienceProgress, setExperienceProgress] = useState<ExperienceProgress | null>(null);
  const [activeWorkoutDraft, setActiveWorkoutDraft] = useState<ActiveWorkoutDraft | null>(null);
  const activeWorkoutDraftRef = useRef<ActiveWorkoutDraft | null>(null);
  activeWorkoutDraftRef.current = activeWorkoutDraft;
  const [quarantinedSessionCount, setQuarantinedSessionCount] = useState(0);
  const mesocyclesRef = useRef<Mesocycle[]>([]);
  const sessionsRef = useRef<PersistedWorkoutSession[]>([]);
  const routinesLoadedRef = useRef(false);
  const mesocyclesLoadedRef = useRef(false);
  const activeUserRef = useRef(user);
  const trainingStateRef = useRef<TrainingState | null>(null);
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
      setExperienceProgress(null);
      setDefinitions([]);
      setExercises([]);
      setCatalogMuscleGroups([]);
      activeWorkoutDraftRef.current = null;
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
      const legacyDefinitions = await readLegacyCustomDefinitions(user);
      if (legacyDefinitions.length) await importLegacyCustomDefinitions(legacyDefinitions);
      const [state, trainingLibrary, loadedCatalogExercises, loadedCatalogMuscleGroups, loadedExperienceProgress] =
        await Promise.all([
          loadTrainingState(),
          loadTrainingLibrary(),
          loadCatalogExercises(),
          loadCatalogMuscleGroups(),
          loadExperienceProgress(),
        ]);
      const training = trainingLibrary;
      if (!active) return;
      const activeDraft = hasActiveWorkoutReentryIntegrity(state.activeWorkoutDraft, training.routines, training.mesocycles)
        ? state.activeWorkoutDraft
        : null;
      const orphanedDraft = state.activeWorkoutDraft && !activeDraft ? state.activeWorkoutDraft : null;
      trainingStateRef.current = { ...state, activeWorkoutDraft: activeDraft };
      setDefinitions(state.definitions);
      setExercises([...loadedCatalogExercises, ...state.definitions.map(definitionAsExercise)]);
      setVariants([...new Set([...loadedCatalogExercises, ...state.definitions.map(definitionAsExercise)].map((definition) => definition.variant))]);
      setCatalogMuscleGroups(loadedCatalogMuscleGroups);
      setLocalRoutines(training.routines);
      routinesLoadedRef.current = true;
      mesocyclesRef.current = training.mesocycles;
      setMesocycles(training.mesocycles);
      mesocyclesLoadedRef.current = true;
      const sortedSessions = state.sessions.map((session) => ({ ...session, owner: user })).sort(
        (a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt),
      );
      sessionsRef.current = sortedSessions;
      setSessions(sortedSessions);
      setAttempts(state.attempts);
      setExperienceProgress(loadedExperienceProgress);
      activeWorkoutDraftRef.current = activeDraft;
      setActiveWorkoutDraft(activeDraft);
      if (orphanedDraft && activeUserRef.current === user) {
        // This local runtime key predates remote state. Remove only this exact draft;
        // do not run a broad legacy wipe that can affect another owner's data.
        void removeActiveWorkoutDraftIfMatches(user, orphanedDraft.attemptId).catch(() => undefined);
        void saveTrainingState({ activeWorkoutDraft: null }).catch(() => undefined);
      }
      setQuarantinedSessionCount(0);
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
    const current = activeWorkoutDraftRef.current;
    if (current && current.attemptId !== draft.attemptId) throw new Error('Ya hay un entrenamiento activo para este perfil.');
    if (current?.attemptId === draft.attemptId) return;
    await saveTrainingState({ activeWorkoutDraft: draft });
    if (activeUserRef.current === owner) {
      activeWorkoutDraftRef.current = draft;
      setActiveWorkoutDraft(draft);
    }
  };
  const updateActiveWorkout = async (draft: ActiveWorkoutDraft) => {
    const current = activeWorkoutDraftRef.current;
    if (!current || draft.owner !== current.owner || draft.attemptId !== current.attemptId) throw new Error('El borrador activo no coincide.');
    await saveTrainingState({ activeWorkoutDraft: draft });
    if (activeUserRef.current === draft.owner && activeWorkoutDraftRef.current?.attemptId === draft.attemptId) {
      activeWorkoutDraftRef.current = draft;
      setActiveWorkoutDraft(draft);
    }
  };
  const cancelActiveWorkout = async () => { const owner = activeUserRef.current; if (!owner) throw new Error('Se requiere autenticación.'); await saveTrainingState({ activeWorkoutDraft: null }); if (activeUserRef.current === owner) { activeWorkoutDraftRef.current = null; setActiveWorkoutDraft(null); } };
  const clearActiveWorkoutIfMatches = async (target: WorkoutLaunchTarget) => {
    const draft = activeWorkoutDraftRef.current;
    if (!matchesActiveWorkout(draft, target)) return;
    const owner = target.owner;
    if (!owner || activeUserRef.current !== owner) return;
    activeWorkoutDraftRef.current = null;
    setActiveWorkoutDraft(null);
    try {
      await saveTrainingState({ activeWorkoutDraft: null });
    } catch {
      // The unavailable route must not trap the user when best-effort cleanup is offline.
    }
  };
  const refreshActiveWorkoutTiming = async () => {
    const owner = activeUserRef.current;
    const expectedAttemptId = activeWorkoutDraftRef.current?.attemptId;
    if (!owner || !expectedAttemptId) return;
    const operation = sessionMutationQueueRef.current.then(async () => {
      const loaded = (await loadTrainingState()).activeWorkoutDraft;
      if (activeUserRef.current !== owner || activeWorkoutDraftRef.current?.attemptId !== expectedAttemptId) return;
      if (!loaded) {
        await saveTrainingState({ activeWorkoutDraft: null });
        if (activeWorkoutDraftRef.current?.attemptId === expectedAttemptId) setActiveWorkoutDraft(null);
        return;
      }
      const timing = reconcileActiveWorkoutTiming(loaded, Date.now());
      if (timing.cleanup === 'remove-draft') {
        await saveTrainingState({ activeWorkoutDraft: null });
        if (activeWorkoutDraftRef.current?.attemptId === expectedAttemptId) setActiveWorkoutDraft(null);
      } else if (timing.cleanup === 'clear-rest' && timing.draft) {
        await saveTrainingState({ activeWorkoutDraft: timing.draft });
        setActiveWorkoutDraft(timing.draft);
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
      if (action === 'assign') throw new Error('Las sesiones sin propietario no se migran automáticamente.');
      setQuarantinedSessionCount(0);
    });

    sessionMutationQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  };

  const routines = localRoutines;

  const publishTrainingState = (state: TrainingState) => {
    trainingStateRef.current = state;
    setDefinitions(state.definitions);
    setExercises((current) => [...current.filter((item) => !item.id.startsWith('custom:')), ...state.definitions.map(definitionAsExercise)]);
    setAttempts(state.attempts);
  };

  const mutateTrainingState = async (mutation: (state: TrainingState) => TrainingState) => {
    const owner = activeUserRef.current;
    if (!owner) throw new Error('Se requiere autenticación.');
    const current = trainingStateRef.current;
    if (!current) throw new Error('El entrenamiento aún no terminó de cargar.');
    const next = mutation(current);
    await saveTrainingState(next);
    if (activeUserRef.current === owner) publishTrainingState(next);
    return next;
  };

  const persistRoutines = async (next: Routine[]): Promise<void> => {
    if (!routinesLoadedRef.current) throw new Error('Las rutinas aún no terminaron de cargar.');
    const operation = trainingLibraryMutationQueueRef.current.then(() => saveTrainingRoutines(next));
    trainingLibraryMutationQueueRef.current = operation.then(() => undefined, () => undefined);
    await operation;
    if (activeUserRef.current) setLocalRoutines(next);
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
    await mutateTrainingState((state) => ({ ...state, definitions: [...state.definitions, definition] }));
    return definitionAsExercise(definition);
  };

  const updateExercise = async (exercise: Exercise): Promise<void> => {
    await mutateTrainingState((state) => {
      const existing = state.definitions.find((definition) => definition.id === exercise.id);
      if (!existing) throw new Error('El ejercicio ya no existe en el catálogo.');
      if (existing.source.kind !== 'custom' || existing.source.owner !== activeUserRef.current) throw new Error('Las definiciones del sistema son inmutables. Edita la prescripción dentro de una rutina.');
      return { ...state, definitions: state.definitions.map((definition) => definition.id === exercise.id ? {
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
    await mutateTrainingState((state) => ({ ...state, definitions: deleteCustomDefinition({ version: 2, owner, definitions: state.definitions, routines: [], mesocycles: [], attempts: [] }, owner, id, replacementId).definitions }));
  };

  const importCatalogContent = async (plan: CatalogImportPlan): Promise<CatalogImportResult> => {
    const owner = activeUserRef.current;
    if (!owner || plan.recipient !== owner) throw new Error('La importación debe pertenecer al perfil activo.');
    const state = trainingStateRef.current;
    if (!state) throw new Error('El entrenamiento aún no terminó de cargar.');
    const result = planRecipientImport({ version: 2, owner, definitions: state.definitions, routines: [], mesocycles: [], attempts: state.attempts }, plan);
    const routines = [...localRoutines, ...result.library.routines.filter((routine) => !localRoutines.some(({ id }) => id === routine.id))];
    const mesocycles = [...mesocyclesRef.current, ...result.library.mesocycles.filter((mesocycle) => !mesocyclesRef.current.some(({ id }) => id === mesocycle.id))];
    const save = trainingLibraryMutationQueueRef.current.then(() => saveTrainingLibrary({ routines, mesocycles }));
    trainingLibraryMutationQueueRef.current = save.then(() => undefined, () => undefined);
    await save;
    if (activeUserRef.current === owner) {
      await saveTrainingState({ definitions: result.library.definitions });
      publishTrainingState({ ...state, definitions: result.library.definitions });
      setLocalRoutines(routines);
      mesocyclesRef.current = mesocycles;
      setMesocycles(mesocycles);
    }
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

  const addRoutine = async (name: string, muscleGroups: MuscleGroup[]): Promise<Routine> => {
    const routine: Routine = {
      id: generateId(),
      name,
      muscleGroups,
      exercises: [],
      createdAt: new Date().toISOString(),
    };
    await persistRoutines([routine, ...localRoutines]);
    return routine;
  };

  const updateRoutine = async (routine: Routine): Promise<void> => {
    await persistRoutines(localRoutines.map((r) => (r.id === routine.id ? routine : r)));
  };

  const deleteRoutine = async (id: string): Promise<void> => {
    const scheduled = mesocyclesRef.current.some((mesocycle) => mesocycle.weeks.some((week) =>
      week.entries.some((entry) => 'ref' in entry && entry.ref.routineId === id)));
    if (scheduled) throw new Error('No se puede eliminar la rutina porque está programada en un mesociclo.');
    try {
      await persistRoutines(localRoutines.filter((routine) => routine.id !== id));
    } catch (error) {
      if (error instanceof Error && error.message.includes('invalid training library input')) {
        throw new Error('No se puede eliminar la rutina porque está programada en un mesociclo.');
      }
      throw error;
    }
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
      await saveTrainingState({ sessions: next.map(({ owner: _owner, ...session }) => session) });
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
      const next = attempts.map((attempt) => attempt.id === id ? applySessionEdits(captured, edited) : attempt);
      await saveTrainingState({ attempts: next });
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
      const next = attempts.filter((attempt) => attempt.id !== id);
      await saveTrainingState({ attempts: next });
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

  const addAttempt = async (attempt: WorkoutAttempt): ReturnType<typeof finalizeTrainingAttempt> => {
    const owner = activeUserRef.current;
    if (!owner || attempt.owner !== owner) throw new Error('El propietario del intento debe coincidir con el perfil activo.');
    const existing = attempts.find((item) => item.id === attempt.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(attempt)) throw new Error('La identidad del intento ya pertenece a otros datos capturados.');
    const finalized = await finalizeTrainingAttempt(attempt);
    const next = existing ? attempts : [finalized.attempt, ...attempts];
    if (activeUserRef.current === owner) {
      setAttempts(next);
      setActiveWorkoutDraft(null);
      setExperienceProgress(finalized.experienceReceipt.progress);
      trainingStateRef.current = trainingStateRef.current && { ...trainingStateRef.current, attempts: next, activeWorkoutDraft: null };
    }
    return finalized;
  };

  const editAttempt = async (attempt: WorkoutAttempt): Promise<void> => {
    const owner = activeUserRef.current;
    if (!owner || attempt.owner !== owner) throw new Error('El propietario del intento debe coincidir con el perfil activo.');
    const existing = attempts.find((item) => item.id === attempt.id);
    if (!existing) throw new Error('No se encontró el intento de entrenamiento.');
    const next = attempts.map((item) => item.id === attempt.id ? { ...attempt, rewardApplication: existing.rewardApplication } : item);
    await saveTrainingState({ attempts: next });
    if (activeUserRef.current === owner) setAttempts(next);
  };

  const ensureRecapPublicationKey = async (sessionId: string): Promise<string> => {
    const attempt = attempts.find((item) => item.id === sessionId && item.owner === activeUserRef.current);
    if (attempt) {
      if (attempt.recapPublicationKey) return attempt.recapPublicationKey;
      const recapPublicationKey = generateId();
      const next = attempts.map((item) => item.id === attempt.id ? { ...attempt, recapPublicationKey } : item);
      await saveTrainingState({ attempts: next });
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
        experienceProgress,
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
          clearActiveWorkoutIfMatches,
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
