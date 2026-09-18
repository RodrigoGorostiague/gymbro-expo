import { AppState } from 'react-native';
import { OfflineWorkoutJournal, OfflineStatus, FinalizedWorkout, offlineWorkoutAvailable, validWorkoutDraft } from '../services/offlineWorkout';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActiveWorkoutDraft, CatalogImportPlan, CatalogImportResult, ExperienceProgress, Exercise, ExerciseDefinition, ExerciseVariant, Mesocycle, MuscleGroup, PlannedSessionRef, Routine, UserProfile, WorkoutAttempt, WorkoutSession } from '../types';
import { CatalogMuscleGroup, CatalogParticipationMode, filterCatalogExercises, loadCatalogExercises, loadCatalogMuscleGroups } from '../services/catalog';
import { loadTrainingLibrary, saveTrainingMesocycles, saveTrainingRoutines } from '../services/trainingLibrary';
import { canDeleteMesocycle, completeMesocycleWhenAllSessionsComplete, isMesocycleLifecycleOnlyEdit } from '../utils/mesocycles';
import {
  generateId,
  readLegacyCustomDefinitions,
  removeActiveWorkoutDraftIfMatches,
} from '../utils/storage';
import { reconcileActiveWorkoutTiming } from '../utils/activeWorkoutTiming';
import { hasActiveWorkoutReentryIntegrity, matchesActiveWorkout, WorkoutLaunchTarget } from '../utils/activeWorkoutReentry';
import { applySessionEdits, attemptToSession } from '../utils/workoutAttempts';
import { deleteCustomDefinition, planRecipientImport } from '../utils/catalogLibrary';
import { AsyncTimeoutError, withTimeout } from '../utils/withTimeout';
import { contentFingerprint, nextContentVersion } from '../utils/contentVersioning';
import { finalizeTrainingAttempt, importLegacyCustomDefinitions, loadTrainingState, saveTrainingState, startTrainingWorkout, TrainingState } from '../services/trainingState';
import { loadExperienceProgress } from '../services/experience';
import { useAuth } from './AuthContext';

type PersistedWorkoutSession = WorkoutSession & { owner: UserProfile };

const ACTIVE_WORKOUT_SAVE_TIMEOUT_MS = 12_000;
const ACTIVE_WORKOUT_SAVE_DEBOUNCE_MS = 750;

type ActiveWorkoutSaveOptions = {
  defer?: boolean;
  allowFinalizationReset?: boolean;
};

