import React, { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
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
import { classifyTrainingFinalizationError } from '../../../services/trainingState';
import { createWorkoutAttempt } from '../../../utils/workoutAttempts';
import { receiptTotal } from '../../../services/rewardWallet';
import * as Haptics from 'expo-haptics';
import { RewardReceipt } from '../../../types';
import { matchesActiveWorkout } from '../../../utils/activeWorkoutReentry';
import { reconcileActiveWorkoutTiming } from '../../../utils/activeWorkoutTiming';
import { withTimeout } from '../../../utils/withTimeout';
import { validateMesocycleExecutionLineage } from '../../../utils/mesocycleExecutionLineage';
import { ActiveWorkoutInviteCandidate, completedJointWorkoutInput, finishJointWorkout, inviteActiveWorkoutMember, jointParticipantInviteCapacity, JointCompletedWorkout, JointParticipant, JointVisibility, JointWorkoutLiveState, leaveJointWorkout, listActiveWorkoutInviteCandidates, listJointWorkouts, updateJointWorkoutLiveProgress } from '../../../services/jointWorkouts';
import { prepareJointWorkoutPublication, queueJointWorkoutPublication, removePendingJointWorkoutPublication } from '../../../services/jointWorkoutPublicationQueue';
import { recapSharePayload } from '../../../services/workoutRecapFeed';
import { closeWorkoutStartActivity, publishWorkoutStartActivity } from '../../../services/workoutStartActivity';
import { attemptToSession } from '../../../utils/workoutAttempts';
import { appendSessionExercise, hasCompletedSessionExerciseSet, moveWorkoutExercise, nextEffectiveSessionSetNumber, reconcileSessionCompletedSets, reconcileSessionSetValues, removeSessionExercise, snapshotWorkoutRoutine, updateSessionExerciseSets, withSessionSetType } from '../../../utils/workoutDraft';
import { getShopTheme } from '../../../constants/shopThemes';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { cancelAnimation, Easing, FadeIn, ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
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
  const { getRoutine, addAttempt, mesocycles, routines, exercises: catalogExercises, definitions = [], activeWorkoutDraft, startActiveWorkout, updateActiveWorkout, cancelActiveWorkout, clearActiveWorkoutIfMatches, refreshActiveWorkoutTiming = async () => undefined } = useData();
  const { theme } = useTheme();
  const [pendingJointCompletion, setPendingJointCompletion] = useState<PendingJointCompletion | null>(null);
  const [jointPublicationError, setJointPublicationError] = useState<string | null>(null);
  const [isSyncingJointCompletion, setIsSyncingJointCompletion] = useState(false);
  const parsedLineage = parseLineage(params);
  const resumingExpiredSession = !!parsedLineage && matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: id, lineage: parsedLineage });
  const lineageValidation = validateMesocycleExecutionLineage(mesocycles, id, parsedLineage, readSingleParam(params.mesocycleId), resumingExpiredSession);
  const lineage = lineageValidation.valid ? lineageValidation.lineage : undefined;
  const plannedEntry = lineage && mesocycles.find((mesocycle) => mesocycle.id === lineage.mesocycleId)
    ?.weeks.find((week) => week.weekNumber === lineage.weekNumber)
    ?.entries.find((entry) => entry.id === lineage.plannedSessionId);
  const sourceRoutine = plannedEntry && 'routineSnapshot' in plannedEntry && plannedEntry.routineSnapshot
    ? plannedEntry.routineSnapshot
    : getRoutine(id);
  const initialJointWorkoutId = readSingleParam(params.jointWorkoutId) ?? activeWorkoutDraft?.jointWorkoutId;

  const [phase, setPhase] = useState<'setup' | 'active' | 'done'>('setup');
  const [restSeconds, setRestSeconds] = useState('90');
  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [completedSets, setCompletedSets] = useState<Record<SetKey, boolean>>({});
  const [setValues, setSetValues] = useState<Record<SetKey, SetRuntimeValues>>({});
  const [isFinishing, setIsFinishing] = useState(false);
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
  const [pickerVisible, setPickerVisible] = useState(false);
  const [positionMenuExerciseId, setPositionMenuExerciseId] = useState<string | null>(null);
  const [pauseMenuVisible, setPauseMenuVisible] = useState(false);
  const [jointCancellationStatus, setJointCancellationStatus] = useState<'idle' | 'pending' | 'uncertain'>(activeWorkoutDraft?.jointCancellationPending ? 'pending' : 'idle');
  const [pauseSyncError, setPauseSyncError] = useState<string | null>(null);
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

  const updateCurrentActiveWorkout = useCallback((updater: (draft: ActiveWorkoutDraft) => ActiveWorkoutDraft, defer = false) => {
    const current = activeWorkoutDraftRef.current;
    if (!current) return Promise.resolve();
    const next = updater(current);
    activeWorkoutDraftRef.current = next;
    let operation: Promise<void>;
    try {
      operation = Promise.resolve(defer ? updateActiveWorkout(next, { defer: true }) : updateActiveWorkout(next));
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
    const timing = reconcileActiveWorkoutTiming(activeWorkoutDraft, nowMs);
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
    if (phase !== 'active' || pauseMenuVisible || pickerVisible || isFinishing) return false;
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
    if (!sourceRoutine || !activeWorkoutDraft || !matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: sourceRoutine.id, ...(lineage ? { lineage } : {}) }) || phase !== 'setup') return;
    attemptIdRef.current = activeWorkoutDraft.attemptId;
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
      setPauseMenuVisible(true);
    }
    if (!activeWorkoutDraft.routineSnapshot || JSON.stringify(migratedCompletedSets) !== JSON.stringify(activeWorkoutDraft.completedSets)) {
      void updateCurrentActiveWorkout((draft) => ({ ...draft, routineSnapshot: snapshot, completedSets: migratedCompletedSets }));
    }
    setJointWorkoutId(activeWorkoutDraft.jointWorkoutId ?? initialJointWorkoutId ?? null);
    const timing = reconcileActiveWorkoutTiming(activeWorkoutDraft, Date.now());
    setRestRemaining(timing.restRemainingSeconds);
    setIsResting(timing.isResting);
    setElapsed(timing.elapsedSeconds);
    setPhase('active');
  }, [activeWorkoutDraft, initialJointWorkoutId, lineage, phase, sourceRoutine, updateCurrentActiveWorkout, user]);

  useEffect(() => {
    if (phase === 'active' && attemptIdRef.current && !activeWorkoutDraft) setPhase('setup');
  }, [activeWorkoutDraft, phase]);

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
    if (phase !== 'active' || !jointWorkoutId) return;
    void loadJointState().catch(() => undefined);
  }, [jointWorkoutId, phase]);

  useEffect(() => {
    if (phase !== 'active' || !jointWorkoutId || realtimeRevision === 0) return;
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
      const snapshot = snapshotWorkoutRoutine(sourceRoutine);
      const values = buildSetValues(snapshot);
      const attemptId = generateId();
      await startActiveWorkout({ version: 1, owner: user, attemptId, routineId: snapshot.id, routineSnapshot: snapshot, jointWorkoutId: initialJointWorkoutId, lineage, startedAtMs: Date.now(), restTimerSeconds: restTimerConfig, completedSets: {}, setValues: values });
      applySetValues(values);
      setWorkoutRoutine(snapshot);
      setCompletedSets({});
      attemptIdRef.current = attemptId;
      attemptRef.current = null;
      setPhase('active');
      startTimeRef.current = Date.now();
      void publishWorkoutStartActivity(snapshot.name, initialJointWorkoutId).catch(() => undefined);
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
    setPauseSyncError(null);
    void withTimeout(
      updateCurrentActiveWorkout(() => draft),
      REMOTE_OPERATION_TIMEOUT_MS,
      'Workout sync',
    ).catch((error) => {
      setPauseSyncError(error instanceof Error ? error.message : 'No se pudo sincronizar el entrenamiento.');
    });
  };

  const pauseWorkout = () => {
    const currentDraft = activeWorkoutDraftRef.current;
    if (!currentDraft || pauseMutationRef.current) return false;
    pauseMutationRef.current = true;
    const nowMs = Date.now();
    const timing = reconcileActiveWorkoutTiming(currentDraft, nowMs);
    if (restRef.current) clearInterval(restRef.current);
    restRef.current = null;
    restEndsAtMsRef.current = null;
    setElapsed(timing.elapsedSeconds); setRestRemaining(timing.restRemainingSeconds); setIsResting(timing.restRemainingSeconds > 0);
    const pausedDraft = {
      ...currentDraft,
      setValues: setValuesRef.current,
      restEndsAtMs: undefined,
      pausedAtMs: nowMs,
      pausedRestRemainingSeconds: timing.restRemainingSeconds,
    };
    syncActiveWorkout(pausedDraft);
    publishJointLiveProgress(completedSets, 'paused');
    pauseMutationRef.current = false;
    return true;
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

  const showPauseMenu = () => {
    if (activeWorkoutDraftRef.current?.pausedAtMs) {
      setPauseMenuVisible(true);
      return;
    }
    if (pauseWorkout()) setPauseMenuVisible(true);
  };

  const resumeFromPauseMenu = () => {
    if (jointCancellationStartedRef.current) return;
    setPauseMenuVisible(false);
    resumeWorkout();
  };

  const retryActiveWorkoutSync = () => {
    const currentDraft = activeWorkoutDraftRef.current;
    if (currentDraft) syncActiveWorkout(currentDraft);
  };

  useEffect(() => {
    if (!pauseSyncError) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') retryActiveWorkoutSync();
    });
    return () => subscription.remove();
  }, [pauseSyncError]);

  const finishFromPauseMenu = () => {
    if (jointCancellationStartedRef.current) return;
    setPauseMenuVisible(false);
    void finishWorkout(jointWorkoutId ? 'circle' : undefined);
  };

  const cancelFromPauseMenu = async () => {
    if (jointCancellationInFlightRef.current) return;
    jointCancellationInFlightRef.current = true;
    if (jointWorkoutId) {
      jointCancellationStartedRef.current = true;
      setJointCancellationStatus('pending');
    }
    try {
      if (jointWorkoutId) {
        // Make the lock restart-safe before an idempotent leave can commit remotely.
        await updateCurrentActiveWorkout((draft) => ({ ...draft, jointCancellationPending: true }));
        await leaveJointWorkout(jointWorkoutId);
      }
      await cancelActiveWorkout();
      router.back();
    } catch (error) {
      if (jointWorkoutId) setJointCancellationStatus('uncertain');
      Alert.alert('No se pudo cancelar el entrenamiento', error instanceof Error ? error.message : 'Inténtalo nuevamente.');
    } finally {
      jointCancellationInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (phase !== 'active' || !jointWorkoutId || activeWorkoutDraft?.jointCancellationPending !== true) return;
    setPauseMenuVisible(true);
    void cancelFromPauseMenu();
  }, [activeWorkoutDraft?.jointCancellationPending, jointWorkoutId, phase]);

  const loadJointState = async (workoutId = jointWorkoutId) => {
    if (!workoutId) return;
    const sessions = await withTimeout(listJointWorkouts(), REMOTE_OPERATION_TIMEOUT_MS, 'Joint workout roster refresh');
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
    setJointBusy(true);
    const successfulIds = new Set<string>();
    let activeWorkoutId = jointWorkoutId;
    try {
      for (const profile of selected) {
        try {
          {
            const invitedWorkoutId = await withTimeout(inviteActiveWorkoutMember(profile.id, routine), REMOTE_OPERATION_TIMEOUT_MS, 'Joint workout invitation');
            activeWorkoutId = invitedWorkoutId;
            if (invitedWorkoutId !== jointWorkoutId) {
            setJointWorkoutId(invitedWorkoutId);
            setJointExpanded(false);
            void updateCurrentActiveWorkout((draft) => ({ ...draft, jointWorkoutId: invitedWorkoutId }));
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
    } finally { setJointBusy(false); }
  };

  const loadJointInviteCandidates = async (resetSelection = false, showLoading = true) => {
    if (phase !== 'active') return;
    if (showLoading) setJointBusy(true);
    try {
      const candidates = await withTimeout(listActiveWorkoutInviteCandidates(), REMOTE_OPERATION_TIMEOUT_MS, 'Active workout connections');
      setJointInviteCandidates(candidates);
      setSelectedJointInviteIds((current) => current.filter((id) => candidates.some((candidate) => candidate.id === id)));
      if (resetSelection) setSelectedJointInviteIds([]);
    } catch (error) {
      if (resetSelection) Alert.alert('No se pudieron cargar tus conexiones', error instanceof Error ? error.message : 'Inténtalo nuevamente.');
    } finally { if (showLoading) setJointBusy(false); }
  };

  const toggleJointHeader = () => {
    setJointExpanded((expanded) => !expanded);
  };

  const handleExerciseScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = Math.max(0, event.nativeEvent.contentOffset.y);
    const delta = offset - lastExerciseScrollOffsetRef.current;
    const shouldShow = offset < 12 || delta < -8;
    const shouldHide = offset >= 12 && delta > 8;

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

  const updateSetValue = (setKey: SetKey, field: keyof SetRuntimeValues, value: string) => {
    if (completedSets[setKey]) return;
    const next = { ...setValuesRef.current, [setKey]: { ...setValuesRef.current[setKey], [field]: value } };
    applySetValues(next);
  };

  const completeSet = async (setKey: SetKey, tipo: SetType) => {
    if (completedSets[setKey] || completingSetsRef.current.has(setKey)) return;

    const values = setValues[setKey];
    const weight = parseFloat(values?.weight ?? '0');
    const reps = parseInt(values?.reps ?? '0', 10);

    if (!Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps <= 0) {
      Alert.alert('Datos incompletos', 'Ingresa peso y repeticiones antes de finalizar la serie.');
      return;
    }

    completingSetsRef.current.add(setKey);
    try {
      const next = { ...completedSets, [setKey]: true };
      setCompletedSets(next);
      startRestTimer(next);
      if (theme.interaction === 'set-celebration') setCelebrationRef.current?.play();
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
      await withTimeout(
        finishJointWorkout(completion.workoutId, completion.visibility, completion.completedWorkout),
        REMOTE_OPERATION_TIMEOUT_MS,
        'Finish joint workout',
      );
      if (user) await removePendingJointWorkoutPublication(user, completion.workoutId);
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
          weight: parseFloat(runtime?.weight ?? String(set.weight)) || 0,
          reps: parseInt(runtime?.reps ?? String(set.reps), 10) || 0,
          completed: !!completedSets[key],
        };
      }),
    }));

    try {
      if (!user) throw new Error('Authentication required.');
      const attempt = attemptRef.current ?? createWorkoutAttempt({
        id: attemptIdRef.current ?? (attemptIdRef.current = generateId()),
        owner: user,
        routine,
        completedAt: new Date().toISOString(),
        durationSeconds: elapsed,
        restTimerSeconds: restTimerConfig,
        lineage,
        jointWorkoutId: jointWorkoutId ?? undefined,
        results: Object.fromEntries(exercises.flatMap((exercise) => exercise.sets.map((set) =>
          [`${exercise.exerciseId}:${set.setId}`, { performed: set.completed, reps: set.reps, load: set.weight }]))),
      });
      attemptRef.current = attempt;
      let jointCompletion: PendingJointCompletion | null = null;
      if (jointWorkoutId) {
        const sharePayload = recapSharePayload(
          attemptToSession(attempt),
          routine,
          lineage ? mesocycles.find((mesocycle) => mesocycle.id === lineage.mesocycleId) : undefined,
          routines,
          { shareRoutineTemplate: true, shareMesocycleTemplate: true, sharePerformedSetDetails: true },
        );
        jointCompletion = {
          attemptId: attempt.id,
          workoutId: jointWorkoutId,
          visibility: jointVisibility ?? 'circle',
          completedWorkout: completedJointWorkoutInput(routine, elapsed, exercises, sharePayload),
        };
        await prepareJointWorkoutPublication(user, jointCompletion);
      }
      // attemptRef and the prepared command survive an ambiguous timeout. A retry
      // reuses the attempt ID, while only a persisted attempt can make the command publishable.
      const finalized = await withTimeout(addAttempt(attempt), REMOTE_OPERATION_TIMEOUT_MS, 'Save workout');
      void closeWorkoutStartActivity().catch(() => undefined);
      setRewardReceipt(finalized.receipt);
      setExperienceReceipt(finalized.experienceReceipt);
      setEarnedGems(receiptTotal(finalized.receipt));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setPhase('done');
      if (jointCompletion) {
        setPendingJointCompletion(jointCompletion);
        await syncJointCompletion(jointCompletion);
      }
    } catch (error) {
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

  const updateSessionSetEffortTarget = (exerciseId: string, setId: string, effortTarget: RoutineSet['effortTarget']) => {
    if (!routine || completedSets[`${exerciseId}-${setId}`]) return;
    const next = {
      ...routine,
      exercises: routine.exercises.map((exercise) => exercise.id === exerciseId
        ? { ...exercise, sets: exercise.sets.map((set) => set.id === setId ? { ...set, effortTarget } : set) }
        : exercise),
    };
    persistWorkoutRoutine(next);
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
    return <ThemeBackground><SafeAreaView style={[styles.safe, styles.center]}><GlassCard style={styles.doneCard}><Text style={[styles.doneTitle, { color: theme.text }]}>Entrenamiento no disponible</Text><Text style={[styles.doneMeta, { color: theme.textMuted }]}>Este entrenamiento ya no está disponible. Volvé a Entrenar para elegir una rutina vigente.</Text><View style={styles.spacer} /><GlassButton title="Volver a entrenar" onPress={() => router.replace('/(tabs)/train')} /></GlassCard></SafeAreaView></ThemeBackground>;
  }

  if (!lineageValidation.valid) {
    const message = lineageValidation.reason === 'expired-planned-session'
      ? 'La fecha programada para esta sesión ya pasó.'
      : lineageValidation.reason === 'inactive-mesocycle'
      ? 'Este mesociclo ya no está activo. Actualizá o reabrí el mesociclo antes de entrenar esta sesión.'
      : lineageValidation.reason === 'non-executable-planned-session'
      ? 'Esta sesión está omitida, reprogramada o cancelada y no se puede ejecutar.'
      : 'La sesión programada ya no está disponible. Actualizá o reabrí el mesociclo antes de entrenar.';
    return <ThemeBackground><SafeAreaView style={[styles.safe, styles.center]}><GlassCard style={styles.doneCard}><Text style={[styles.doneTitle, { color: theme.text }]}>Sesión desactualizada</Text><Text style={[styles.doneMeta, { color: theme.textMuted }]}>{message}</Text><View style={styles.spacer} /><GlassButton title={lineageValidation.mesocycleId ? 'Volver al mesociclo' : 'Volver a rutinas'} onPress={() => lineageValidation.mesocycleId ? router.replace(`/mesocycle/summary/${lineageValidation.mesocycleId}`) : router.replace('/(tabs)/routines')} /></GlassCard></SafeAreaView></ThemeBackground>;
  }

  if (phase === 'setup') {
    const hasDifferentActiveWorkout = !!activeWorkoutDraft
      && !matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: routine.id, ...(lineage ? { lineage } : {}) });
    return (
      <ThemeBackground>
        <SafeAreaView style={styles.safe}>
          <AppNavBar onBack={() => router.back()} backLabel="Cancelar" />
          <AppScreenHeader title={routine.name} subtitle="Configura el entrenamiento antes de iniciar" />
          <GlassCard>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              Temporizador de descanso (segundos)
            </Text>
            <GlassInput
              keyboardType="numeric"
              value={restSeconds}
              onChangeText={setRestSeconds}
              placeholder="90"
            />
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              Se reinicia al marcar una serie como completada. Al terminar el descanso recibirás
              una alerta para continuar.
            </Text>
          </GlassCard>
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

  if (phase === 'done') {
    return (
      <ThemeBackground>
        <SafeAreaView style={[styles.safe, styles.center]}>
          <GlassCard style={styles.doneCard}>
            <Text style={styles.doneEmoji}>🎉</Text>
            <Text style={[styles.doneTitle, { color: theme.text }]}>¡Entrenamiento completado!</Text>
            <Text style={[styles.doneMeta, { color: theme.textMuted }]}>
              Tiempo: {formatTime(elapsed)}
            </Text>
            <Text style={[styles.doneGems, { color: theme.primary }]}>
              +{earnedGems} gemas
            </Text>
            {experienceReceipt ? <Animated.View entering={FadeIn.duration(220)} style={styles.experienceReceipt}>
              <Animated.Text entering={ZoomIn.duration(360)} style={[styles.doneXp, { color: theme.secondary }]}>+{experienceReceipt.earnedXp} XP</Animated.Text>
              <Text style={[styles.receiptLine, { color: theme.textMuted }]}>Nivel {experienceReceipt.progress.level} · {experienceReceipt.progress.rank}</Text>
              <View style={[styles.xpTrack, { backgroundColor: theme.glassBorder }]}><View style={[styles.xpFill, { width: `${Math.min(100, experienceReceipt.progress.xpIntoLevel / experienceReceipt.progress.xpForNextLevel * 100)}%`, backgroundColor: theme.secondary }]} /></View>
              {experienceReceipt.entries.some((entry) => entry.kind === 'personal_record') ? <Text style={[styles.receiptLine, { color: theme.secondary }]}>Nuevo récord personal</Text> : null}
            </Animated.View> : null}
            {rewardReceipt && (
              <View style={styles.receipt}>
                {rewardReceipt.entries.map((entry, index) => (
                  <Text key={`${entry.kind}-${index}`} style={[styles.receiptLine, { color: theme.textMuted }]}>
                    {entry.kind.replaceAll('_', ' ')}: +{entry.amount}
                  </Text>
                ))}
                <Text style={[styles.receiptBalance, { color: theme.text }]}>Saldo: {rewardReceipt.balance} gemas</Text>
                {rewardReceipt.weekly.target !== undefined && (
                  <Text style={[styles.receiptLine, { color: theme.textMuted }]}>Semana: {rewardReceipt.weekly.completed ?? 0}/{rewardReceipt.weekly.target} rutinas</Text>
                )}
                {rewardReceipt.mesocycle?.next && (
                  <Text style={[styles.receiptLine, { color: theme.textMuted }]}>{rewardReceipt.mesocycle.next}</Text>
                )}
              </View>
            )}
            {pendingJointCompletion ? <View style={[styles.jointPublicationStatus, { borderColor: theme.glassBorder, backgroundColor: theme.glass }]}>
              <Text style={[styles.jointPublicationTitle, { color: theme.text }]}>Tu resultado conjunto todavía no se publicó</Text>
              <Text style={[styles.jointPublicationCopy, { color: theme.textMuted }]}>{jointPublicationError ?? 'Sincronizando tu resultado con el entrenamiento conjunto...'}</Text>
              <GlassButton title="Reintentar publicación" variant="secondary" disabled={isSyncingJointCompletion} onPress={() => void syncJointCompletion(pendingJointCompletion)} />
              <WorkoutSaveIndicator visible={isSyncingJointCompletion} color={theme.glassBorder} textColor={theme.textMuted} />
            </View> : null}
            <View style={styles.spacer} />
            <GlassButton
              title="Volver a rutinas"
              onPress={() => router.replace('/(tabs)/routines')}
            />
          </GlassCard>
        </SafeAreaView>
      </ThemeBackground>
    );
  }

  const totalSets = routine.exercises.reduce((acc, e) => acc + e.sets.length, 0);
  const doneSets = Object.values(completedSets).filter(Boolean).length;
  const jointInviteLimit = jointWorkoutId ? jointParticipantInviteCapacity(jointTargets) : 3;
  const selectedJointInviteCount = selectedJointInviteIds.length;
  const selectedJointInviteMembers = selectedJointInviteIds.reduce((count, id) => count + (jointInviteCandidates.find((candidate) => candidate.id === id)?.groupMemberCount ?? 1), 0);
  const positionMenuExercise = routine.exercises.find((exercise) => exercise.id === positionMenuExerciseId);
  const positionMenuExerciseIndex = positionMenuExercise ? routine.exercises.indexOf(positionMenuExercise) : -1;

  return (
      <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <Animated.View pointerEvents={workoutControlsVisible ? 'auto' : 'none'} style={[styles.floatingWorkoutControls, floatingWorkoutControlsStyle]}>
          <GlassCard style={styles.workoutControlsGlass} noPadding>
            <View style={styles.fixedWorkoutControls}>
            <View style={styles.fixedTimerMetric}>
              <Ionicons name="time-outline" size={16} color={theme.primary} />
              <Text style={[styles.fixedTimerValue, { color: theme.text }]}>{formatTime(elapsed)}</Text>
            </View>
            <View style={[styles.fixedControlDivider, { backgroundColor: theme.glassBorder }]} />
            <HapticPressable accessibilityRole="button" accessibilityLabel={activeWorkoutDraft?.pausedAtMs ? 'Resolver entrenamiento pausado' : 'Pausar entrenamiento'} accessibilityHint="Abre las opciones para reanudar, finalizar o cancelar" onPress={() => void showPauseMenu()} style={[styles.fixedPauseControl, { borderColor: theme.glassBorder, backgroundColor: theme.glass }]}>
              <Ionicons name={activeWorkoutDraft?.pausedAtMs ? 'play' : 'pause'} size={20} color={activeWorkoutDraft?.pausedAtMs ? theme.textMuted : theme.accent} />
            </HapticPressable>
            <View style={[styles.fixedControlDivider, { backgroundColor: theme.glassBorder }]} />
            <View style={styles.fixedTimerMetric}>
              <Ionicons name="hourglass-outline" size={16} color={isResting ? theme.accent : theme.textMuted} />
              <Text style={[styles.fixedTimerValue, { color: isResting ? theme.accent : theme.textMuted }]}>{isResting ? formatTime(restRemaining) : formatTime(restTimerConfig)}</Text>
            </View>
            </View>
          </GlassCard>
          <WorkoutSaveIndicator visible={pendingSaveCount > 0 || isJointBusy} color={theme.glassBorder} textColor={theme.textMuted} />
        </Animated.View>
        <FlatList
            data={routine.exercises}
            keyExtractor={(exercise) => exercise.id}
            style={styles.exerciseList}
            contentContainerStyle={styles.exerciseListContent}
            onScroll={handleExerciseScroll}
            scrollEventThrottle={16}
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
            <GlassCard style={styles.exerciseCard} blur={false}>
                <Text style={[styles.exerciseName, { color: theme.text }]}>
                  {exIndex + 1}. {exercise.name || 'Sin nombre'}
                </Text>
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
                 const setKey = `${exercise.id}-${set.id}`;
                  const completed = !!completedSets[setKey];
                  const values = setValues[setKey] ?? { weight: '', reps: '' };
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
                        borderColor: completed ? theme.success : isFailureSet(set.tipo) ? '#EF4444' : theme.glassBorder,
                        backgroundColor: completed ? `${theme.glass}` : 'rgba(0,0,0,0.15)',
                      },
                    ]}
                  >
                    <View style={styles.setCardHeader}>
                       <Text style={[styles.setTypeHint, { color: isFailureSet(set.tipo) ? '#EF4444' : theme.textMuted }]}>
                         {isBackoff ? (firstInBackoff ? `Backoff · ${backoffCount} subseries` : `Subserie ${subseries}`) : isFailureSet(set.tipo) ? 'Sin repeticiones' : `Serie ${setIndex + 1}`}
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
                          {exercise.loadMode === 'bodyweight' ? 'Peso corporal' : exercise.loadMode === 'assisted' ? 'Asistencia' : 'Carga externa'} ({exercise.loadUnit ?? 'kg'})
                        </Text>
                        <GlassInput
                          style={styles.setInput}
                          keyboardType="decimal-pad"
                          value={values.weight}
                          editable={!completed}
                          placeholder="0"
                          onChangeText={(text) => updateSetValue(setKey, 'weight', text)}
                          onBlur={() => { void commitSetValues(); }}
                          onSubmitEditing={() => { void commitSetValues(); }}
                        />
                      </View>
                      {isFailureSet(set.tipo) ? (
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

                    <EffortTargetControl
                      value={set.effortTarget}
                      disabled={completed}
                      onChange={(effortTarget) => updateSessionSetEffortTarget(exercise.id, set.id, effortTarget)}
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
            </GlassCard>
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
          <View style={styles.pauseMenuBackdrop}>
            <GlassCard style={[styles.positionMenu, { borderColor: theme.glassBorder, backgroundColor: theme.tabBarBackground }]}>
              <Text style={[styles.pauseMenuTitle, { color: theme.text }]}>Cambiar posición</Text>
              <Text style={[styles.pauseMenuCopy, { color: theme.textMuted }]}>Elegí dónde va {positionMenuExercise?.name ?? 'este ejercicio'} en este entrenamiento. No cambia tu rutina guardada.</Text>
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

        <Modal
          transparent
          animationType="fade"
          visible={pauseMenuVisible}
          onRequestClose={() => resumeFromPauseMenu()}
        >
          <View style={styles.pauseMenuBackdrop}>
            <GlassCard style={[styles.pauseMenu, { borderColor: theme.glassBorder, backgroundColor: theme.tabBarBackground }]}>
              <View style={styles.pauseMenuTitleRow}>
                <View style={[styles.pauseMenuDot, { backgroundColor: theme.accent }]} />
                <Text style={[styles.pauseMenuTitle, { color: theme.text }]}>Entrenamiento pausado</Text>
              </View>
              <Text style={[styles.pauseMenuCopy, { color: theme.textMuted }]}>El cronómetro y el descanso están detenidos hasta que elijas cómo continuar.</Text>
              {pauseSyncError ? <View style={[styles.pauseSyncError, { borderColor: theme.glassBorder }]}>
                <Text accessibilityRole="alert" style={[styles.pauseSyncErrorText, { color: theme.textMuted }]}>La pausa sigue guardada en este dispositivo. Se sincronizará al reintentar o volver a la app.</Text>
                <GlassButton title="Reintentar sincronización" variant="secondary" onPress={retryActiveWorkoutSync} />
              </View> : null}
              <GlassButton title="Reanudar" disabled={jointCancellationStatus !== 'idle'} onPress={() => void resumeFromPauseMenu()} />
              <GlassButton title="Finalizar entrenamiento" variant="secondary" disabled={isFinishing || jointCancellationStatus !== 'idle'} onPress={finishFromPauseMenu} />
              <WorkoutSaveIndicator visible={isFinishing} color={theme.glassBorder} textColor={theme.textMuted} />
              <HapticPressable accessibilityRole="button" accessibilityLabel="Cancelar entrenamiento" accessibilityState={{ disabled: jointCancellationStatus === 'pending' }} disabled={jointCancellationStatus === 'pending'} onPress={() => void cancelFromPauseMenu()} style={styles.pauseCancelButton}>
                <Text style={styles.pauseCancelText}>Cancelar entrenamiento</Text>
              </HapticPressable>
            </GlassCard>
          </View>
        </Modal>

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
   fixedPauseControl: { alignItems: 'center', borderRadius: 14, borderWidth: 1, height: 50, justifyContent: 'center', width: 50 },
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
   pauseMenuBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.54)', flex: 1, justifyContent: 'center', padding: 24 },
   pauseMenu: { alignSelf: 'stretch', gap: 12 },
   pauseSyncError: { borderRadius: 12, borderWidth: 1, gap: 8, padding: 10 },
   pauseSyncErrorText: { fontSize: 12, lineHeight: 17 },
    positionMenu: { alignSelf: 'stretch', gap: 10 },
    positionOption: { borderRadius: 12, borderWidth: 1, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10 },
    positionOptionText: { fontSize: 14, fontWeight: '800' },
    positionCurrentText: { fontSize: 12, marginTop: 2 },
   pauseMenuTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
   pauseMenuDot: { borderRadius: 6, height: 12, width: 12 },
   pauseMenuTitle: { fontSize: 20, fontWeight: '900' },
   pauseMenuCopy: { fontSize: 14, lineHeight: 20 },
   pauseCancelButton: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
   pauseCancelText: { color: '#EF4444', fontSize: 14, fontWeight: '800' },
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
