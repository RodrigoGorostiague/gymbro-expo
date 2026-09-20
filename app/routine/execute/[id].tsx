import { RoutineBodyMap } from '../../../components/TrainingBodyMap';
import { WorkoutExerciseCard } from '../../../components/WorkoutExerciseCard';
import { setLoadBasis, routineSetLabels, continuesDropBlock } from '../../../utils/setPrescription';
import { seedMesocycleWorkout } from '../../../utils/mesocycleContinuity';
import { useLatestRequest } from '../../../hooks/useLatestRequest';
import React, { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../../components/AppNavBar';
import { AppScreenHeader } from '../../../components/AppScreenHeader';
import { ExercisePicker } from '../../../components/ExercisePicker';
import { ExclusiveSetCelebration, SetCelebrationHandle } from '../../../components/ExclusiveSetCelebration';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { EffortTargetControl } from '../../../components/EffortTargetControl';
import { SetTypeControl } from '../../../components/SetTypeControl';
import { HapticPressable } from '../../../components/HapticPressable';
import { ProfileAvatar } from '../../../components/ProfileAvatar';
import { ProfileTitleBadge } from '../../../components/ProfileTitleBadge';
import { JointWorkoutLiveRoster } from '../../../components/JointWorkoutLiveRoster';
import { RestCompletionBadge } from '../../../components/RestCompletionBadge';
import { GlassButton, GlassInput } from '../../../components/UI';
import { useAuth } from '../../../context/AuthContext';
import { useData } from '../../../context/DataContext';
import { useShop } from '../../../context/ShopContext';
import { useTheme } from '../../../context/ThemeContext';
import { useSocial } from '../../../context/SocialContext';
import { ActiveWorkoutDraft, CompletedExercise, CompletedSet, Exercise, ExperienceReceipt, Routine, RoutineSet, SetType, WorkoutAttempt } from '../../../types';
import { vibrateRestTimerComplete } from '../../../utils/haptics';
import { generateId } from '../../../utils/storage';
import { classifyTrainingFinalizationError, isDefinitelyRejectedFinalization } from '../../../services/trainingState';
import { createWorkoutAttempt } from '../../../utils/workoutAttempts';
import { receiptTotal } from '../../../services/rewardWallet';
import * as Haptics from '../../../utils/sensoryHaptics';
import { RewardReceipt } from '../../../types';
import { matchesActiveWorkout } from '../../../utils/activeWorkoutReentry';
import { reconcileActiveWorkoutTiming } from '../../../utils/activeWorkoutTiming';
import { withTimeout } from '../../../utils/withTimeout';
import { validateMesocycleExecutionLineage } from '../../../utils/mesocycleExecutionLineage';
import { ActiveWorkoutInviteCandidate, completedJointWorkoutInput, resolveJointWorkoutAttempt, inviteActiveWorkoutMember, jointParticipantInviteCapacity, JointCompletedWorkout, JointParticipant, JointVisibility, JointWorkoutLiveState, leaveJointWorkoutAttempt, listActiveWorkoutInviteCandidates, listJointWorkouts, updateJointWorkoutLiveProgress } from '../../../services/jointWorkouts';
import { prepareJointWorkoutPublication, queueJointWorkoutPublication, flushPendingJointWorkoutPublications, loadJointPublicationProgress } from '../../../services/jointWorkoutPublicationQueue';
import { recapSharePayload } from '../../../services/workoutRecapFeed';
import { closeWorkoutStartActivity, publishWorkoutStartActivity } from '../../../services/workoutStartActivity';
import { attemptToSession } from '../../../utils/workoutAttempts';
import { appendSessionExercise, hasCompletedSessionExerciseSet, moveWorkoutExercise, nextEffectiveSessionSetNumber, reconcileSessionCompletedSets, reconcileSessionSetValues, removeSessionExercise, snapshotWorkoutRoutine, updateSessionExerciseSets, withSessionSetType } from '../../../utils/workoutDraft';
import { getShopTheme } from '../../../constants/shopThemes';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { cancelAnimation, Easing, FadeIn, ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { WorkoutGuidance } from '../../../components/WorkoutGuidance';
import { WorkoutCompletionReview } from '../../../components/WorkoutCompletionReview';
import { nextWorkoutSet } from '../../../utils/workoutExperience';
import { getSensoryPreferences } from '../../../utils/sensoryPreferences';
import { useAnimationActivity } from '../../../hooks/useAnimationActivity';

function readSingleParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) return readSingleParam(value[0]);
  return undefined;
}