type DeferredActiveWorkoutSave = {
  draft: ActiveWorkoutDraft;
  version: number;
  timer: ReturnType<typeof setTimeout>;
  waiters: Array<{ resolve: () => void; reject: (reason: unknown) => void }>;
};

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
  hydratedUserId: string | null;
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
  saveRoutineDraft: (routine: Routine, base: Routine | null, operationId: string) => Promise<Routine>;
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
  offlineWorkoutResult: (FinalizedWorkout & { sourceAttemptId: string }) | null;
  offlineWorkoutEnabled: boolean;
  onlineWorkoutBlocked: boolean;
  offlineWorkoutStatus: OfflineStatus;
  offlineWorkoutError: string | null;
  retryOfflineWorkout: () => Promise<void>;
  activeWorkoutDraft: ActiveWorkoutDraft | null;
  cancelActiveWorkout: () => Promise<void>;
  startActiveWorkout: (draft: ActiveWorkoutDraft) => Promise<ActiveWorkoutDraft>;
  activeWorkoutRemoteRevision: number;
  prepareOnlineWorkout: () => Promise<ActiveWorkoutDraft>;
  associateActiveWorkoutJoint: (owner: string, attemptId: string, jointWorkoutId: string) => Promise<void>;
  updateActiveWorkout: (draft: ActiveWorkoutDraft, options?: ActiveWorkoutSaveOptions) => Promise<void>;
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
  const [activeWorkoutRemoteRevision, setActiveWorkoutRemoteRevision] = useState(0);
  const [activeWorkoutDraft, setActiveWorkoutDraft] = useState<ActiveWorkoutDraft | null>(null);
  const activeWorkoutDraftRef = useRef<ActiveWorkoutDraft | null>(null);
  activeWorkoutDraftRef.current = activeWorkoutDraft;
  const activeWorkoutMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeWorkoutMutationVersionRef = useRef(0);
  const deferredActiveWorkoutSaveRef = useRef<DeferredActiveWorkoutSave | null>(null);
  const [quarantinedSessionCount, setQuarantinedSessionCount] = useState(0);
  const routinesRef = useRef<Routine[]>([]);
  const mesocyclesRef = useRef<Mesocycle[]>([]);
  const routinesRevisionRef = useRef<number | null>(null);
  const mesocyclesRevisionRef = useRef<number | null>(null);
  const sessionsRef = useRef<PersistedWorkoutSession[]>([]);
  const routinesLoadedRef = useRef(false);
  const mesocyclesLoadedRef = useRef(false);
  const activeUserRef = useRef(user);
  const trainingStateRef = useRef<TrainingState | null>(null);
  const definitionMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  activeUserRef.current = user;
  const routineMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mesocycleMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sessionMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const trainingLibraryMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [isLoading, setIsLoading] = useState(true);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [dataState, setDataState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dataError, setDataError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => {
    // Never show the previous account's projections during offline hydration.
    trainingStateRef.current = null;
    sessionsRef.current = [];
    setSessions([]);
    setAttempts([]);
    setExperienceProgress(null);
    setDefinitions([]);
    setExercises([]);
    setCatalogMuscleGroups([]);
  }, [user]);
  const journalRef = useRef<OfflineWorkoutJournal | null>(null);
  const capabilityRef = useRef(false);
  const seedCandidateRef = useRef<ActiveWorkoutDraft | null>(null);
  const [offlineWorkoutResult, setOfflineWorkoutResult] = useState<(FinalizedWorkout & { sourceAttemptId: string }) | null>(null);
  useEffect(() => { setOfflineWorkoutResult(null); }, [user]);
  const [offlineWorkoutEnabled, setOfflineWorkoutEnabled] = useState(false);
  const [offlineWorkoutStatus, setOfflineWorkoutStatus] = useState<OfflineStatus>('unavailable');
  const [offlineWorkoutError, setOfflineWorkoutError] = useState<string | null>(null);
  const publishFinalized = (finalized: FinalizedWorkout, sourceAttemptId: string) => {
    seedCandidateRef.current = null;
    setOfflineWorkoutResult({ ...finalized, sourceAttemptId });
    activeWorkoutDraftRef.current = null;
    setActiveWorkoutDraft(null);
    setOfflineWorkoutEnabled(false);
    setAttempts((current) => [finalized.attempt, ...current.filter((item) => item.id !== finalized.attempt.id)]);
    setExperienceProgress(finalized.experienceReceipt.progress);
    // Reload collection revisions later; a library failure cannot undo this receipt.
    setReloadToken((value) => value + 1);
  };
  const retryOfflineWorkout = async () => {
    const journal = journalRef.current;
    if (!journal || journal.owner !== activeUserRef.current) return;
    if (journal.current?.transport === 'online' && !journal.hasPendingWork) {
      await reconcileRemoteWorkout();
      return;
    }
    if (!journal.current && seedCandidateRef.current) await journal.seed(seedCandidateRef.current);
    if (journal.status === 'local-error' && !journal.current?.claim && activeWorkoutDraftRef.current) await journal.update(activeWorkoutDraftRef.current);
    const sourceAttemptId = journal.current?.draft.attemptId;
    const wasClaiming = !!journal.current?.claim;
    const wasCancelling = !!journal.current?.cancelled;
    const finalized = await journal.sync();
    if (journal === journalRef.current && journal.owner === activeUserRef.current && activeWorkoutDraftRef.current?.attemptId === sourceAttemptId) {
      if (wasClaiming && journal.current) {
        activeWorkoutDraftRef.current = journal.current.draft;
        setActiveWorkoutDraft(journal.current.draft);
        setActiveWorkoutRemoteRevision((value) => value + 1);
      } else if (wasCancelling && !journal.current) {
        seedCandidateRef.current = null;
        activeWorkoutDraftRef.current = null;
        setActiveWorkoutDraft(null);
      }
    }
    if (finalized && sourceAttemptId && journal === journalRef.current && journal.owner === activeUserRef.current) publishFinalized(finalized, sourceAttemptId);
  };
  const retryOfflineRef = useRef(retryOfflineWorkout);
  retryOfflineRef.current = retryOfflineWorkout;
  const reconcileRemoteWorkout = async () => {
    const journal = journalRef.current;
    const owner = activeUserRef.current;
    if (!journal || !owner || (!capabilityRef.current && !journal.current) || journal.hasPendingWork) return;
    const observed = journal.current;
    const version = activeWorkoutMutationVersionRef.current;
    const [state, progress] = await Promise.all([loadTrainingState(), loadExperienceProgress()]);
    if (journal !== journalRef.current || owner !== activeUserRef.current || version !== activeWorkoutMutationVersionRef.current) return;
    const remote = state.activeWorkoutDraft;
    const adopted = await journal.reconcileRemote(validWorkoutDraft(remote, owner) ? remote : null, observed, () => version === activeWorkoutMutationVersionRef.current);
    if (!adopted || journal !== journalRef.current || owner !== activeUserRef.current || version !== activeWorkoutMutationVersionRef.current) return;
    activeWorkoutDraftRef.current = remote;
    setActiveWorkoutDraft(remote);
    seedCandidateRef.current = validWorkoutDraft(remote, owner) ? remote : null;
    trainingStateRef.current = state;
    setAttempts(state.attempts);
    setExperienceProgress(progress);
    const nextSessions = state.sessions.map((session) => ({ ...session, owner })).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
    sessionsRef.current = nextSessions;
    setSessions(nextSessions);
    setActiveWorkoutRemoteRevision((value) => value + 1);
  };
  const reconcileRemoteRef = useRef(reconcileRemoteWorkout);
  reconcileRemoteRef.current = reconcileRemoteWorkout;
  useEffect(() => {
    let busy = false;
    let failures = 0;
    let retryAfter = 0;
    const retry = async () => {
      if (busy || AppState.currentState === 'background' || Date.now() < retryAfter) return;
      busy = true;
      try {
        if (journalRef.current?.status === 'pending') await retryOfflineRef.current();
        else if (journalRef.current?.status === 'saved') await reconcileRemoteRef.current();
        failures = 0;
        retryAfter = 0;
      } catch (error) {
        journalRef.current?.connectionFailed(error);
        failures += 1;
        retryAfter = Date.now() + Math.min(120_000, 15_000 * 2 ** Math.min(failures - 1, 3));
      } finally { busy = false; }
    };
    const timer = setInterval(() => { void retry(); }, 15_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { retryAfter = 0; void retry(); }
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [user]);

  useEffect(() => {
    capabilityRef.current = false;
    seedCandidateRef.current = null;
    journalRef.current = null;
    setOfflineWorkoutEnabled(false);
    setOfflineWorkoutStatus('unavailable');
    setOfflineWorkoutError(null);
    activeWorkoutDraftRef.current = null;
    setActiveWorkoutDraft(null);
    if (!user) {
      routinesLoadedRef.current = false;
      mesocyclesLoadedRef.current = false;
      routinesRevisionRef.current = null;
      mesocyclesRevisionRef.current = null;
      routinesRef.current = [];
      setLocalRoutines([]);
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
      setHydratedUserId(null);
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
    routinesRevisionRef.current = null;
    mesocyclesRevisionRef.current = null;
    routinesRef.current = [];
    setLocalRoutines([]);
    mesocyclesRef.current = [];
    setMesocycles([]);
    const journal: OfflineWorkoutJournal = new OfflineWorkoutJournal(user, () => active && activeUserRef.current === user && journalRef.current === journal, () => {
      setOfflineWorkoutStatus(journal.status);
      setOfflineWorkoutError(journal.error);
      setOfflineWorkoutEnabled(!!journal.current);
    });
    journalRef.current = journal;
    const operation = sessionMutationQueueRef.current.then(async () => {
      const stored = await journal.restore();
      if (!active) return;
      if (stored) {
        activeWorkoutDraftRef.current = stored.cancelled ? null : stored.draft;
        setActiveWorkoutDraft(stored.cancelled ? null : stored.draft);
        setHydratedUserId(user);
        setIsLoading(false);
      }
      await trainingLibraryMutationQueueRef.current;
      const legacyDefinitions = await readLegacyCustomDefinitions(user);
      if (legacyDefinitions.length) await withTimeout(importLegacyCustomDefinitions(legacyDefinitions), 12_000, 'Legacy definition import');
      const observedJournal = journal.current;
      const observedVersion = activeWorkoutMutationVersionRef.current;
      const [state, trainingLibrary, loadedCatalogExercises, loadedCatalogMuscleGroups, loadedExperienceProgress] =
        await withTimeout(Promise.all([
          loadTrainingState(),
          loadTrainingLibrary(),
          loadCatalogExercises(),
          loadCatalogMuscleGroups(),
          loadExperienceProgress(),
        ]), 12_000, 'Training hydration');
      if (!active) return;
      const training = trainingLibrary;
      if (journal.current && observedVersion === activeWorkoutMutationVersionRef.current) {
        await journal.reconcileRemote(validWorkoutDraft(state.activeWorkoutDraft, user) ? state.activeWorkoutDraft : null, observedJournal, () => observedVersion === activeWorkoutMutationVersionRef.current);
      }
      if (!active) return;
      const activeDraft = observedVersion !== activeWorkoutMutationVersionRef.current ? activeWorkoutDraftRef.current : journal.current?.cancelled ? null : journal.current?.draft ?? (hasActiveWorkoutReentryIntegrity(state.activeWorkoutDraft, training.routines, training.mesocycles)
        ? state.activeWorkoutDraft
        : null);
      const orphanedDraft = !journal.current && state.activeWorkoutDraft && !activeDraft ? state.activeWorkoutDraft : null;
      trainingStateRef.current = { ...state, activeWorkoutDraft: activeDraft };
      setDefinitions(state.definitions);
      setExercises([...loadedCatalogExercises, ...state.definitions.map(definitionAsExercise)]);
      setVariants([...new Set([...loadedCatalogExercises, ...state.definitions.map(definitionAsExercise)].map((definition) => definition.variant))]);
      setCatalogMuscleGroups(loadedCatalogMuscleGroups);
      routinesRef.current = training.routines;
      routinesRevisionRef.current = training.routinesRevision;
      setLocalRoutines(training.routines);
      routinesLoadedRef.current = true;
      mesocyclesRef.current = training.mesocycles;
      mesocyclesRevisionRef.current = training.mesocyclesRevision;
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
      setHydratedUserId(user);
      setDataState('ready');
      setDataError(null);
      try {
        capabilityRef.current = await offlineWorkoutAvailable();
        if (!active) return;
        if (!capabilityRef.current && !journal.current) setOfflineWorkoutError('El guardado offline no está disponible en este servidor. Se requiere conexión.');
        if (capabilityRef.current && activeDraft && validWorkoutDraft(activeDraft, user) && !journal.current) { seedCandidateRef.current = activeDraft; await journal.seed(activeDraft); }
      } catch (error) {
        if (!journal.current && journal.status !== 'local-error') {
          setOfflineWorkoutStatus('unavailable');
          setOfflineWorkoutError('El modo offline no está disponible.');
        }
      }
    });
    operation.catch((error) => {
      if (!active) return;
      journal.connectionFailed(error);
      setIsLoading(false);
      setHydratedUserId(user);
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
    if (journalRef.current?.current?.cancelled) throw new Error('La cancelación anterior debe sincronizarse antes de iniciar otro entrenamiento.');
    const current = activeWorkoutDraftRef.current;
    if (current && current.attemptId !== draft.attemptId) throw new Error('Ya hay un entrenamiento activo para este perfil.');
    if (current?.attemptId === draft.attemptId) return current;
    const journal = journalRef.current;
    ++activeWorkoutMutationVersionRef.current;
    const canonical = draft.jointWorkoutId
      ? (await saveTrainingState({ activeWorkoutDraft: draft }), draft)
      : await startTrainingWorkout(draft);
    if (activeUserRef.current !== owner || journal !== journalRef.current) throw new Error('La cuenta cambió.');
    activeWorkoutDraftRef.current = canonical;
    setActiveWorkoutDraft(canonical);
    if (validWorkoutDraft(canonical, owner) && journal?.owner === owner) {
      seedCandidateRef.current = canonical;
      await journal.seed(canonical);
    }
    return canonical;
  };
  const enqueueActiveWorkoutSave = (draft: ActiveWorkoutDraft | null, version: number): Promise<void> => {
    const operation = activeWorkoutMutationQueueRef.current.then(() => {
      let timedOut = false;
      const save = saveTrainingState({ activeWorkoutDraft: draft });
      const reconcileLateSave = () => {
        if (!timedOut || version >= activeWorkoutMutationVersionRef.current || activeUserRef.current !== draft?.owner) return;
        void enqueueActiveWorkoutSave(activeWorkoutDraftRef.current, activeWorkoutMutationVersionRef.current).catch(() => undefined);
      };
      save.then(reconcileLateSave, reconcileLateSave);
      return withTimeout(save, ACTIVE_WORKOUT_SAVE_TIMEOUT_MS, 'Active workout save').catch((error: unknown) => {
        if (error instanceof AsyncTimeoutError) timedOut = true;
        throw error;
      });
    });
    activeWorkoutMutationQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  };
  const settleDeferredActiveWorkoutSave = (
    waiters: DeferredActiveWorkoutSave['waiters'],
    operation: Promise<void>,
  ) => {
    void operation.then(
      () => waiters.forEach(({ resolve }) => resolve()),
      (error) => waiters.forEach(({ reject }) => reject(error)),
    );
    return operation;
  };
  const flushDeferredActiveWorkoutSave = () => {
    const pending = deferredActiveWorkoutSaveRef.current;
    if (!pending) return null;
    clearTimeout(pending.timer);
    deferredActiveWorkoutSaveRef.current = null;
    return settleDeferredActiveWorkoutSave(
      pending.waiters,
      enqueueActiveWorkoutSave(pending.draft, pending.version),
    );
  };
  const discardDeferredActiveWorkoutSave = () => {
    const pending = deferredActiveWorkoutSaveRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    deferredActiveWorkoutSaveRef.current = null;
    pending.waiters.forEach(({ resolve }) => resolve());
  };
  const scheduleActiveWorkoutSave = (draft: ActiveWorkoutDraft, version: number) => new Promise<void>((resolve, reject) => {
    const pending = deferredActiveWorkoutSaveRef.current;
    if (pending) {
      clearTimeout(pending.timer);
      pending.draft = draft;
      pending.version = version;
      pending.waiters.push({ resolve, reject });
      pending.timer = setTimeout(() => {
        void flushDeferredActiveWorkoutSave();
      }, ACTIVE_WORKOUT_SAVE_DEBOUNCE_MS);
      return;
    }
    const next: DeferredActiveWorkoutSave = {
      draft,
      version,
      waiters: [{ resolve, reject }],
      timer: setTimeout(() => {
        void flushDeferredActiveWorkoutSave();
      }, ACTIVE_WORKOUT_SAVE_DEBOUNCE_MS),
    };
    deferredActiveWorkoutSaveRef.current = next;
  });
  const updateActiveWorkout = async (draft: ActiveWorkoutDraft, options: ActiveWorkoutSaveOptions = {}) => {
    const current = activeWorkoutDraftRef.current;
    if (!current || draft.owner !== current.owner || draft.attemptId !== current.attemptId) throw new Error('El borrador activo no coincide.');
    if (current.pendingFinalization && draft.jointCancellationPending) throw new Error('El guardado del entrenamiento está pendiente de confirmación.');
    if (current.pendingFinalization && !options.allowFinalizationReset) draft = { ...draft, pendingFinalization: current.pendingFinalization };
    if (journalRef.current?.current?.claim) throw new Error('Esperá la confirmación del modo compartido.');
    if (journalRef.current?.current?.transport === 'online' && ['blocked', 'conflict'].includes(journalRef.current.status)) throw new Error('Sincronizá el entrenamiento compartido antes de continuar.');
    ++activeWorkoutMutationVersionRef.current;
    // Publish immediately so the execution UI never waits for a remote draft write.
    activeWorkoutDraftRef.current = draft;
    setActiveWorkoutDraft(draft);
    if (capabilityRef.current && seedCandidateRef.current && journalRef.current && !journalRef.current.current) await journalRef.current.seed(seedCandidateRef.current);
    if (journalRef.current?.current) {
      await journalRef.current.update(draft);
      // Persistence is immediate; only transport is delayed and bounded.
      return;
    }
    const version = ++activeWorkoutMutationVersionRef.current;
    if (options.defer) return scheduleActiveWorkoutSave(draft, version);
    const pending = deferredActiveWorkoutSaveRef.current;
    if (pending) {
      clearTimeout(pending.timer);
      deferredActiveWorkoutSaveRef.current = null;
      return settleDeferredActiveWorkoutSave(
        pending.waiters,
        enqueueActiveWorkoutSave(draft, version),
      );
    }
    await enqueueActiveWorkoutSave(draft, version);
  };
  const prepareOnlineWorkout = async (): Promise<ActiveWorkoutDraft> => {
    const journal = journalRef.current;
    const owner = activeUserRef.current;
    if (!journal || journal.owner !== owner || !activeWorkoutDraftRef.current) throw new Error('Se requiere un entrenamiento activo sincronizado.');
    if (!journal.current) await journal.seed(activeWorkoutDraftRef.current);
    if (journal.hasPendingWork && !journal.current?.claim) await journal.sync();
    const canonical = await journal.claimOnline();
    if (journal !== journalRef.current || owner !== activeUserRef.current) throw new Error('La cuenta cambió.');
    ++activeWorkoutMutationVersionRef.current;
    activeWorkoutDraftRef.current = canonical;
    setActiveWorkoutDraft(canonical);
    setActiveWorkoutRemoteRevision((value) => value + 1);
    return canonical;
  };
  const associateActiveWorkoutJoint = async (owner: string, attemptId: string, jointWorkoutId: string) => {
    const current = activeWorkoutDraftRef.current;
    if (journalRef.current?.current && journalRef.current.current.transport !== 'online') throw new Error('Confirmá el modo compartido antes de aceptar.');
    if (activeUserRef.current !== owner || current?.owner !== owner || current.attemptId !== attemptId) return;
    // Association never rewrites captured finalization or cancellation intent.
    if (current.pendingFinalization || current.jointCancellationPending || current.jointWorkoutId === jointWorkoutId) return;
    await updateActiveWorkout({ ...current, jointWorkoutId });
    if (journalRef.current?.current?.transport === 'online') await retryOfflineWorkout();
  };
  const cancelActiveWorkout = async () => { ++activeWorkoutMutationVersionRef.current; if (journalRef.current?.current) {
    const journal = journalRef.current, owner = activeUserRef.current, attemptId = journal.current?.draft.attemptId;
    if (!attemptId) return;
    await journal.cancel();
    if (journal.current?.transport === 'online') await journal.sync();
    if (journalRef.current === journal && activeUserRef.current === owner && activeWorkoutDraftRef.current?.attemptId === attemptId) {
      seedCandidateRef.current = null;
      activeWorkoutDraftRef.current = null; setActiveWorkoutDraft(null);
    }
    return;
  } if (activeWorkoutDraftRef.current?.pendingFinalization) throw new Error('El guardado del entrenamiento está pendiente de confirmación.'); const owner = activeUserRef.current; if (!owner) throw new Error('Se requiere autenticación.'); discardDeferredActiveWorkoutSave(); await saveTrainingState({ activeWorkoutDraft: null }); if (activeUserRef.current === owner) { activeWorkoutDraftRef.current = null; setActiveWorkoutDraft(null); } };
  const clearActiveWorkoutIfMatches = async (target: WorkoutLaunchTarget) => {
    const draft = activeWorkoutDraftRef.current;
    if (journalRef.current?.current) return;
    if (!matchesActiveWorkout(draft, target) || draft?.pendingFinalization) return;
    const owner = target.owner;
    if (!owner || activeUserRef.current !== owner) return;
    discardDeferredActiveWorkoutSave();
    activeWorkoutDraftRef.current = null;
    setActiveWorkoutDraft(null);
    try {
      await saveTrainingState({ activeWorkoutDraft: null });
    } catch {
      // The unavailable route must not trap the user when best-effort cleanup is offline.
    }
  };
  const refreshActiveWorkoutTiming = async () => {
    if (journalRef.current?.current) return; // Never expire or replace a durable local workout from remote timing.
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

  const publishDefinitions = (next: ExerciseDefinition[]) => {
    if (trainingStateRef.current) trainingStateRef.current = { ...trainingStateRef.current, definitions: next };
    setDefinitions(next);
    setExercises((current) => [...current.filter((item) => !item.id.startsWith('custom:')), ...next.map(definitionAsExercise)]);
  };

  const mutateTrainingDefinitions = async (mutation: (definitions: ExerciseDefinition[]) => ExerciseDefinition[]) => {
    const owner = activeUserRef.current;
    if (!owner) throw new Error('Se requiere autenticación.');
    const operation = definitionMutationQueueRef.current.then(async () => {
      if (activeUserRef.current !== owner) throw new Error('La sesión cambió antes de guardar el ejercicio.');
      const current = trainingStateRef.current;
      if (!current) throw new Error('El entrenamiento aún no terminó de cargar.');
      const next = mutation(current.definitions);
      // Catalog edits own only definitions, never drafts or attempt/history snapshots.
      await saveTrainingState({ definitions: next });
      if (activeUserRef.current === owner) publishDefinitions(next);
      return next;
    });
    definitionMutationQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  };

  const enqueueRoutineMutation = <T,>(
    mutation: (current: Routine[]) => { next: Routine[]; result: T },
  ): Promise<T> => {
    const owner = activeUserRef.current;
    if (!owner) return Promise.reject(new Error('Se requiere autenticación.'));
    const operation = routineMutationQueueRef.current.then(async () => {
      const expectedRevision = routinesRevisionRef.current;
      if (!routinesLoadedRef.current || expectedRevision === null || activeUserRef.current !== owner) {
        throw new Error('Las rutinas aún no terminaron de cargar.');
      }
      const { next, result } = mutation(routinesRef.current);
      const save = trainingLibraryMutationQueueRef.current.then(() => {
        if (activeUserRef.current !== owner) throw new Error('La sesión cambió antes de guardar las rutinas.');
        return saveTrainingRoutines({ expectedRevision, items: next });
      });
      trainingLibraryMutationQueueRef.current = save.then(() => undefined, () => undefined);
      const canonical = await save;
      if (activeUserRef.current === owner) {
        routinesRef.current = canonical.items;
        routinesRevisionRef.current = canonical.revision;
        setLocalRoutines(canonical.items);
      }
      return result;
    });
    routineMutationQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
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

      const expectedRevision = mesocyclesRevisionRef.current;
      if (expectedRevision === null || activeUserRef.current !== owner) {
        throw new Error('Mesocycles have not finished loading yet.');
      }
      const { next, result } = mutation(mesocyclesRef.current);
      const save = trainingLibraryMutationQueueRef.current.then(() => {
        if (activeUserRef.current !== owner) throw new Error('La sesión cambió antes de guardar el mesociclo.');
        return saveTrainingMesocycles({ expectedRevision, items: next });
      });
      trainingLibraryMutationQueueRef.current = save.then(() => undefined, () => undefined);
      const canonical = await save;
      if (activeUserRef.current === owner) {
        mesocyclesRef.current = canonical.items;
        mesocyclesRevisionRef.current = canonical.revision;
        setMesocycles(canonical.items);
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
    await mutateTrainingDefinitions((definitions) => [...definitions, definition]);
    return definitionAsExercise(definition);
  };

  const updateExercise = async (exercise: Exercise): Promise<void> => {
    await mutateTrainingDefinitions((definitions) => {
      const existing = definitions.find((definition) => definition.id === exercise.id);
      if (!existing) throw new Error('El ejercicio ya no existe en el catálogo.');
      if (existing.source.kind !== 'custom' || existing.source.owner !== activeUserRef.current) throw new Error('Las definiciones del sistema son inmutables. Edita la prescripción dentro de una rutina.');
      return definitions.map((definition) => definition.id === exercise.id ? {
        ...existing,
        name: exercise.name,
        muscleGroups: exercise.muscleGroups,
        loadMode: exercise.loadMode ?? existing.loadMode,
        loadUnit: exercise.loadUnit ?? existing.loadUnit,
        variant: exercise.variant,
        defaultSets: exercise.defaultSets,
      } : definition);
    });
  };

  const deleteExercise = async (id: string): Promise<void> => {
    await deleteDefinition(id);
  };

  const deleteDefinition = async (id: string, replacementId?: string): Promise<void> => {
    const owner = activeUserRef.current;
    if (!owner) throw new Error('Se requiere autenticación.');
    await mutateTrainingDefinitions((definitions) => deleteCustomDefinition({ version: 2, owner, definitions, routines: [], mesocycles: [], attempts: [] }, owner, id, replacementId).definitions);
  };

  const importCatalogContent = async (plan: CatalogImportPlan): Promise<CatalogImportResult> => {
    const owner = activeUserRef.current;
    if (!owner || plan.recipient !== owner) throw new Error('La importación debe pertenecer al perfil activo.');
    const state = trainingStateRef.current;
    if (!state) throw new Error('El entrenamiento aún no terminó de cargar.');
    const result = planRecipientImport({ version: 2, owner, definitions: state.definitions, routines: [], mesocycles: [], attempts: state.attempts }, plan);
    const routines = [...routinesRef.current, ...result.library.routines.filter((routine) => !routinesRef.current.some(({ id }) => id === routine.id))];
    const mesocycles = [...mesocyclesRef.current, ...result.library.mesocycles.filter((mesocycle) => !mesocyclesRef.current.some(({ id }) => id === mesocycle.id))];
    const routinesRevision = routinesRevisionRef.current;
    const mesocyclesRevision = mesocyclesRevisionRef.current;
    if (routinesRevision === null || mesocyclesRevision === null) throw new Error('La planificación aún no terminó de cargar.');
    const save = trainingLibraryMutationQueueRef.current.then(async () => {
      if (activeUserRef.current !== owner) throw new Error('La sesión cambió antes de guardar la importación.');
      const savedRoutines = await saveTrainingRoutines({ expectedRevision: routinesRevision, items: routines });
      if (activeUserRef.current === owner) {
        routinesRef.current = savedRoutines.items;
        routinesRevisionRef.current = savedRoutines.revision;
        setLocalRoutines(savedRoutines.items);
      }
      const savedMesocycles = await saveTrainingMesocycles({ expectedRevision: mesocyclesRevision, items: mesocycles });
      return { savedRoutines, savedMesocycles };
    });
    trainingLibraryMutationQueueRef.current = save.then(() => undefined, () => undefined);
    const canonical = await save;
    if (activeUserRef.current === owner) {
      await mutateTrainingDefinitions((definitions) => [
        ...definitions,
        ...result.library.definitions.filter((definition) => !state.definitions.some(({ id }) => id === definition.id) && !definitions.some(({ id }) => id === definition.id)),
      ]);
      routinesRef.current = canonical.savedRoutines.items;
      routinesRevisionRef.current = canonical.savedRoutines.revision;
      setLocalRoutines(canonical.savedRoutines.items);
      mesocyclesRef.current = canonical.savedMesocycles.items;
      mesocyclesRevisionRef.current = canonical.savedMesocycles.revision;
      setMesocycles(canonical.savedMesocycles.items);
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
      version: 1,
      name,
      muscleGroups,
      exercises: [],
      createdAt: new Date().toISOString(),
    };
    return enqueueRoutineMutation((current) => ({ next: [routine, ...current], result: routine }));
  };

  const updateRoutine = async (routine: Routine): Promise<void> => {
    return enqueueRoutineMutation((current) => {
      const existing = current.find((item) => item.id === routine.id);
      if (!existing) throw new Error('La rutina ya no existe.');
      const used = attempts.some((attempt) => attempt.routineId === routine.id);
      return {
        next: used
          ? [...current, nextContentVersion(existing, routine, generateId())]
          : current.map((item) => item.id === routine.id ? routine : item),
        result: undefined,
      };
    });
  };

  // A stable candidate id makes a recovered/retried draft safe to submit again.
  const saveRoutineDraft = async (routine: Routine, base: Routine | null, operationId: string): Promise<Routine> => {
    return enqueueRoutineMutation((current) => {
      const existing = base ? current.find((item) => item.id === base.id) : undefined;
      if (existing && contentFingerprint(existing) === contentFingerprint(routine)) return { next: current, result: existing };
      const used = base && attempts.some((attempt) => attempt.routineId === base.id);
      const candidate = used
        ? nextContentVersion(base!, routine, operationId)
        : { ...routine, id: base?.id ?? operationId };
      const alreadySaved = current.find((item) => item.id === candidate.id);
      if (alreadySaved && contentFingerprint(alreadySaved) === contentFingerprint(candidate)) return { next: current, result: alreadySaved };
      if (base && (!existing || contentFingerprint(existing) !== contentFingerprint(base))) {
        throw new Error('La rutina cambió desde que abriste este borrador. Tus cambios siguen guardados en este dispositivo; revisa la versión actual antes de reemplazarla.');
      }
      if ((!base || used) && alreadySaved) throw new Error('Ya existe otra rutina con el identificador de este borrador.');
      return { next: !base || used ? [candidate, ...current] : current.map((item) => item.id === base.id ? candidate : item), result: candidate };
    });
  };

  const deleteRoutine = async (id: string): Promise<void> => {
    const scheduled = mesocyclesRef.current.some((mesocycle) => mesocycle.weeks.some((week) =>
      week.entries.some((entry) => 'ref' in entry && entry.ref.routineId === id)));
    if (scheduled) throw new Error('No se puede eliminar la rutina porque está programada en un mesociclo.');
    try {
      await enqueueRoutineMutation((current) => ({
        next: current.filter((routine) => routine.id !== id),
        result: undefined,
      }));
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
      version: 1,
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

      const existing = current.find((item) => item.id === mesocycle.id)!;
      const used = attempts.some((attempt) => attempt.lineage?.mesocycleId === mesocycle.id);
      const shouldVersion = used && !isMesocycleLifecycleOnlyEdit(existing, mesocycle);
      return {
        next: shouldVersion ? [...current, nextContentVersion(existing, mesocycle, generateId())] : current.map((item) => item.id === mesocycle.id ? mesocycle : item),
        result: undefined,
      };
    });
  };

  const deleteMesocycle = async (id: string): Promise<void> => {
    return enqueueMesocycleMutation((current) => {
      const existing = current.find((mesocycle) => mesocycle.id === id);
      if (!existing) {
        throw new Error('Mesocycle not found.');
      }
      if (!canDeleteMesocycle(existing, attempts)) throw new Error('Solo se pueden eliminar borradores sin entrenamientos registrados.');

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
    if (journalRef.current?.current) {
      const journal = journalRef.current;
      if (journal.current?.draft.pendingFinalization?.attempt.id !== attempt.id) throw new Error('El resultado debe guardarse primero en este dispositivo.');
      const finalized = await journal.sync();
      if (!finalized) throw new Error('El resultado sigue pendiente de sincronización.');
      if (activeUserRef.current === owner && journalRef.current === journal) publishFinalized(finalized, attempt.id);
      return finalized;
    }
    const existing = attempts.find((item) => item.id === attempt.id);
    // Only these settlement fields are server-owned; preserve receipt identity and all captured data.
    // Sort object keys because JSONB roundtrips do not preserve client property ordering.
    const capturedIdentity = ({ rewardApplication: { state: _state, appliedAt: _appliedAt, ...rewardIdentity }, ...captured }: WorkoutAttempt) => JSON.stringify(
      { ...captured, rewardApplication: rewardIdentity },
      (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])) : value,
    );
    if (existing && capturedIdentity(existing) !== capturedIdentity(attempt)) throw new Error('La identidad del intento ya pertenece a otros datos capturados.');
    const finalized = await finalizeTrainingAttempt(attempt);
    const next = existing ? attempts : [finalized.attempt, ...attempts];
    const lineage = finalized.attempt.lineage;
    if (lineage) {
      await enqueueMesocycleMutation((current) => ({
        next: current.map((mesocycle) => mesocycle.id === lineage.mesocycleId
          ? completeMesocycleWhenAllSessionsComplete(mesocycle, next)
          : mesocycle),
        result: undefined,
      }));
    }
    if (activeUserRef.current === owner) {
      // A timed-out draft save may settle after finalization. Invalidate it and
      // ensure its late reconciliation can only persist the cleared draft.
      activeWorkoutMutationVersionRef.current += 1;
      discardDeferredActiveWorkoutSave();
      activeWorkoutDraftRef.current = null;
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
        hydratedUserId,
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
        saveRoutineDraft,
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
         offlineWorkoutResult,
        offlineWorkoutEnabled,
        onlineWorkoutBlocked: !!journalRef.current?.current?.claim || (journalRef.current?.current?.transport === 'online' && ['blocked', 'conflict', 'local-error'].includes(offlineWorkoutStatus)),
        offlineWorkoutStatus,
        offlineWorkoutError,
        retryOfflineWorkout,
        activeWorkoutDraft,
    activeWorkoutRemoteRevision,
         cancelActiveWorkout,
         startActiveWorkout,
          updateActiveWorkout,
        prepareOnlineWorkout,
        associateActiveWorkoutJoint,
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