function parseLineage(params: {
  mesocycleId?: string | string[];
  weekNumber?: string | string[];
  plannedSessionId?: string | string[];
}) {
  const mesocycleId = readSingleParam(params.mesocycleId);
  const plannedSessionId = readSingleParam(params.plannedSessionId);
  const rawWeekNumber = readSingleParam(params.weekNumber);
  const weekNumber = rawWeekNumber ? Number(rawWeekNumber) : Number.NaN;

  if (!mesocycleId && !plannedSessionId && !rawWeekNumber) return undefined;
  if (!mesocycleId || !plannedSessionId || !Number.isInteger(weekNumber) || weekNumber <= 0) return null;

  return { mesocycleId, weekNumber, plannedSessionId };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function isFailureSet(tipo: SetType): boolean {
  return tipo === 'F';
}

function getSetTypeLabel(tipo: SetType): string {
  if (tipo === 'C') return 'Calentamiento';
  if (tipo === 'F') return 'Serie al fallo';
  return `Serie ${tipo}`;
}

type SetKey = string;

const REMOTE_OPERATION_TIMEOUT_MS = 12_000;
const JOINT_PROGRESS_DEBOUNCE_MS = 350;
const gymbroIcon = process.env.NODE_ENV === 'test' ? 0 : require('../../../assets/gymbro-icon.png');

interface SetRuntimeValues {
  durationSeconds?: string;
  actualEffort?: import('../../../types').ActualEffort;
  weight: string;
  reps: string;
}

type PendingJointCompletion = {
  attemptId: string;
  workoutId: string;
  visibility: JointVisibility;
  completedWorkout: JointCompletedWorkout;
};

type PendingJointProgress = {
  workoutId: string;
  routine: Routine;
  completedSets: Record<SetKey, boolean>;
  state: JointWorkoutLiveState;
  restSeconds?: number;
};

function buildSetValues(routine: Routine): Record<SetKey, SetRuntimeValues> {
  return reconcileSessionSetValues(routine, {});
}

function jointProgress(routine: Routine, completedSets: Record<SetKey, boolean>) {
  const exercises = routine.exercises.map((exercise) => exercise.sets.map((set) => !!completedSets[`${exercise.id}-${set.id}`]));
  return {
    completedExercises: exercises.filter((sets) => sets.length > 0 && sets.every(Boolean)).length,
    totalExercises: exercises.length,
    completedSets: exercises.flat().filter(Boolean).length,
    totalSets: exercises.reduce((total, sets) => total + sets.length, 0),
  };
}

function WorkoutSaveIndicator({ visible, color, textColor }: { visible: boolean; color: string; textColor: string }) {
  const rotation = useSharedValue(0);
  const animationActive = useAnimationActivity(visible);

  useEffect(() => {
    cancelAnimation(rotation);
    rotation.value = animationActive ? withRepeat(withTiming(360, { duration: 1_100, easing: Easing.linear }), -1, false) : 0;
    return () => cancelAnimation(rotation);
  }, [animationActive, rotation]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  if (!visible) return null;

  return <View accessibilityRole="progressbar" accessibilityLabel="Guardando datos" accessibilityState={{ busy: true }} style={[styles.saveIndicator, { borderColor: color }]}>
    <Animated.View style={iconStyle}><Image source={gymbroIcon} style={styles.saveIndicatorLogo} /></Animated.View>
    <Text style={[styles.saveIndicatorText, { color: textColor }]}>Guardando datos...</Text>
  </View>;
}

export default function ExecuteRoutineScreen() {
  const params = useLocalSearchParams<{
    id: string | string[];
    mesocycleId?: string | string[];
    weekNumber?: string | string[];
    plannedSessionId?: string | string[];
    jointWorkoutId?: string | string[];
  }>();
  const id = readSingleParam(params.id) ?? '';
  const { user } = useAuth();
  const { realtimeRevision } = useSocial();
  const rosterReads = useLatestRequest(`${user}:${id}`);
  const candidateReads = useLatestRequest(`${user}:${id}`);
  const { activeWorkoutRemoteRevision = 0, offlineWorkoutEnabled = false, onlineWorkoutBlocked = false, offlineWorkoutStatus = 'unavailable', offlineWorkoutError, offlineWorkoutResult, prepareOnlineWorkout, getRoutine, addAttempt, mesocycles, routines, attempts = [], exercises: catalogExercises, definitions = [], activeWorkoutDraft, startActiveWorkout, updateActiveWorkout, cancelActiveWorkout, clearActiveWorkoutIfMatches, refreshActiveWorkoutTiming = async () => undefined } = useData();
  const { theme } = useTheme();
  const [pendingJointCompletion, setPendingJointCompletion] = useState<PendingJointCompletion | null>(null);
  const [jointPublicationWaiting, setJointPublicationWaiting] = useState(false);
  const [jointPublicationError, setJointPublicationError] = useState<string | null>(null);
  const [isSyncingJointCompletion, setIsSyncingJointCompletion] = useState(false);
  const parsedLineage = parseLineage(params);
  const resumingExpiredSession = !!parsedLineage && matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: id, lineage: parsedLineage });
  const lineageValidation = validateMesocycleExecutionLineage(mesocycles, id, parsedLineage, readSingleParam(params.mesocycleId), resumingExpiredSession);
  const localRecovery = offlineWorkoutEnabled && matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: id, ...(parsedLineage ? { lineage: parsedLineage } : {}) });
  const lineage = localRecovery ? activeWorkoutDraft?.lineage : lineageValidation.valid ? lineageValidation.lineage : undefined;
  const plannedEntry = lineage && mesocycles.find((mesocycle) => mesocycle.id === lineage.mesocycleId)
    ?.weeks.find((week) => week.weekNumber === lineage.weekNumber)
    ?.entries.find((entry) => entry.id === lineage.plannedSessionId);
  const sourceRoutine = plannedEntry && 'routineSnapshot' in plannedEntry && plannedEntry.routineSnapshot
    ? plannedEntry.routineSnapshot
    : getRoutine(id) ?? ((activeWorkoutDraft?.pendingFinalization || localRecovery) && matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: id }) ? activeWorkoutDraft?.routineSnapshot : undefined);
  const launchSeed = useMemo(() => sourceRoutine && !activeWorkoutDraft
    ? seedMesocycleWorkout(sourceRoutine, mesocycles, attempts, user, lineage)
    : null, [sourceRoutine, mesocycles, attempts, user, lineage?.mesocycleId, lineage?.weekNumber, lineage?.plannedSessionId, activeWorkoutDraft]);
  const previousPerformance = useMemo(() => sourceRoutine
    ? seedMesocycleWorkout(sourceRoutine, mesocycles, attempts, user, lineage, activeWorkoutDraft?.startedAtMs).previous
    : {}, [sourceRoutine, mesocycles, attempts, user, lineage?.mesocycleId, lineage?.weekNumber, lineage?.plannedSessionId, activeWorkoutDraft?.startedAtMs]);
  const initialJointWorkoutId = readSingleParam(params.jointWorkoutId) ?? activeWorkoutDraft?.jointWorkoutId;

  const [offlineResumeConfirmed, setOfflineResumeConfirmed] = useState(false);
  const offlineResumeRequired = localRecovery && !activeWorkoutDraft?.pendingFinalization && !activeWorkoutDraft?.pausedAtMs && Date.now() - activeWorkoutDraft!.startedAtMs - (activeWorkoutDraft!.pausedDurationMs ?? 0) >= 5 * 60 * 60 * 1000 && !offlineResumeConfirmed;
  const hydratedRemoteRevisionRef = useRef(-1);
  const [phase, setPhase] = useState<'setup' | 'active' | 'done'>('setup');
  const [restSecondsOverride, setRestSeconds] = useState<string | null>(null);
  const restSeconds = restSecondsOverride ?? String(launchSeed?.restTimerSeconds ?? 90);
  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [completedSets, setCompletedSets] = useState<Record<SetKey, boolean>>({});
  const [setValues, setSetValues] = useState<Record<SetKey, SetRuntimeValues>>({});
  const [isFinishing, setIsFinishing] = useState(false);
  const [finalizationLocked, setFinalizationLocked] = useState(!!activeWorkoutDraft?.pendingFinalization);
  const ambiguousFinalizationRef = useRef(!!activeWorkoutDraft?.pendingFinalization);
  const pendingFinalizationRef = useRef(activeWorkoutDraft?.pendingFinalization);
  const [isStarting, setIsStarting] = useState(false);
  const [earnedGems, setEarnedGems] = useState(0);
  const [rewardReceipt, setRewardReceipt] = useState<RewardReceipt | null>(null);
  const [experienceReceipt, setExperienceReceipt] = useState<ExperienceReceipt | null>(null);
  const [jointWorkoutId, setJointWorkoutId] = useState<string | null>(initialJointWorkoutId ?? null);
  const [jointTargets, setJointTargets] = useState<JointParticipant[]>([]);
  const [jointInviteCandidates, setJointInviteCandidates] = useState<ActiveWorkoutInviteCandidate[]>([]);
  const [selectedJointInviteIds, setSelectedJointInviteIds] = useState<string[]>([]);
  const [isJointBusy, setJointBusy] = useState(false);
  const [isJointExpanded, setJointExpanded] = useState(false);
  const [workoutRoutine, setWorkoutRoutine] = useState<Routine | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [exerciseDisclosure, setExerciseDisclosure] = useState<Record<string, boolean>>({});
  useEffect(() => { setExerciseDisclosure({}); setFocusMode(false); }, [activeWorkoutDraft?.attemptId]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [positionMenuExerciseId, setPositionMenuExerciseId] = useState<string | null>(null);
  const [finishMenuVisible, setFinishMenuVisible] = useState(false);
  const [jointCancellationStatus, setJointCancellationStatus] = useState<'idle' | 'pending' | 'uncertain'>(activeWorkoutDraft?.jointCancellationPending ? 'pending' : 'idle');
  const [workoutSyncError, setWorkoutSyncError] = useState<string | null>(null);
  const [restCompletionBadgeVisible, setRestCompletionBadgeVisible] = useState(false);
  const [workoutControlsVisible, setWorkoutControlsVisible] = useState(true);
  const [pendingSaveCount, setPendingSaveCount] = useState(0);
  const routine = workoutRoutine ?? sourceRoutine;

  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const completingSetsRef = useRef(new Set<SetKey>());
  const finishInFlightRef = useRef(false);
  const attemptRef = useRef<WorkoutAttempt | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const restEndsAtMsRef = useRef<number | null>(null);
  const restCompletionAlertedRef = useRef(false);
  const pauseMutationRef = useRef(false);
  const jointCancellationStartedRef = useRef(activeWorkoutDraft?.jointCancellationPending === true);
  const jointCancellationInFlightRef = useRef(false);
  const startInFlightRef = useRef(false);
  const publishedJointSessionRef = useRef<string | null>(null);
  const setCelebrationRef = useRef<SetCelebrationHandle | null>(null);
  const jointProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingJointProgressRef = useRef<PendingJointProgress | null>(null);
  const activeWorkoutDraftRef = useRef(activeWorkoutDraft);
  const setValuesRef = useRef<Record<SetKey, SetRuntimeValues>>({});
  const reconcileElapsedRef = useRef<() => void>(() => undefined);
  const handleRestCompleteRef = useRef<() => void>(() => undefined);
  const refreshActiveWorkoutTimingRef = useRef(refreshActiveWorkoutTiming);
  const lastExerciseScrollOffsetRef = useRef(0);
  const workoutControlsVisibility = useSharedValue(1);
  const restTimerConfig = parseInt(restSeconds, 10) || 90;
  const floatingWorkoutControlsStyle = useAnimatedStyle(() => ({
    opacity: withTiming(workoutControlsVisibility.value, { duration: 180 }),
    transform: [{ translateY: withTiming(workoutControlsVisibility.value ? 0 : -88, { duration: 180 }) }],
  }));
  useEffect(() => {
    activeWorkoutDraftRef.current = activeWorkoutDraft;
  }, [activeWorkoutDraft]);

  useEffect(() => {
    if (!offlineWorkoutResult || offlineWorkoutResult.sourceAttemptId !== attemptIdRef.current) return;
    if (offlineWorkoutResult.attempt?.id) attemptRef.current = offlineWorkoutResult.attempt;
    setRewardReceipt(offlineWorkoutResult.receipt);
    setExperienceReceipt(offlineWorkoutResult.experienceReceipt);
    setEarnedGems(receiptTotal(offlineWorkoutResult.receipt));
    setPhase('done');
  }, [offlineWorkoutResult]);

  const updateCurrentActiveWorkout = useCallback((updater: (draft: ActiveWorkoutDraft) => ActiveWorkoutDraft, defer = false, allowFinalizationReset = false) => {
    const current = activeWorkoutDraftRef.current;
    if (!current) return Promise.resolve();
    const next = updater(current);
    activeWorkoutDraftRef.current = next;
    let operation: Promise<void>;
    try {
      operation = Promise.resolve(allowFinalizationReset ? updateActiveWorkout(next, { allowFinalizationReset: true }) : defer ? updateActiveWorkout(next, { defer: true }) : updateActiveWorkout(next));
    } catch (error) {
      operation = Promise.reject(error);
    }
    setPendingSaveCount((count) => count + 1);
    void operation.finally(() => setPendingSaveCount((count) => Math.max(0, count - 1))).catch(() => undefined);
    return operation;
  }, [updateActiveWorkout]);

  const applySetValues = (next: Record<SetKey, SetRuntimeValues>) => {
    setValuesRef.current = next;
    setSetValues(next);
  };

  const commitSetValues = useCallback((values = setValuesRef.current) => (
    updateCurrentActiveWorkout((draft) => ({ ...draft, setValues: values }))
  ), [updateCurrentActiveWorkout]);

  const unavailableCleanupStartedRef = useRef(false);
  useEffect(() => {
    if (sourceRoutine || unavailableCleanupStartedRef.current) return;
    unavailableCleanupStartedRef.current = true;
    void clearActiveWorkoutIfMatches({
      owner: user,
      routineId: id,
      ...(parsedLineage ? { lineage: parsedLineage } : {}),
    });
  }, [clearActiveWorkoutIfMatches, id, parsedLineage, sourceRoutine, user]);

  useEffect(() => {
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (restRef.current) clearInterval(restRef.current);
      if (jointProgressTimerRef.current) clearTimeout(jointProgressTimerRef.current);
      restRef.current = null;
    };
  }, []);

  const reconcileElapsed = useCallback(() => {
    if (!activeWorkoutDraft || !routine || !matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: routine.id, ...(lineage ? { lineage } : {}) })) return;
    const nowMs = Date.now();
    const localRestEndsAtMs = restEndsAtMsRef.current;
    if (localRestEndsAtMs && activeWorkoutDraft.restEndsAtMs) restEndsAtMsRef.current = null;
    const timing = reconcileActiveWorkoutTiming(activeWorkoutDraft, nowMs, offlineWorkoutEnabled);
    setElapsed(timing.elapsedSeconds);
    if (localRestEndsAtMs && !activeWorkoutDraft.restEndsAtMs) {
      const localRemaining = Math.max(0, Math.ceil((localRestEndsAtMs - nowMs) / 1000));
      if (localRemaining > 0) {
        setRestRemaining(localRemaining);
        setIsResting(true);
        return;
      }
      handleRestCompleteRef.current();
      void refreshActiveWorkoutTiming();
      return;
    }
    setRestRemaining(timing.restRemainingSeconds);
    setIsResting(timing.isResting);
    if (timing.cleanup === 'clear-rest') handleRestCompleteRef.current();
    if (timing.cleanup !== 'none') void refreshActiveWorkoutTiming();
  }, [activeWorkoutDraft, lineage, refreshActiveWorkoutTiming, routine, user]);
  reconcileElapsedRef.current = reconcileElapsed;
  refreshActiveWorkoutTimingRef.current = refreshActiveWorkoutTiming;

  useFocusEffect(useCallback(() => {
    void refreshActiveWorkoutTimingRef.current();
    reconcileElapsedRef.current();
    if (phase === 'active') elapsedRef.current = setInterval(() => reconcileElapsedRef.current(), 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshActiveWorkoutTimingRef.current();
        reconcileElapsedRef.current();
      }
    });
    return () => {
      subscription.remove();
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, [phase]));

  const persistAndLeaveActiveWorkout = useEffectEvent(() => {
    if (phase !== 'active' || finishMenuVisible || pickerVisible || isFinishing) return false;
    void updateCurrentActiveWorkout((draft) => ({ ...draft, setValues: setValuesRef.current })).then(() => router.back()).catch((error) => {
      Alert.alert('No se pudo guardar el entrenamiento', error instanceof Error ? error.message : 'Vuelve a intentarlo.');
    });
    return true;
  });

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', persistAndLeaveActiveWorkout);
    return () => subscription.remove();
  }, []));

  useEffect(() => {
    if (!sourceRoutine || !activeWorkoutDraft || !matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: sourceRoutine.id, ...(lineage ? { lineage } : {}) }) || (phase !== 'setup' && hydratedRemoteRevisionRef.current === activeWorkoutRemoteRevision)) return;
    hydratedRemoteRevisionRef.current = activeWorkoutRemoteRevision;
    attemptIdRef.current = activeWorkoutDraft.attemptId;
    if (activeWorkoutDraft.pendingFinalization) {
      attemptRef.current = activeWorkoutDraft.pendingFinalization.attempt;
      pendingFinalizationRef.current = activeWorkoutDraft.pendingFinalization;
      ambiguousFinalizationRef.current = true;
      setFinalizationLocked(true);
    }
    startTimeRef.current = activeWorkoutDraft.startedAtMs;
    setRestSeconds(String(activeWorkoutDraft.restTimerSeconds));
    const snapshot = activeWorkoutDraft.routineSnapshot ?? snapshotWorkoutRoutine(sourceRoutine);
    const migratedCompletedSets = reconcileSessionCompletedSets(snapshot, activeWorkoutDraft.completedSets);
    applySetValues(activeWorkoutDraft.setValues);
    setCompletedSets(migratedCompletedSets);
    setWorkoutRoutine(snapshot);
    if (activeWorkoutDraft.jointCancellationPending) {
      jointCancellationStartedRef.current = true;
      setJointCancellationStatus('pending');
      setFinishMenuVisible(true);
    }
    if (!activeWorkoutDraft.routineSnapshot || JSON.stringify(migratedCompletedSets) !== JSON.stringify(activeWorkoutDraft.completedSets)) {
      void updateCurrentActiveWorkout((draft) => ({ ...draft, routineSnapshot: snapshot, completedSets: migratedCompletedSets }));
    }
    setJointWorkoutId(activeWorkoutDraft.jointWorkoutId ?? initialJointWorkoutId ?? null);
    const timing = reconcileActiveWorkoutTiming(activeWorkoutDraft, Date.now(), offlineWorkoutEnabled);
    setRestRemaining(timing.restRemainingSeconds);
    setIsResting(timing.isResting);
    setElapsed(timing.elapsedSeconds);
    setPhase('active');
  }, [activeWorkoutDraft, activeWorkoutRemoteRevision, initialJointWorkoutId, lineage, phase, sourceRoutine, updateCurrentActiveWorkout, user]);

  useEffect(() => {
    if (phase === 'active' && attemptIdRef.current && !activeWorkoutDraft && !finalizationLocked) setPhase('setup');
  }, [activeWorkoutDraft, finalizationLocked, phase]);

  useEffect(() => {
    const draftJointWorkoutId = activeWorkoutDraft?.jointWorkoutId;
    if (
      phase !== 'active'
      || !draftJointWorkoutId
      || draftJointWorkoutId === jointWorkoutId
      || !sourceRoutine
      || !matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: sourceRoutine.id, ...(lineage ? { lineage } : {}) })
    ) return;

    // An invite can be accepted from the global notification while this screen stays mounted.
    setJointWorkoutId(draftJointWorkoutId);
    router.setParams({ jointWorkoutId: draftJointWorkoutId });
  }, [activeWorkoutDraft, jointWorkoutId, lineage, phase, sourceRoutine, user]);

  useEffect(() => {
    if (phase !== 'active') return;
    void loadJointState().catch(() => undefined);
  }, [activeWorkoutRemoteRevision, jointWorkoutId, phase]);

  useEffect(() => {
    if (phase !== 'active' || realtimeRevision === 0) return;
    void loadJointState().catch(() => undefined);
  }, [jointWorkoutId, phase, realtimeRevision]);

  const publishJointLiveProgress = useCallback((nextCompletedSets: Record<SetKey, boolean>, state: JointWorkoutLiveState, restSeconds?: number) => {
    if (!jointWorkoutId || !routine) return;
    pendingJointProgressRef.current = { workoutId: jointWorkoutId, routine, completedSets: nextCompletedSets, state, restSeconds };
    if (jointProgressTimerRef.current) return;
    jointProgressTimerRef.current = setTimeout(() => {
      jointProgressTimerRef.current = null;
      const pending = pendingJointProgressRef.current;
      pendingJointProgressRef.current = null;
      if (!pending) return;
      void withTimeout(
        updateJointWorkoutLiveProgress(pending.workoutId, {
          state: pending.state,
          ...jointProgress(pending.routine, pending.completedSets),
          ...(pending.state === 'resting' && pending.restSeconds ? { restSeconds: pending.restSeconds } : {}),
        }),
        REMOTE_OPERATION_TIMEOUT_MS,
        'Joint workout status update',
      ).catch(() => undefined);
    }, JOINT_PROGRESS_DEBOUNCE_MS);
  }, [jointWorkoutId, routine]);

  useEffect(() => {
    if (phase !== 'active' || !jointWorkoutId || !routine || publishedJointSessionRef.current === jointWorkoutId) return;
    publishedJointSessionRef.current = jointWorkoutId;
    publishJointLiveProgress(completedSets, activeWorkoutDraft?.pausedAtMs ? 'paused' : isResting ? 'resting' : 'training', isResting ? Math.max(1, restRemaining) : undefined);
  }, [activeWorkoutDraft?.pausedAtMs, completedSets, isResting, jointWorkoutId, phase, publishJointLiveProgress, restRemaining, routine]);

  const handleRestComplete = useCallback(() => {
    if (restCompletionAlertedRef.current) return;
    restCompletionAlertedRef.current = true;
    restEndsAtMsRef.current = null;
    if (restRef.current) clearInterval(restRef.current);
    restRef.current = null;
    setIsResting(false);
    setRestRemaining(0);
    vibrateRestTimerComplete();
    void refreshActiveWorkoutTimingRef.current();
    setRestCompletionBadgeVisible(true);
    publishJointLiveProgress(completedSets, 'training');
  }, [completedSets, publishJointLiveProgress]);
  handleRestCompleteRef.current = handleRestComplete;

  const startRestCountdown = useCallback((restEndsAtMs: number) => {
    if (restRef.current) clearInterval(restRef.current);
    restRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((restEndsAtMs - Date.now()) / 1000));
      if (remaining === 0) {
        handleRestCompleteRef.current();
        return;
      }
      setRestRemaining(remaining);
    }, 1000);
  }, []);

  const startRestTimer = useCallback((nextCompletedSets = completedSets) => {
    if (restRef.current) clearInterval(restRef.current);
    restRef.current = null;
    const restEndsAtMs = Date.now() + restTimerConfig * 1000;
    restEndsAtMsRef.current = restEndsAtMs;
    restCompletionAlertedRef.current = false;
    setRestCompletionBadgeVisible(false);
    setRestRemaining(restTimerConfig);
    setIsResting(true);
    void updateCurrentActiveWorkout((draft) => ({ ...draft, setValues: setValuesRef.current, completedSets: nextCompletedSets, restEndsAtMs }), true);
    startRestCountdown(restEndsAtMs);
    publishJointLiveProgress(nextCompletedSets, 'resting', restTimerConfig);
  }, [completedSets, publishJointLiveProgress, restTimerConfig, startRestCountdown, updateCurrentActiveWorkout]);

  const continueActiveWorkout = (draft: NonNullable<typeof activeWorkoutDraft>) => {
    const params: Record<string, string> = { id: draft.routineId };
    if (draft.jointWorkoutId) params.jointWorkoutId = draft.jointWorkoutId;
    if (draft.lineage) {
      params.mesocycleId = draft.lineage.mesocycleId;
      params.weekNumber = String(draft.lineage.weekNumber);
      params.plannedSessionId = draft.lineage.plannedSessionId;
    }
    router.replace({ pathname: '/routine/execute/[id]', params });
  };

  const startWorkout = async () => {
    if (!sourceRoutine || !user || !lineageValidation.valid || startInFlightRef.current) return;
    const currentDraft = activeWorkoutDraft;
    if (currentDraft) {
      if (matchesActiveWorkout(currentDraft, { owner: user, routineId: sourceRoutine.id, ...(lineage ? { lineage } : {}) })) {
        setPhase('active');
        return;
      }
      Alert.alert('Tenés un entrenamiento en curso', 'Terminá o continuá el entrenamiento activo antes de iniciar otro.', [{ text: 'Continuar entrenamiento', onPress: () => continueActiveWorkout(currentDraft) }, { text: 'Entendido', style: 'cancel' }]);
      return;
    }

    startInFlightRef.current = true;
    setIsStarting(true);
    try {
      const snapshot = launchSeed?.routine ?? snapshotWorkoutRoutine(sourceRoutine);
      const values = launchSeed?.values ?? buildSetValues(snapshot);
      const attemptId = generateId();
      const canonical = await startActiveWorkout({ version: 1, owner: user, attemptId, routineId: snapshot.id, routineSnapshot: snapshot, jointWorkoutId: initialJointWorkoutId, lineage, startedAtMs: Date.now(), restTimerSeconds: restTimerConfig, completedSets: {}, setValues: values });
      if (canonical && canonical.attemptId !== attemptId) {
        continueActiveWorkout(canonical);
        return;
      }
      setRestSeconds(String(restTimerConfig));
      applySetValues(values);
      setWorkoutRoutine(snapshot);
      setCompletedSets({});
      attemptIdRef.current = attemptId;
      attemptRef.current = null;
      setPhase('active');
      startTimeRef.current = Date.now();
      void publishWorkoutStartActivity(snapshot.name, initialJointWorkoutId, attemptId).catch(() => undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar el entrenamiento.';
      Alert.alert('No se pudo iniciar el entrenamiento', message);
    } finally {
      startInFlightRef.current = false;
      setIsStarting(false);
    }
  };

  const persistWorkoutRoutine = (next: Routine, nextSetValues?: Record<SetKey, SetRuntimeValues>) => {
    setWorkoutRoutine(next);
    void updateCurrentActiveWorkout((draft) => ({ ...draft, routineSnapshot: next, ...(nextSetValues ? { setValues: nextSetValues } : {}) }));
  };

  const addSessionExercise = (exercise: Exercise) => {
    if (!routine) return;
    const next = appendSessionExercise(routine, exercise, definitions, generateId);
    const merged = reconcileSessionSetValues(next, setValues);
    applySetValues(merged);
    persistWorkoutRoutine(next, merged);
    setPickerVisible(false);
  };

  const moveSessionExercise = (exerciseId: string, targetIndex: number) => {
    const currentRoutine = activeWorkoutDraftRef.current?.routineSnapshot ?? routine;
    const currentCompletedSets = activeWorkoutDraftRef.current?.completedSets ?? completedSets;
    if (!currentRoutine) return;
    const exercise = currentRoutine.exercises.find((candidate) => candidate.id === exerciseId);
    if (!exercise || hasCompletedSessionExerciseSet(exercise, currentCompletedSets)) return;
    const currentIndex = currentRoutine.exercises.indexOf(exercise);
    if (currentIndex < 0 || currentIndex === targetIndex) return;
    const next = moveWorkoutExercise(currentRoutine, currentIndex, targetIndex);
    const merged = reconcileSessionSetValues(next, setValuesRef.current);
    applySetValues(merged);
    persistWorkoutRoutine(next, merged);
  };

  const deleteSessionExercise = (exerciseId: string) => {
    const currentDraft = activeWorkoutDraftRef.current;
    const currentRoutine = currentDraft?.routineSnapshot ?? routine;
    const currentCompletedSets = currentDraft?.completedSets ?? completedSets;
    if (!currentRoutine) return;
    const exercise = currentRoutine.exercises.find((candidate) => candidate.id === exerciseId);
    if (!exercise || hasCompletedSessionExerciseSet(exercise, currentCompletedSets)) return;
    const next = removeSessionExercise(currentRoutine, exerciseId);
    const nextSetValues = reconcileSessionSetValues(next, setValuesRef.current);
    const nextCompletedSets = reconcileSessionCompletedSets(next, currentCompletedSets);
    setCompletedSets(nextCompletedSets);
    applySetValues(nextSetValues);
    setWorkoutRoutine(next);
    void updateCurrentActiveWorkout((draft) => ({
      ...draft,
      routineSnapshot: next,
      setValues: nextSetValues,
      completedSets: nextCompletedSets,
    }));
  };

  const confirmDeleteSessionExercise = (exerciseId: string) => {
    const exercise = routine?.exercises.find((candidate) => candidate.id === exerciseId);
    if (!exercise || hasCompletedSessionExerciseSet(exercise, completedSets)) return;
    Alert.alert(
      '¿Eliminar ejercicio?',
      `Se eliminará ${exercise.name} solo de este entrenamiento. Tu rutina guardada no cambiará.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar ejercicio', style: 'destructive', onPress: () => deleteSessionExercise(exerciseId) },
      ],
    );
  };

  const syncActiveWorkout = (draft: ActiveWorkoutDraft) => {
    setWorkoutSyncError(null);
    void withTimeout(
      updateCurrentActiveWorkout(() => draft),
      REMOTE_OPERATION_TIMEOUT_MS,
      'Workout sync',
    ).catch((error) => {
      setWorkoutSyncError(error instanceof Error ? error.message : 'No se pudo sincronizar el entrenamiento.');
    });
  };

  const resumeWorkout = () => {
    const currentDraft = activeWorkoutDraftRef.current;
    if (!currentDraft?.pausedAtMs || pauseMutationRef.current) return false;
    pauseMutationRef.current = true;
    const nowMs = Date.now();
    const pauseMs = Math.max(0, nowMs - currentDraft.pausedAtMs);
    const remaining = Math.max(0, currentDraft.pausedRestRemainingSeconds ?? 0);
    const restEndsAtMs = remaining ? nowMs + remaining * 1000 : undefined;
    if (restEndsAtMs) {
      restEndsAtMsRef.current = restEndsAtMs;
      restCompletionAlertedRef.current = false;
      setIsResting(true); setRestRemaining(remaining);
      setRestCompletionBadgeVisible(false);
      startRestCountdown(restEndsAtMs);
    }
    syncActiveWorkout({
      ...currentDraft,
      pausedAtMs: undefined,
      pausedRestRemainingSeconds: undefined,
      pausedDurationMs: (currentDraft.pausedDurationMs ?? 0) + pauseMs,
      restEndsAtMs,
    });
    publishJointLiveProgress(completedSets, restEndsAtMs ? 'resting' : 'training', restEndsAtMs ? remaining : undefined);
    pauseMutationRef.current = false;
    return true;
  };

  // Old saved pauses are resumed once on entry; new workouts cannot be paused.
  const resumeLegacyPause = useEffectEvent(() => resumeWorkout());
  useEffect(() => {
    if (phase === 'active' && activeWorkoutDraft?.pausedAtMs && !activeWorkoutDraft.pendingFinalization && !activeWorkoutDraft.jointCancellationPending) resumeLegacyPause();
  }, [phase, activeWorkoutDraft?.attemptId, activeWorkoutDraft?.pausedAtMs]);

  const closeFinishMenu = () => {
    if (!jointCancellationStartedRef.current && !jointCancellationInFlightRef.current && !isFinishing) setFinishMenuVisible(false);
  };

  const retryActiveWorkoutSync = () => {
    const currentDraft = activeWorkoutDraftRef.current;
    if (currentDraft) syncActiveWorkout(currentDraft);
  };

  useEffect(() => {
    if (!workoutSyncError) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') retryActiveWorkoutSync();
    });
    return () => subscription.remove();
  }, [workoutSyncError]);

  const finishFromFinishMenu = () => {
    if (jointCancellationStartedRef.current || finishInFlightRef.current || jointCancellationInFlightRef.current) return;
    setFinishMenuVisible(false);
    void finishWorkout(jointWorkoutId ? 'circle' : undefined);
  };

  const cancelFromFinishMenu = async () => {
    if (jointCancellationInFlightRef.current || finishInFlightRef.current || isFinishing) return;
    jointCancellationInFlightRef.current = true;
    setJointCancellationStatus('pending');
    if (jointWorkoutId) {
      jointCancellationStartedRef.current = true;
      setJointCancellationStatus('pending');
    }
    try {
      if (jointWorkoutId && activeWorkoutDraftRef.current?.transportMode !== 'online') {
        // Make the lock restart-safe before an idempotent leave can commit remotely.
        await updateCurrentActiveWorkout((draft) => ({ ...draft, jointCancellationPending: true }));
        if (!user || !attemptIdRef.current) throw new Error('Authentication required.');
        await leaveJointWorkoutAttempt(user, attemptIdRef.current, jointWorkoutId);
      }
      await cancelActiveWorkout();
      router.back();
    } catch (error) {
      setJointCancellationStatus(jointWorkoutId ? 'uncertain' : 'idle');
      Alert.alert('No se pudo cancelar el entrenamiento', error instanceof Error ? error.message : 'Inténtalo nuevamente.');
    } finally {
      jointCancellationInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (phase !== 'active' || !jointWorkoutId || activeWorkoutDraft?.jointCancellationPending !== true) return;
    setFinishMenuVisible(true);
    void cancelFromFinishMenu();
  }, [activeWorkoutDraft?.jointCancellationPending, jointWorkoutId, phase]);

  const loadJointState = async (workoutId = jointWorkoutId) => {
    const isCurrent = rosterReads.begin();
    const captured = activeWorkoutDraftRef.current;
    const canonical = captured ? await withTimeout(resolveJointWorkoutAttempt(captured.attemptId), REMOTE_OPERATION_TIMEOUT_MS, 'Joint workout association') : null;
    if (!isCurrent() || (captured && activeWorkoutDraftRef.current?.attemptId !== captured.attemptId)) return;
    if (canonical && captured && !captured.pendingFinalization && !captured.jointCancellationPending) {
      workoutId = canonical;
      if (jointWorkoutId !== canonical) {
        await updateCurrentActiveWorkout((draft) => ({ ...draft, jointWorkoutId: canonical }));
        if (!isCurrent()) return;
        setJointWorkoutId(canonical);
        router.setParams({ jointWorkoutId: canonical });
      }
    }
    if (!workoutId) return;
    const sessions = await withTimeout(listJointWorkouts(), REMOTE_OPERATION_TIMEOUT_MS, 'Joint workout roster refresh');
    if (!isCurrent()) return;
    const current = sessions.find((session) => session.id === workoutId);
    setJointTargets(current?.participants.filter((participant) => !participant.isSelf) ?? []);
  };

  const toggleJointInviteCandidate = (profileId: string) => {
    if (isJointBusy) return;
    setSelectedJointInviteIds((current) => {
      if (current.includes(profileId)) return current.filter((id) => id !== profileId);
      const selectedMembers = current.reduce((count, id) => count + (jointInviteCandidates.find((candidate) => candidate.id === id)?.groupMemberCount ?? 1), 0);
      const candidateMembers = jointInviteCandidates.find((candidate) => candidate.id === profileId)?.groupMemberCount ?? 1;
      return selectedMembers + candidateMembers <= (jointWorkoutId ? jointParticipantInviteCapacity(jointTargets) : 3) ? [...current, profileId] : current;
    });
  };

  const inviteSelectedToJointWorkout = async () => {
    if (!routine || phase !== 'active' || !selectedJointInviteIds.length) return;
    const selected = jointInviteCandidates.filter((profile) => selectedJointInviteIds.includes(profile.id));
    if (!selected.length) return;
    const captured = activeWorkoutDraftRef.current;
    if (!captured || captured.pendingFinalization || captured.jointCancellationPending) return;
    setJointBusy(true);
    const successfulIds = new Set<string>();
    let activeWorkoutId = jointWorkoutId;
    try {
      const claimed = await prepareOnlineWorkout();
      activeWorkoutDraftRef.current = claimed;
      await withTimeout(publishWorkoutStartActivity(routine.name, claimed.jointWorkoutId, claimed.attemptId), REMOTE_OPERATION_TIMEOUT_MS, 'Joint workout invitation presence');
      for (const profile of selected) {
        try {
          {
            const invitedWorkoutId = await withTimeout(inviteActiveWorkoutMember(profile.id, routine), REMOTE_OPERATION_TIMEOUT_MS, 'Joint workout invitation');
            if (activeWorkoutDraftRef.current?.attemptId !== captured.attemptId || activeWorkoutDraftRef.current.owner !== captured.owner) return;
            activeWorkoutId = invitedWorkoutId;
            if (invitedWorkoutId !== jointWorkoutId) {
            setJointWorkoutId(invitedWorkoutId);
            setJointExpanded(false);
            await updateCurrentActiveWorkout((draft) => draft.pendingFinalization || draft.jointCancellationPending ? draft : ({ ...draft, jointWorkoutId: invitedWorkoutId }));
            router.setParams({ jointWorkoutId: invitedWorkoutId });
            }
          }
          successfulIds.add(profile.id);
        } catch {
          // Keep failed recipients selected so the user can retry them together.
        }
      }
      setSelectedJointInviteIds((current) => current.filter((id) => !successfulIds.has(id)));
      setJointInviteCandidates((current) => current.filter((profile) => !successfulIds.has(profile.id)));
      if (activeWorkoutId) await loadJointState(activeWorkoutId);
      const failedCount = selected.length - successfulIds.size;
      if (!failedCount) Alert.alert('Invitaciones enviadas', `${successfulIds.size} ${successfulIds.size === 1 ? 'persona fue invitada' : 'personas fueron invitadas'} a entrenar con vos.`);
      else Alert.alert(successfulIds.size ? 'Invitaciones parciales' : 'No se pudo invitar', successfulIds.size
        ? `Se enviaron ${successfulIds.size} de ${selected.length} invitaciones. Las restantes siguen seleccionadas para reintentar.`
        : 'No se pudo enviar ninguna invitación. Intentá otra vez.');
    } catch (error) {
      Alert.alert('No se pudo invitar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally { setJointBusy(false); }
  };

  const loadJointInviteCandidates = async (resetSelection = false, showLoading = true) => {
    if (phase !== 'active') return;
    const isCurrent = candidateReads.begin();
    if (showLoading) setJointBusy(true);
    try {
      const candidates = await withTimeout(listActiveWorkoutInviteCandidates(), REMOTE_OPERATION_TIMEOUT_MS, 'Active workout connections');
      if (!isCurrent()) return;
      setJointInviteCandidates(candidates);
      setSelectedJointInviteIds((current) => current.filter((id) => candidates.some((candidate) => candidate.id === id)));
      if (resetSelection) setSelectedJointInviteIds([]);
    } catch (error) {
      if (!isCurrent()) return;
      if (resetSelection) Alert.alert('No se pudieron cargar tus conexiones', error instanceof Error ? error.message : 'Inténtalo nuevamente.');
    } finally { if (isCurrent() && showLoading) setJointBusy(false); }
  };

  const toggleJointHeader = () => {
    setJointExpanded((expanded) => !expanded);
  };

  const handleExerciseScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = Math.max(0, event.nativeEvent.contentOffset.y);
    const delta = offset - lastExerciseScrollOffsetRef.current;
    const shouldShow = offset < 12 || delta < -8;
    const shouldHide = false;

    if ((shouldShow && !workoutControlsVisible) || (shouldHide && workoutControlsVisible)) {
      const visible = shouldShow;
      setWorkoutControlsVisible(visible);
      workoutControlsVisibility.value = visible ? 1 : 0;
    }

    lastExerciseScrollOffsetRef.current = offset;
  };

  useEffect(() => {
    if (phase !== 'active') return;
    void loadJointInviteCandidates(false, isJointExpanded);
  }, [isJointExpanded, phase, realtimeRevision]);

  const updateSetValue = (setKey: SetKey, field: 'weight' | 'reps' | 'durationSeconds', value: string) => {
    if (completedSets[setKey]) return;
    const next = { ...setValuesRef.current, [setKey]: { ...setValuesRef.current[setKey], [field]: value } };
    applySetValues(next);
    if (offlineWorkoutEnabled) void commitSetValues(next).catch(() => undefined);
  };

  const completeSet = async (setKey: SetKey, tipo: SetType) => {
    if (completedSets[setKey] || completingSetsRef.current.has(setKey)) return;

    const values = setValuesRef.current[setKey];
    const ownerExercise = routine?.exercises.find((exercise) => exercise.sets.some((set) => `${exercise.id}-${set.id}` === setKey));
    const prescription = ownerExercise?.sets.find((set) => `${ownerExercise.id}-${set.id}` === setKey);
    const bodyweight = !!ownerExercise && !!prescription && setLoadBasis(ownerExercise, prescription) === 'bodyweight';
    const weight = bodyweight ? 0 : Number((values?.weight ?? '').replace(',', '.'));
    const timed = prescription?.durationSeconds !== undefined;
    const reps = Number(timed ? values?.durationSeconds : values?.reps);

    if ((!bodyweight && !values?.weight.trim()) || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps <= 0 || (timed && reps > 86400)) {
      Alert.alert('Datos incompletos', timed ? 'Ingresa una duración válida en segundos y revisa la carga.' : 'Ingresa repeticiones válidas y revisa la carga.');
      return;
    }

    completingSetsRef.current.add(setKey);
    try {
      const next = { ...completedSets, [setKey]: true };
      setCompletedSets(next);
      if (routine && nextWorkoutSet(routine, next) && !(ownerExercise && prescription && continuesDropBlock(ownerExercise, prescription.id))) startRestTimer(next);
      else {
        if (restRef.current) clearInterval(restRef.current);
        restEndsAtMsRef.current = null;
        setIsResting(false); setRestRemaining(0);
        void updateCurrentActiveWorkout((draft) => ({ ...draft, completedSets: next, setValues: setValuesRef.current, restEndsAtMs: undefined }), true);
      }
      if (getSensoryPreferences().motion && theme.interaction === 'set-celebration') setCelebrationRef.current?.play();
    } finally {
      completingSetsRef.current.delete(setKey);
    }
  };

  const reopenSet = (setKey: SetKey) => {
    if (!completedSets[setKey]) return;
    const next = { ...completedSets, [setKey]: false };
    setCompletedSets(next);
    void updateCurrentActiveWorkout((draft) => ({ ...draft, completedSets: next }));
    publishJointLiveProgress(next, 'training');
  };

  const syncJointCompletion = async (completion: PendingJointCompletion) => {
    setIsSyncingJointCompletion(true);
    setJointPublicationError(null);
    try {
      if (!user) throw new Error('Authentication required.');
      await queueJointWorkoutPublication(user, completion);
      await withTimeout(flushPendingJointWorkoutPublications(user), REMOTE_OPERATION_TIMEOUT_MS, 'Finish joint workout');
      const progress = (await loadJointPublicationProgress(user)).find((item) => item.workoutId === completion.workoutId);
      if (progress?.error) throw new Error(progress.error);
      setJointPublicationWaiting(progress?.state === 'waiting');
      setPendingJointCompletion(null);
    } catch (error) {
      setJointPublicationError(error instanceof Error ? error.message : 'Inténtalo nuevamente.');
    } finally {
      setIsSyncingJointCompletion(false);
    }
  };

  const finishWorkout = async (jointVisibility?: JointVisibility) => {
    if (!routine || finishInFlightRef.current) return;
    finishInFlightRef.current = true;
    setIsFinishing(true);

    if (elapsedRef.current) clearInterval(elapsedRef.current);
    if (restRef.current) clearInterval(restRef.current);
    restRef.current = null;

    const exercises: CompletedExercise[] = routine.exercises.map((exercise) => ({
      exerciseId: exercise.id,
      catalogExerciseId: exercise.catalogExerciseId,
      name: exercise.name,
      sets: exercise.sets.map((set): CompletedSet => {
        const key = `${exercise.id}-${set.id}`;
        const runtime = setValuesRef.current[key];
        return {
          setId: set.id,
          weight: setLoadBasis(exercise, set) === 'bodyweight' ? 0 : Number((runtime?.weight ?? String(set.weight)).replace(',', '.')) || 0,
          ...(set.durationSeconds !== undefined ? { durationSeconds: Number(runtime?.durationSeconds ?? set.durationSeconds) || 0 } : {}),
          reps: set.durationSeconds !== undefined ? 0 : Number(runtime?.reps ?? set.reps) || 0,
          completed: !!completedSets[key],
          ...(completedSets[key] && runtime?.actualEffort ? { actualEffort: runtime.actualEffort } : {}),
        };
      }),
    }));

    let dispatched = false;
    const wasAmbiguous = ambiguousFinalizationRef.current;
    try {
      if (!user) throw new Error('Authentication required.');
      const canonicalGroup = (!offlineWorkoutEnabled || activeWorkoutDraftRef.current?.transportMode === 'online') && !attemptRef.current && attemptIdRef.current ? await withTimeout(resolveJointWorkoutAttempt(attemptIdRef.current), REMOTE_OPERATION_TIMEOUT_MS, 'Joint workout finalization association') : null;
      const completionGroup = attemptRef.current?.jointWorkoutId ?? canonicalGroup ?? jointWorkoutId;
      const attempt = attemptRef.current ?? createWorkoutAttempt({
        id: attemptIdRef.current ?? (attemptIdRef.current = generateId()),
        owner: user,
        routine,
        completedAt: new Date().toISOString(),
        durationSeconds: elapsed,
        restTimerSeconds: restTimerConfig,
        lineage,
        jointWorkoutId: completionGroup ?? undefined,
        results: Object.fromEntries(exercises.flatMap((exercise) => exercise.sets.map((set) =>
          [`${exercise.exerciseId}:${set.setId}`, { performed: set.completed, reps: set.reps, durationSeconds: set.durationSeconds, load: set.weight, actualEffort: set.actualEffort }]))),
      });
      attemptRef.current = attempt;
      let jointCompletion: PendingJointCompletion | null = null;
      if (completionGroup) {
        const sharePayload = pendingFinalizationRef.current?.sharePayload ?? recapSharePayload(
          attemptToSession(attempt),
          routine,
          lineage ? mesocycles.find((mesocycle) => mesocycle.id === lineage.mesocycleId) : undefined,
          routines,
          { shareRoutineTemplate: true, shareMesocycleTemplate: true, sharePerformedSetDetails: true },
        );
        jointCompletion = {
          attemptId: attempt.id,
          workoutId: completionGroup,
          visibility: pendingFinalizationRef.current?.jointVisibility ?? jointVisibility ?? 'circle',
          completedWorkout: completedJointWorkoutInput(routine, attempt.durationSeconds, attemptToSession(attempt).exercises, sharePayload),
        };
        await prepareJointWorkoutPublication(user, jointCompletion);
      }
      setFinalizationLocked(true);
      const pendingFinalization = { attempt, ...(jointCompletion ? { sharePayload: jointCompletion.completedWorkout.sharePayload, jointVisibility: jointCompletion.visibility } : {}) };
      if (activeWorkoutDraftRef.current) {
        await updateCurrentActiveWorkout((draft) => ({ ...draft, ...(completionGroup ? { jointWorkoutId: completionGroup } : {}), pendingFinalization }));
        pendingFinalizationRef.current = pendingFinalization;
      } else if (!wasAmbiguous || !pendingFinalizationRef.current) {
        throw new Error('No hay un borrador activo para guardar el resultado.');
      }
      // A late successful request can already have cleared the durable draft.
      // Reconcile that captured ID without resurrecting a finalized draft.
      // attemptRef and the prepared command survive an ambiguous timeout. A retry
      // reuses the attempt ID, while only a persisted attempt can make the command publishable.
      dispatched = true;
      const finalized = await withTimeout(addAttempt(attempt), REMOTE_OPERATION_TIMEOUT_MS, 'Save workout');
      void closeWorkoutStartActivity().catch(() => undefined);
      // Planned-session reconciliation may return an already finalized canonical ID.
      if (finalized.attempt?.id) attemptRef.current = finalized.attempt;
      setRewardReceipt(finalized.receipt);
      setExperienceReceipt(finalized.experienceReceipt);
      setEarnedGems(receiptTotal(finalized.receipt));
      if (getSensoryPreferences().haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setPhase('done');
      if (jointCompletion) {
        setPendingJointCompletion(jointCompletion);
        await syncJointCompletion(jointCompletion);
      }
    } catch (error) {
      if (!wasAmbiguous && (!dispatched || isDefinitelyRejectedFinalization(error))) {
        try {
          await updateCurrentActiveWorkout((draft) => ({ ...draft, pendingFinalization: undefined }), false, true);
          attemptRef.current = null;
          pendingFinalizationRef.current = undefined;
          setFinalizationLocked(false);
          elapsedRef.current = setInterval(() => reconcileElapsedRef.current(), 1000);
        } catch {
          ambiguousFinalizationRef.current = true;
          setFinalizationLocked(true);
        }
      } else {
        ambiguousFinalizationRef.current = true;
        setFinalizationLocked(true);
      }
      console.error('Training finalization failed', error);
      const failure = classifyTrainingFinalizationError(error);
      Alert.alert(
        failure.title,
        failure.body,
      );
    } finally {
      finishInFlightRef.current = false;
      setIsFinishing(false);
    }
  };

  const updateSessionSets = (
    exerciseId: string,
    updater: Parameters<typeof updateSessionExerciseSets>[3],
    patchSetValues: (values: Record<SetKey, SetRuntimeValues>) => Record<SetKey, SetRuntimeValues> = (values) => values,
  ) => {
    if (!routine) return;
    const next = updateSessionExerciseSets(routine, exerciseId, completedSets, updater, generateId);
    if (next === routine) return;
    const merged = patchSetValues(reconcileSessionSetValues(next, setValues));
    applySetValues(merged);
    persistWorkoutRoutine(next, merged);
  };

  const updateActualEffort = (setKey: string, actualEffort: SetRuntimeValues['actualEffort']) => {
    if (completedSets[setKey] || finalizationLocked || isFinishing) return;
    const next = { ...setValuesRef.current, [setKey]: { ...setValuesRef.current[setKey], actualEffort } };
    applySetValues(next);
    void commitSetValues(next).catch((error) => Alert.alert('No se pudo guardar el esfuerzo', error instanceof Error ? error.message : 'Inténtalo nuevamente.'));
  };

  const updateSessionSetType = (exerciseId: string, setId: string, type: 'C' | 'effective' | 'F') => {
    const setKey = `${exerciseId}-${setId}`;
    updateSessionSets(
      exerciseId,
      (sets) => withSessionSetType(sets, setId, type),
      (values) => type === 'F' ? { ...values, [setKey]: { ...values[setKey], reps: '0' } } : values,
    );
  };

  const removeSessionSet = (exerciseId: string, setId: string) => {
    updateSessionSets(exerciseId, (sets) => sets.length > 1 ? sets.filter((set) => set.id !== setId) : [...sets]);
  };

  const addSessionBackoff = (exerciseId: string) => {
    const groupId = generateId();
    const firstId = generateId();
    const secondId = generateId();
    updateSessionSets(exerciseId, (sets) => {
      const source = sets.at(-1) ?? { tipo: nextEffectiveSessionSetNumber(sets), weight: 0, reps: 0 };
      const firstSetNumber = nextEffectiveSessionSetNumber(sets);
      const build = (id: string, offset: number) => ({
        ...source,
        id,
        tipo: firstSetNumber + offset,
        backoffGroupId: groupId,
      });
      return [...sets, build(firstId, 0), build(secondId, 1)];
    });
  };

  if (!routine) {
    return <ThemeBackground calm><SafeAreaView style={[styles.safe, styles.center]}><GlassCard style={styles.doneCard}><Text style={[styles.doneTitle, { color: theme.text }]}>Entrenamiento no disponible</Text><Text style={[styles.doneMeta, { color: theme.textMuted }]}>Este entrenamiento ya no está disponible. Volvé a Entrenar para elegir una rutina vigente.</Text><View style={styles.spacer} /><GlassButton title="Volver a entrenar" onPress={() => router.replace('/(tabs)/train')} /></GlassCard></SafeAreaView></ThemeBackground>;
  }

  if (!lineageValidation.valid && !pendingFinalizationRef.current && !localRecovery) {
    const message = lineageValidation.reason === 'expired-planned-session'
      ? 'La fecha programada para esta sesión ya pasó.'
      : lineageValidation.reason === 'inactive-mesocycle'
      ? 'Este mesociclo ya no está activo. Actualizá o reabrí el mesociclo antes de entrenar esta sesión.'
      : lineageValidation.reason === 'non-executable-planned-session'
      ? 'Esta sesión está omitida, reprogramada o cancelada y no se puede ejecutar.'
      : 'La sesión programada ya no está disponible. Actualizá o reabrí el mesociclo antes de entrenar.';
    return <ThemeBackground calm><SafeAreaView style={[styles.safe, styles.center]}><GlassCard style={styles.doneCard}><Text style={[styles.doneTitle, { color: theme.text }]}>Sesión desactualizada</Text><Text style={[styles.doneMeta, { color: theme.textMuted }]}>{message}</Text><View style={styles.spacer} /><GlassButton title={lineageValidation.mesocycleId ? 'Volver al mesociclo' : 'Volver a rutinas'} onPress={() => lineageValidation.mesocycleId ? router.replace(`/mesocycle/summary/${lineageValidation.mesocycleId}`) : router.replace('/(tabs)/routines')} /></GlassCard></SafeAreaView></ThemeBackground>;
  }

  if (offlineResumeRequired) return <ThemeBackground><SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}><Text style={{ color: theme.text }}>Este entrenamiento lleva más de cinco horas. Tus datos se conservaron en el dispositivo.</Text><GlassButton title="Continuar entrenamiento guardado" onPress={() => setOfflineResumeConfirmed(true)} /></SafeAreaView></ThemeBackground>;

  if (phase === 'setup') {
    const hasDifferentActiveWorkout = !!activeWorkoutDraft
      && !matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: routine.id, ...(lineage ? { lineage } : {}) });
    return (
      <ThemeBackground calm>
        <SafeAreaView style={styles.safe}>
          <AppNavBar onBack={() => router.back()} backLabel="Cancelar" />
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
            <AppScreenHeader title={routine.name} subtitle="Configura el entrenamiento antes de iniciar" />
            <WorkoutGuidance phase="setup" />
            <GlassCard>
              <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900', marginBottom: 8 }}>Tu sesión, a tu ritmo</Text>
              <Text style={{ color: theme.textMuted, marginBottom: 16 }}>{routine.exercises.length} ejercicios · {routine.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)} series planificadas</Text>
              <Text style={[styles.label, { color: theme.textMuted }]}>
                Temporizador de descanso (segundos)
              </Text>
              <GlassInput
                keyboardType="numeric"
                value={restSeconds}
                onChangeText={setRestSeconds}
                placeholder="90"
              />
              {launchSeed?.restTimerSeconds !== undefined ? <Text style={{ color: theme.textMuted }}>Se usarán los últimos valores compatibles de este mesociclo. Los ajustes planificados se conservan.</Text> : null}
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Se reinicia al marcar una serie como completada. Al terminar el descanso recibirás
                una alerta para continuar.
              </Text>
            </GlassCard>
            <View style={styles.spacer} />
            <RoutineBodyMap routine={routine} />
          </ScrollView>
          <View style={styles.spacer} />
          <GlassButton
            title={hasDifferentActiveWorkout ? 'Continuar entrenamiento en curso' : 'Iniciar entrenamiento'}
            disabled={isStarting}
            onPress={() => hasDifferentActiveWorkout && activeWorkoutDraft ? continueActiveWorkout(activeWorkoutDraft) : void startWorkout()}
          />
          <WorkoutSaveIndicator visible={isStarting} color={theme.glassBorder} textColor={theme.textMuted} />
        </SafeAreaView>
      </ThemeBackground>
    );
  }

  if (phase === 'done' && attemptRef.current) {
    const savedSession = attemptToSession(attemptRef.current);
    return <ThemeBackground calm><SafeAreaView style={styles.safe}>
      <WorkoutCompletionReview key={`${user}:${savedSession.id}`} session={savedSession} experience={experienceReceipt} rewards={rewardReceipt} celebrate
        onDetails={() => router.push(`/session/recap/${savedSession.id}`)} onDone={() => router.replace('/(tabs)/train')}>
        {jointPublicationWaiting ? <GlassCard><Text style={{ color: theme.text }}>Entrenamiento guardado. La publicación del grupo espera a que todos terminen y confirmen su cierre.</Text></GlassCard> : null}
        {pendingJointCompletion ? <GlassCard><Text accessibilityRole="alert" style={{ color: theme.text }}>Entrenamiento guardado. Publicación conjunta pendiente.</Text><Text style={{ color: theme.textMuted }}>{jointPublicationError ?? 'Sincronizando el resultado conjunto…'}</Text><GlassButton title="Reintentar publicación" variant="secondary" loading={isSyncingJointCompletion} onPress={() => void syncJointCompletion(pendingJointCompletion)} /></GlassCard> : null}
      </WorkoutCompletionReview>
    </SafeAreaView></ThemeBackground>;
  }

  if (onlineWorkoutBlocked || (activeWorkoutDraft?.transportMode === 'online'
    && ['blocked', 'conflict', 'local-error'].includes(offlineWorkoutStatus))) {
    return <ThemeBackground calm><SafeAreaView style={[styles.safe, styles.center]}>
      <GlassCard style={styles.doneCard}>
        <Text style={{ color: theme.text }}>El entrenamiento compartido necesita conexión y sincronización.</Text>
        <Text style={{ color: theme.textMuted }}>{offlineWorkoutError ?? 'Tus cambios pendientes se conservan. No se sobrescribió el servidor.'}</Text>
        <GlassButton title="Volver" variant="secondary" onPress={() => router.back()} />
      </GlassCard>
    </SafeAreaView></ThemeBackground>;
  }

  if (finalizationLocked) return <ThemeBackground calm><SafeAreaView style={[styles.safe, styles.center]}><GlassCard style={styles.doneCard}>
    <Text style={[styles.doneTitle, { color: theme.text }]}>Guardado pendiente</Text>
    <Text style={{ color: theme.textMuted }}>El resultado está pendiente de confirmación. Reintentá guardarlo antes de modificar o cancelar el entrenamiento.</Text>
    <GlassButton title="Reintentar guardado" disabled={isFinishing} onPress={() => void finishWorkout()} />
    <WorkoutSaveIndicator visible={isFinishing} color={theme.glassBorder} textColor={theme.textMuted} />
    <GlassButton title="Volver" variant="secondary" disabled={isFinishing} onPress={() => router.back()} />
  </GlassCard></SafeAreaView></ThemeBackground>;

  const totalSets = routine.exercises.reduce((acc, e) => acc + e.sets.length, 0);
  const doneSets = routine.exercises.reduce((total, exercise) => total + exercise.sets.filter((set) => completedSets[`${exercise.id}-${set.id}`]).length, 0);
  const nextSet = nextWorkoutSet(routine, completedSets);
  const nextExercise = routine.exercises.find((exercise) => exercise.id === nextSet?.exerciseId);
  const nextLabel = nextExercise && nextSet ? routineSetLabels(nextExercise.sets)[nextSet.setId] : '';
  const requestFinish = () => {
    if (jointCancellationStartedRef.current || jointCancellationInFlightRef.current || isFinishing) return;
    setFinishMenuVisible(true);
  };
  const changeRest = (seconds: number) => {
    const restEndsAtMs = Date.now() + seconds * 1000;
    if (seconds <= 0) { handleRestComplete(); void updateCurrentActiveWorkout((draft) => ({ ...draft, restEndsAtMs: undefined })); return; }
    restEndsAtMsRef.current = restEndsAtMs; setRestRemaining(seconds);
    void updateCurrentActiveWorkout((draft) => ({ ...draft, restEndsAtMs })); startRestCountdown(restEndsAtMs);
  };
  const jointInviteLimit = jointWorkoutId ? jointParticipantInviteCapacity(jointTargets) : 3;
  const selectedJointInviteCount = selectedJointInviteIds.length;
  const selectedJointInviteMembers = selectedJointInviteIds.reduce((count, id) => count + (jointInviteCandidates.find((candidate) => candidate.id === id)?.groupMemberCount ?? 1), 0);
  const positionMenuExercise = routine.exercises.find((exercise) => exercise.id === positionMenuExerciseId);
  const positionMenuExerciseIndex = positionMenuExercise ? routine.exercises.indexOf(positionMenuExercise) : -1;

  return (
      <ThemeBackground calm>
      <SafeAreaView style={styles.safe}>
        <Animated.View pointerEvents={workoutControlsVisible ? 'auto' : 'none'} style={[styles.floatingWorkoutControls, floatingWorkoutControlsStyle]}>
          <GlassCard style={styles.workoutControlsGlass} noPadding>
            <View style={styles.fixedWorkoutControls}>
            <View style={styles.fixedTimerMetric}>
              <Ionicons name="time-outline" size={16} color={theme.primary} />
              <Text style={[styles.fixedTimerValue, { color: theme.text }]}>{formatTime(elapsed)}</Text>
            </View>
            <View style={[styles.fixedControlDivider, { backgroundColor: theme.glassBorder }]} />
            <View style={styles.fixedTimerMetric}>
              <Ionicons name="hourglass-outline" size={16} color={isResting ? theme.accent : theme.textMuted} />
              <Text style={[styles.fixedTimerValue, { color: isResting ? theme.accent : theme.textMuted }]}>{isResting ? formatTime(restRemaining) : formatTime(restTimerConfig)}</Text>
            </View>
            {!finishMenuVisible ? <HapticPressable accessibilityLabel="Finalizar sesión" accessibilityState={{ disabled: isFinishing }} disabled={isFinishing} onPress={() => requestFinish()} style={{ minWidth: 56, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2 }}><Ionicons name="checkmark-circle-outline" size={24} color={theme.primary} /><Text style={{ color: theme.text, fontSize: 10, fontWeight: '800' }}>Finalizar</Text></HapticPressable> : null}
            </View>
          </GlassCard>
          {offlineWorkoutEnabled || offlineWorkoutError ? <View style={{ padding: 8, gap: 4 }}>
            <Text accessibilityLiveRegion="polite" style={{ color: theme.textMuted }}>{offlineWorkoutStatus === 'unavailable' ? 'Guardado offline no disponible' : pendingSaveCount > 0 ? 'Guardando en este dispositivo…' : offlineWorkoutStatus === 'saved' ? 'Guardado en este dispositivo y sincronizado' : offlineWorkoutStatus === 'syncing' ? 'Sincronizando entrenamiento…' : offlineWorkoutStatus === 'local-error' ? 'Cambios sin guardar: no cierres la app' : offlineWorkoutStatus === 'conflict' ? 'Conflicto: tus datos locales se conservan' : offlineWorkoutStatus === 'blocked' ? 'Sincronización bloqueada: tus datos se conservan' : 'Guardado en este dispositivo · Pendiente de sincronización'}</Text>
            {offlineWorkoutError ? <Text accessibilityRole="alert" style={{ color: theme.textMuted }}>{offlineWorkoutError}</Text> : null}
          </View> : null}
          <WorkoutSaveIndicator visible={pendingSaveCount > 0 || isJointBusy} color={theme.glassBorder} textColor={theme.textMuted} />
        </Animated.View>
        <FlatList
            data={focusMode && nextSet ? routine.exercises.filter((exercise) => exercise.id === nextSet.exerciseId) : routine.exercises}
            keyExtractor={(exercise) => exercise.id}
            extraData={{ exerciseDisclosure, completedSets, setValues, focusMode }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            style={styles.exerciseList}
            contentContainerStyle={styles.exerciseListContent}
            onScroll={handleExerciseScroll}
            scrollEventThrottle={16}
            ListHeaderComponent={<View style={{ gap: 12, marginBottom: 16 }}>
              <WorkoutGuidance phase="active" hasSavedSet={doneSets > 0 && pendingSaveCount === 0 && !offlineWorkoutError} />
              <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: '900' }}>{routine.name}</Text>
              <Text style={{ color: theme.textMuted }}>{doneSets}/{totalSets} series realizadas{nextSet ? ` · Sigue: ${nextSet.exerciseName}, serie ${nextLabel}` : ' · Puedes finalizar la sesión'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <GlassButton title={focusMode ? 'Ver rutina completa' : 'Enfocar serie actual'} variant="secondary" onPress={() => { void commitSetValues().catch(() => undefined); setFocusMode(!focusMode); }} />
                {!focusMode && <GlassButton title={routine.exercises.every((exercise) => exerciseDisclosure[exercise.id] ?? exercise.id === nextSet?.exerciseId) ? 'Ocultar ejercicios' : 'Desplegar ejercicios'} variant="secondary" onPress={() => { void commitSetValues().catch(() => undefined); const expanded = !routine.exercises.every((exercise) => exerciseDisclosure[exercise.id] ?? exercise.id === nextSet?.exerciseId); setExerciseDisclosure(Object.fromEntries(routine.exercises.map((exercise) => [exercise.id, expanded]))); }} />}
              </View>
              {isResting ? <GlassCard blur={false}><Text accessibilityRole="header" style={{ color: theme.accent, fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{formatTime(restRemaining)} · Descanso</Text><Text style={{ color: theme.textMuted }}>{nextSet ? `Después: ${nextSet.exerciseName}, serie ${nextLabel}` : 'Terminaste las series'}</Text><View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}><GlassButton title="+30 s" variant="secondary" onPress={() => changeRest(restRemaining + 30)} /><GlassButton title="Omitir descanso" variant="secondary" onPress={() => changeRest(0)} /></View></GlassCard> : null}
            </View>}
            ListFooterComponent={<GlassCard style={styles.addExerciseCard}>
             <HapticPressable
               accessibilityRole="button"
               accessibilityLabel="Agregar ejercicio"
               onPress={() => setPickerVisible(true)}
               style={styles.addExerciseHeader}
             >
               <Text style={[styles.addExerciseTitle, { color: theme.text }]}>Agregar ejercicio</Text>
               <Text style={[styles.addExerciseChevron, { color: theme.textMuted }]}>⌄</Text>
             </HapticPressable>
           </GlassCard>}
            renderItem={({ item: exercise, index: exIndex }) => <>
            <WorkoutExerciseCard
                name={exercise.name || 'Sin nombre'}
                position={routine.exercises.findIndex((candidate) => candidate.id === exercise.id) + 1}
                completed={exercise.sets.filter((set) => completedSets[`${exercise.id}-${set.id}`]).length}
                total={exercise.sets.length}
                current={exercise.id === nextSet?.exerciseId}
                expanded={focusMode || (exerciseDisclosure[exercise.id] ?? exercise.id === nextSet?.exerciseId)}
                onToggle={() => { void commitSetValues().catch(() => undefined); if (focusMode) setFocusMode(false); setExerciseDisclosure((current) => ({ ...current, [exercise.id]: !(focusMode || (current[exercise.id] ?? exercise.id === nextSet?.exerciseId)) })); }}
            >
                {(() => {
                  const exerciseStarted = hasCompletedSessionExerciseSet(exercise, completedSets);
                  const structuralLockHint = 'No se puede modificar un ejercicio iniciado';
                  return <View style={styles.exerciseOrderActions}>
                   <HapticPressable
                     accessibilityRole="button"
                     accessibilityLabel={`Cambiar posición de ${exercise.name}`}
                    accessibilityHint={exerciseStarted ? structuralLockHint : 'Abre las posiciones disponibles para este ejercicio solo en este entrenamiento'}
                    accessibilityState={{ disabled: exerciseStarted }}
                    disabled={exerciseStarted}
                    onPress={() => {
                      if (!hasCompletedSessionExerciseSet(exercise, completedSets)) setPositionMenuExerciseId(exercise.id);
                    }}
                    style={[styles.exerciseOrderButton, { borderColor: theme.glassBorder, opacity: exerciseStarted ? 0.45 : 1 }]}
                   >
                     <Ionicons name="swap-vertical-outline" size={17} color={theme.textMuted} />
                     <Text style={[styles.exerciseOrderButtonText, { color: theme.textMuted }]}>Cambiar posición</Text>
                   </HapticPressable>
                   <HapticPressable
                     accessibilityRole="button"
                     accessibilityLabel={`Eliminar ${exercise.name} del entrenamiento actual`}
                     accessibilityHint={exerciseStarted ? structuralLockHint : 'Elimina este ejercicio solo del entrenamiento actual'}
                     accessibilityState={{ disabled: exerciseStarted }}
                     disabled={exerciseStarted}
                     onPress={() => confirmDeleteSessionExercise(exercise.id)}
                     style={[styles.removeExerciseButton, { borderColor: theme.glassBorder, opacity: exerciseStarted ? 0.45 : 1 }]}
                   >
                     <Ionicons name="trash-outline" size={19} color="#EF4444" />
                   </HapticPressable>
                 </View>;
                })()}

                {exercise.sets.map((set, setIndex) => {
                  if (focusMode && nextSet && set.id !== nextSet.setId) return null;
                 const setKey = `${exercise.id}-${set.id}`;
                  const completed = !!completedSets[setKey];
                  const values = setValues[setKey] ?? { weight: '', reps: '' };
                  if (completed) {
                    const basis = setLoadBasis(exercise, set);
                    const amount = set.durationSeconds !== undefined ? `${values.durationSeconds ?? set.durationSeconds} s` : `${values.reps || set.reps} reps`;
                    const load = basis === 'bodyweight' ? 'Peso corporal' : `${basis === 'added' ? 'Lastre ' : basis === 'assisted' ? 'Asistencia ' : ''}${values.weight || set.weight} ${exercise.loadUnit ?? 'kg'}`;
                    return <View key={set.id} style={[styles.completedSummary, { borderColor: theme.glassBorder }]}>
                      <Ionicons name="checkmark-circle" color={theme.success} size={21} />
                      <View style={{ flex: 1, gap: 4 }}><Text style={{ color: theme.text, fontWeight: '700' }}>{routineSetLabels(exercise.sets)[set.id]} · {amount} · {load}</Text><Text style={{ color: theme.textMuted }}>{values.actualEffort ? `${values.actualEffort.kind.toUpperCase()} ${values.actualEffort.value} realizado` : 'Esfuerzo sin registrar'}{set.dropGroupId ? ' · Drop set' : set.backoffGroupId ? ' · Backoff' : ''}</Text></View>
                      <HapticPressable accessibilityLabel={`Editar serie ${routineSetLabels(exercise.sets)[set.id]} de ${exercise.name}`} accessibilityHint={`Reabrir serie de ${exercise.name}`} onPress={() => reopenSet(setKey)} style={styles.summaryEdit}><Text style={{ color: theme.primary, fontWeight: '700' }}>Editar</Text></HapticPressable>
                    </View>;
                  }
                  const isBackoff = !!set.backoffGroupId;
                  const firstInBackoff = isBackoff && (setIndex === 0 || exercise.sets[setIndex - 1]?.backoffGroupId !== set.backoffGroupId);
                  const lastInBackoff = isBackoff && (setIndex === exercise.sets.length - 1 || exercise.sets[setIndex + 1]?.backoffGroupId !== set.backoffGroupId);
                  const subseries = isBackoff ? exercise.sets.slice(0, setIndex + 1).filter((candidate) => candidate.backoffGroupId === set.backoffGroupId).length : 0;
                  const backoffCount = isBackoff ? exercise.sets.filter((candidate) => candidate.backoffGroupId === set.backoffGroupId).length : 0;

                  return (
                    <View
                      key={set.id}
                      style={[
                        styles.setCard,
                        isBackoff && styles.backoffSetCard,
                        firstInBackoff && styles.backoffStart,
                        lastInBackoff && styles.backoffEnd,
                        isFailureSet(set.tipo) && styles.failureSetCard,
                        {
                        borderColor: completed ? theme.success : nextSet?.setId === set.id && nextSet.exerciseId === exercise.id ? theme.primary : isFailureSet(set.tipo) ? '#EF4444' : theme.glassBorder,
                        backgroundColor: completed ? `${theme.glass}` : 'rgba(0,0,0,0.15)',
                      },
                    ]}
                  >
                    <View style={styles.setCardHeader}>
                       <Text style={[styles.setTypeHint, { color: isFailureSet(set.tipo) ? '#EF4444' : theme.textMuted }]}>
                         {set.dropGroupId ? `${routineSetLabels(exercise.sets)[set.id]} · Drop set` : isBackoff ? `Serie ${routineSetLabels(exercise.sets)[set.id]} · Backoff` : isFailureSet(set.tipo) ? 'Al fallo' : set.tipo === 'C' ? 'Calentamiento' : `Serie ${routineSetLabels(exercise.sets)[set.id]}`}
                       </Text>
                       <View style={styles.setHeaderActions}>
                       {completed ? (
                         <View style={[styles.completedBadge, { backgroundColor: theme.success }]}>
                           <Text style={styles.completedBadgeText}>✓ Hecha</Text>
                         </View>
                       ) : <HapticPressable
                         accessibilityRole="button"
                         accessibilityLabel={`Quitar serie ${setIndex + 1} de ${exercise.name}`}
                         accessibilityHint="Elimina esta serie del entrenamiento actual"
                         accessibilityState={{ disabled: exercise.sets.length <= 1 }}
                         disabled={exercise.sets.length <= 1}
                         onPress={() => removeSessionSet(exercise.id, set.id)}
                         style={[styles.removeSetButton, { borderColor: theme.glassBorder, opacity: exercise.sets.length <= 1 ? 0.45 : 1 }]}
                       ><Ionicons name="trash-outline" size={18} color={theme.textMuted} /></HapticPressable>}
                       </View>
                     </View>

                    <SetTypeControl
                      value={set.tipo}
                      disabled={completed}
                      onChange={(type) => updateSessionSetType(exercise.id, set.id, type)}
                    />

                    <View style={styles.inputRow}>
                      <View style={styles.inputGroup}>
                        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
                          {setLoadBasis(exercise, set) === 'bodyweight' ? 'Peso corporal · sin carga adicional' : setLoadBasis(exercise, set) === 'added' ? 'Lastre' : setLoadBasis(exercise, set) === 'assisted' ? 'Asistencia' : 'Carga externa'} ({exercise.loadUnit ?? 'kg'})
                        </Text>
                        <GlassInput
                          accessibilityLabel={`${exercise.name}, serie ${setIndex + 1}, carga en ${exercise.loadUnit ?? 'kg'}`}
                          style={styles.setInput}
                          keyboardType="decimal-pad"
                          value={setLoadBasis(exercise, set) === 'bodyweight' ? '—' : values.weight}
                          editable={!completed && setLoadBasis(exercise, set) !== 'bodyweight'}
                          placeholder="0"
                          onChangeText={(text) => updateSetValue(setKey, 'weight', text)}
                          onBlur={() => { void commitSetValues(); }}
                          onSubmitEditing={() => { void commitSetValues(); }}
                        />
                      </View>
                      {set.durationSeconds !== undefined ? <View style={styles.inputGroup}><Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Duración (segundos)</Text><GlassInput accessibilityLabel={`${exercise.name}, duración en segundos`} style={styles.setInput} keyboardType="number-pad" value={values.durationSeconds ?? ''} editable={!completed} onChangeText={(text) => updateSetValue(setKey, 'durationSeconds', text)} onBlur={() => { void commitSetValues(); }} /></View> : isFailureSet(set.tipo) ? (
                        <View style={styles.inputGroup}>
                          <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Repeticiones al fallo</Text>
                          <GlassInput style={styles.setInput} keyboardType="number-pad" value={values.reps}
                            editable={!completed} placeholder="0"
                            onChangeText={(text) => updateSetValue(setKey, 'reps', text)}
                            onBlur={() => { void commitSetValues(); }}
                            onSubmitEditing={() => { void commitSetValues(); }} />
                        </View>
                      ) : (
                        <View style={styles.inputGroup}>
                          <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Repeticiones</Text>
                          <GlassInput
                            accessibilityLabel={`${exercise.name}, serie ${setIndex + 1}, repeticiones`}
                            style={styles.setInput}
                            keyboardType="number-pad"
                            value={values.reps}
                            editable={!completed}
                            placeholder="0"
                            onChangeText={(text) => updateSetValue(setKey, 'reps', text)}
                            onBlur={() => { void commitSetValues(); }}
                            onSubmitEditing={() => { void commitSetValues(); }}
                          />
                        </View>
                      )}
                    </View>

                    {previousPerformance[setKey] ? <Text style={{ color: theme.textMuted }}>
                      Anterior: {previousPerformance[setKey].durationSeconds !== undefined ? `${previousPerformance[setKey].durationSeconds} s` : `${previousPerformance[setKey].weight} ${previousPerformance[setKey].unit} × ${previousPerformance[setKey].reps}`}
                      {previousPerformance[setKey].actualEffort ? ` · ${previousPerformance[setKey].actualEffort!.kind.toUpperCase()} ${previousPerformance[setKey].actualEffort!.value}` : ' · Esfuerzo sin registrar'}
                    </Text> : null}
                    {set.effortTarget ? <Text style={{ color: theme.textMuted }}>Objetivo de la rutina: {set.effortTarget.kind.toUpperCase()} {set.effortTarget.value}</Text> : null}
                    <EffortTargetControl actual
                      value={setValues[setKey]?.actualEffort}
                      disabled={completed}
                      onChange={(actualEffort) => updateActualEffort(setKey, actualEffort)}
                    />

                    {completed ? (
                      <HapticPressable
                        accessibilityRole="button"
                        accessibilityLabel={`Editar ${getSetTypeLabel(set.tipo)}`}
                        accessibilityHint="Reabre la serie para corregir carga o repeticiones"
                        onPress={() => reopenSet(setKey)}
                        style={[styles.editSetBtn, { borderColor: theme.success }]}
                      >
                        <Text style={[styles.editSetBtnText, { color: theme.text }]}>Editar serie</Text>
                      </HapticPressable>
                    ) : (
                      <HapticPressable
                        accessibilityRole="button"
                        accessibilityLabel={`Finalizar serie ${setIndex + 1} de ${exercise.name}`}
                        accessibilityHint="Confirma esta serie con los valores visibles en un toque"
                        onPress={() => completeSet(setKey, set.tipo)}
                        style={({ pressed }) => [styles.completeBtn, { backgroundColor: theme.primary }, pressed && styles.completeBtnPressed]}
                      >
                        <Text style={styles.completeBtnText}>Finalizar serie</Text>
                      </HapticPressable>
                    )}
                  </View>
                );
               })}
                <View style={styles.sessionAddActions}>
                 <HapticPressable accessibilityLabel={`Agregar serie a ${exercise.name}`} onPress={() => updateSessionSets(exercise.id, (sets) => [...sets, { id: generateId(), tipo: nextEffectiveSessionSetNumber(sets), weight: 0, reps: 0 }])} style={[styles.editSetBtn, { borderColor: theme.glassBorder }]}>
                   <Text style={[styles.editSetBtnText, { color: theme.primary }]}>+ Serie</Text>
                 </HapticPressable>
                 <HapticPressable accessibilityLabel={`Agregar backoff a ${exercise.name}`} onPress={() => addSessionBackoff(exercise.id)} style={[styles.editSetBtn, { borderColor: theme.glassBorder }]}>
                   <Text style={[styles.editSetBtnText, { color: theme.primary }]}>+ Backoff</Text>
                 </HapticPressable>
                </View>
            </WorkoutExerciseCard>
             </>}
         />
        <View style={styles.socialHubDock}>
          <GlassCard style={styles.socialHubGlass} noPadding>
            <View style={styles.socialHubContent}>
              <JointWorkoutLiveRoster workoutId={jointWorkoutId ?? undefined} participants={jointTargets} availableCandidates={jointInviteCandidates} expanded={isJointExpanded} onToggle={toggleJointHeader} />
              {isJointExpanded ? <View style={[styles.jointHeaderPanel, { borderTopColor: theme.glassBorder }]}>
            {jointInviteCandidates.length ? <View style={styles.jointInviteList}>
              <Text style={{ color: theme.textMuted }}>Entrenando en tu círculo</Text>
              {jointInviteCandidates.map((profile) => {
                const recipientTheme = getShopTheme(profile.themeId ?? '') ?? getShopTheme('profile-rodaja')!;
                const selected = selectedJointInviteIds.includes(profile.id);
                const selectionFull = !selected && selectedJointInviteMembers + profile.groupMemberCount > jointInviteLimit;
                return <Pressable key={profile.id} accessibilityRole="checkbox" accessibilityLabel={`Invitar a ${profile.alias}`} accessibilityState={{ selected, disabled: isJointBusy || selectionFull }} disabled={isJointBusy || selectionFull} onPress={() => toggleJointInviteCandidate(profile.id)}><GlassCard style={[styles.jointInviteMember, selected && styles.jointInviteMemberSelected]}><LinearGradient colors={[recipientTheme.primary, recipientTheme.accent, recipientTheme.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.jointInviteBanner}><ProfileAvatar avatarId={profile.avatarId} frameId={profile.frameId} size={40} borderColor="rgba(255,255,255,0.7)" /><View style={styles.jointInviteCopy}><Text style={styles.jointInviteAlias}>{profile.alias}</Text><ProfileTitleBadge titleId={profile.titleId} /><Text style={styles.jointInviteRelationship}>{profile.groupMemberCount === 1 ? `${profile.relationshipKind === 'partner' ? 'GymCrush' : 'Bro'} · entrenando ahora` : `Grupo de ${profile.groupMemberCount} entrenando ahora`}</Text></View>{selected ? <View style={styles.jointInviteSelectedBadge}><Text style={styles.jointInviteSelectedBadgeText}>Seleccionado</Text></View> : null}</LinearGradient></GlassCard></Pressable>;
              })}
              <View style={styles.jointInviteAction}><Text style={[styles.jointInviteCount, { color: theme.textMuted }]}>{selectedJointInviteCount ? `${selectedJointInviteCount} invitación${selectedJointInviteCount === 1 ? '' : 'es'} · ${selectedJointInviteMembers} persona${selectedJointInviteMembers === 1 ? '' : 's'} se sumarán` : 'Elegí a quién invitar'}</Text><GlassButton title={`Invitar a ${selectedJointInviteCount} ${selectedJointInviteCount === 1 ? 'persona' : 'personas'}`} disabled={isJointBusy || !selectedJointInviteCount} onPress={() => void inviteSelectedToJointWorkout()} /></View>
            </View> : <Text style={[styles.jointHeaderEmpty, { color: theme.textMuted }]}>{isJointBusy ? 'Actualizando personas activas...' : 'Nadie de tu círculo está entrenando ahora.'}</Text>}
          </View> : null}
            </View>
          </GlassCard>
        </View>

        {positionMenuExercise ? <Modal
          transparent
          animationType="fade"
          visible
          onRequestClose={() => setPositionMenuExerciseId(null)}
        >
          <View style={styles.finishMenuBackdrop}>
            <GlassCard style={[styles.positionMenu, { borderColor: theme.glassBorder, backgroundColor: theme.tabBarBackground }]}>
              <Text style={[styles.finishMenuTitle, { color: theme.text }]}>Cambiar posición</Text>
              <Text style={[styles.finishMenuCopy, { color: theme.textMuted }]}>Elegí dónde va {positionMenuExercise?.name ?? 'este ejercicio'} en este entrenamiento. No cambia tu rutina guardada.</Text>
              {routine.exercises.map((exercise, index) => {
                const isCurrentPosition = index === positionMenuExerciseIndex;
                return <HapticPressable
                  key={exercise.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Mover ${positionMenuExercise?.name ?? 'ejercicio'} a la posición ${index + 1}, ${exercise.name}`}
                  accessibilityState={{ disabled: isCurrentPosition }}
                  disabled={isCurrentPosition}
                  onPress={() => {
                    if (positionMenuExercise) moveSessionExercise(positionMenuExercise.id, index);
                    setPositionMenuExerciseId(null);
                  }}
                  style={[styles.positionOption, { borderColor: theme.glassBorder, opacity: isCurrentPosition ? 0.5 : 1 }]}
                >
                  <Text style={[styles.positionOptionText, { color: theme.text }]}>{index + 1}. {exercise.name}</Text>
                  {isCurrentPosition ? <Text style={[styles.positionCurrentText, { color: theme.textMuted }]}>Posición actual</Text> : null}
                </HapticPressable>;
              })}
              <GlassButton title="Cancelar" variant="secondary" onPress={() => setPositionMenuExerciseId(null)} />
            </GlassCard>
          </View>
        </Modal> : null}

        {finishMenuVisible ? <Modal
          transparent
          animationType="fade"
          visible={finishMenuVisible}
          onRequestClose={closeFinishMenu}
        >
          <View style={styles.finishMenuBackdrop}>
            <GlassCard style={[styles.finishMenu, { borderColor: theme.glassBorder, backgroundColor: theme.tabBarBackground }]}>
              <View style={styles.finishMenuTitleRow}>
                <View style={[styles.finishMenuDot, { backgroundColor: theme.accent }]} />
                <Text style={[styles.finishMenuTitle, { color: theme.text }]}>Finalizar entrenamiento</Text>
              </View>
              <Text style={[styles.finishMenuCopy, { color: theme.textMuted }]}>{doneSets}/{totalSets} series realizadas. Guardar conserva lo realizado; cancelar descarta este entrenamiento.</Text>
              {workoutSyncError ? <View style={[styles.workoutSyncError, { borderColor: theme.glassBorder }]}>
                <Text accessibilityRole="alert" style={[styles.workoutSyncErrorText, { color: theme.textMuted }]}>No se pudo sincronizar el entrenamiento. La sincronización se reintentará al volver a la app.</Text>
              </View> : null}
              <HapticPressable accessibilityRole="button" accessibilityLabel="Cerrar opciones de finalización" disabled={isFinishing || jointCancellationStatus !== 'idle'} onPress={closeFinishMenu}><Ionicons name="close" size={24} color={theme.text} /></HapticPressable>
              <GlassButton title="Guardar sesión" disabled={isFinishing || jointCancellationStatus !== 'idle'} onPress={finishFromFinishMenu} />
              <WorkoutSaveIndicator visible={isFinishing} color={theme.glassBorder} textColor={theme.textMuted} />
              <HapticPressable accessibilityRole="button" accessibilityLabel="Cancelar entrenamiento" accessibilityState={{ disabled: isFinishing || jointCancellationStatus === 'pending' }} disabled={isFinishing || jointCancellationStatus === 'pending'} onPress={() => void cancelFromFinishMenu()} style={styles.cancelWorkoutButton}>
                <Text style={styles.cancelWorkoutText}>Cancelar entrenamiento</Text>
              </HapticPressable>
            </GlassCard>
          </View>
        </Modal> : null}

        <ExercisePicker exercises={catalogExercises} routineMuscleGroups={[]} catalogMode visible={pickerVisible} onClose={() => setPickerVisible(false)} onSelect={addSessionExercise} />

      </SafeAreaView>
      {theme.interaction === 'set-celebration' ? <ExclusiveSetCelebration ref={setCelebrationRef} theme={theme} /> : null}
      {restCompletionBadgeVisible ? <RestCompletionBadge visible onDismiss={() => setRestCompletionBadgeVisible(false)} /> : null}
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 16 },
  back: { padding: 8, marginBottom: 8 },
  label: { fontSize: 13, marginBottom: 8 },
  hint: { fontSize: 12, marginTop: 10, lineHeight: 18 },
  spacer: { height: 16 },
   floatingWorkoutControls: { left: 16, position: 'absolute', right: 16, top: 8, zIndex: 2 },
   saveIndicator: { alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(8,8,14,0.74)', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, marginTop: 6, paddingHorizontal: 10, paddingVertical: 5 },
   saveIndicatorLogo: { height: 16, width: 16 },
   saveIndicatorText: { fontSize: 11, fontWeight: '800' },
   workoutControlsGlass: { borderRadius: 18 },
   fixedWorkoutControls: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
   fixedTimerMetric: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center' },
   fixedTimerValue: { fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '900' },
   fixedControlDivider: { height: 24, width: StyleSheet.hairlineWidth },
   stickyMetaRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
   stickyParticipants: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 28 },
   stickyParticipantsLabel: { fontSize: 12, fontWeight: '700' },
   jointOverflowBadge: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 28, justifyContent: 'center', minWidth: 28, paddingHorizontal: 6 },
   jointOverflowBadgeText: { fontSize: 11, fontWeight: '900' },
   jointHeaderToggle: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
    jointHeaderPanel: { borderTopWidth: 1, gap: 10, marginTop: 2, paddingTop: 10 },
   jointHeaderPanelTitle: { gap: 2 },
   jointHeaderPanelMeta: { fontSize: 12 },
   jointHeaderRoster: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
   jointHeaderEmpty: { fontSize: 12, textAlign: 'center' },
  cancelLink: { alignSelf: 'flex-end', paddingHorizontal: 4, paddingVertical: 2 },
  cancelLinkText: { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  addExerciseCard: { gap: 10, marginBottom: 12 },
  addExerciseHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 },
  addExerciseChevron: { fontSize: 22, fontWeight: '700' },
  addExerciseContent: { gap: 10 },
  addExerciseTitle: { fontSize: 16, fontWeight: '800' },
  addExerciseChangeGroup: { fontSize: 13, fontWeight: '800' },
   exerciseList: { flex: 1 },
    exerciseListContent: { paddingBottom: 104, paddingTop: 82 },
   exerciseCard: { marginBottom: 14 },
   completedSummary: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, paddingVertical: 12, marginBottom: 8 },
   summaryEdit: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
    exerciseOrderActions: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 12 },
   exerciseOrderButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8 },
    exerciseOrderButtonText: { fontSize: 12, fontWeight: '800' },
    removeExerciseButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, height: 44, justifyContent: 'center', marginLeft: 'auto', width: 44 },
  exerciseName: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 12,
  },
   setCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
   },
   failureSetCard: { borderColor: '#EF4444', borderLeftWidth: 4 },
  backoffSetCard: { borderRadius: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: 0, marginBottom: 0 },
  backoffStart: { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderTopWidth: 1, marginTop: 10 },
  backoffEnd: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14, borderBottomWidth: 1, marginBottom: 10 },
  setCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  completedBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
   setTypeHint: {
     fontSize: 12,
     fontWeight: '600',
   },
   setHeaderActions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
   removeSetButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
   sessionAddActions: { flexDirection: 'row', gap: 8 },
  completedBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputGroup: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    marginBottom: 6,
    fontWeight: '600',
  },
  setInput: {
    paddingVertical: 10,
    textAlign: 'center',
  },
  failurePlaceholder: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  completeBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  completeBtnPressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  completeBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  editSetBtn: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 12,
  },
  editSetBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
  },
  jointCard: { gap: 10, marginBottom: 12 },
  jointHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  jointToggle: { fontSize: 13, fontWeight: '800' },
  jointSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  jointTitle: { fontSize: 16, fontWeight: '800' },
  jointInviteList: { gap: 10 },
  jointInviteMember: { gap: 12, paddingVertical: 18 },
  jointInviteMemberSelected: { borderColor: '#FFFFFF', borderWidth: 2 },
  jointInviteBanner: { alignItems: 'center', borderRadius: 15, flexDirection: 'row', gap: 11, padding: 12 },
  jointInviteCopy: { flex: 1, gap: 2 },
  jointInviteAlias: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', letterSpacing: 0.1 },
  jointInviteRelationship: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '700' },
  jointInviteSelectedBadge: { backgroundColor: 'rgba(255,255,255,0.24)', borderColor: 'rgba(255,255,255,0.7)', borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  jointInviteSelectedBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  jointInviteChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  jointInviteChip: { backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  jointInviteChipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  jointInviteAction: { gap: 8, paddingTop: 2 },
  jointInviteCount: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
   jointTarget: { gap: 6 },
   socialHubDock: { bottom: 8, left: 16, position: 'absolute', right: 16, zIndex: 2 },
   socialHubGlass: { borderRadius: 18 },
   socialHubContent: { paddingHorizontal: 12, paddingVertical: 8 },
   jointActions: { flexDirection: 'row', gap: 8 },
   finishMenuBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.54)', flex: 1, justifyContent: 'center', padding: 24 },
   finishMenu: { alignSelf: 'stretch', gap: 12 },
   workoutSyncError: { borderRadius: 12, borderWidth: 1, gap: 8, padding: 10 },
   workoutSyncErrorText: { fontSize: 12, lineHeight: 17 },
    positionMenu: { alignSelf: 'stretch', gap: 10 },
    positionOption: { borderRadius: 12, borderWidth: 1, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10 },
    positionOptionText: { fontSize: 14, fontWeight: '800' },
    positionCurrentText: { fontSize: 12, marginTop: 2 },
   finishMenuTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
   finishMenuDot: { borderRadius: 6, height: 12, width: 12 },
   finishMenuTitle: { fontSize: 20, fontWeight: '900' },
   finishMenuCopy: { fontSize: 14, lineHeight: 20 },
   cancelWorkoutButton: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
   cancelWorkoutText: { color: '#EF4444', fontSize: 14, fontWeight: '800' },
  center: { justifyContent: 'center', padding: 20 },
  doneCard: { alignItems: 'center', padding: 32 },
  doneEmoji: { fontSize: 48, marginBottom: 12 },
  doneTitle: { fontSize: 22, fontWeight: '800' },
  doneMeta: { marginTop: 8, fontSize: 16 },
  doneGems: { marginTop: 6, fontSize: 15, fontWeight: '700' },
  doneXp: { fontSize: 25, fontWeight: '900' },
  experienceReceipt: { alignSelf: 'stretch', alignItems: 'center', gap: 5, marginTop: 10 },
  xpTrack: { alignSelf: 'stretch', height: 8, borderRadius: 999, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 999 },
  receipt: { alignSelf: 'stretch', marginTop: 14, gap: 4 },
  receiptLine: { fontSize: 13, textTransform: 'capitalize' },
  receiptBalance: { marginTop: 4, fontSize: 14, fontWeight: '700' },
  jointPublicationStatus: { alignSelf: 'stretch', borderRadius: 14, borderWidth: 1, gap: 8, marginTop: 14, padding: 12 },
  jointPublicationTitle: { fontSize: 15, fontWeight: '800' },
  jointPublicationCopy: { fontSize: 13, lineHeight: 18 },
});
