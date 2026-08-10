import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Modal,
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
import { ExclusiveSetCelebration } from '../../../components/ExclusiveSetCelebration';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { EffortTargetControl } from '../../../components/EffortTargetControl';
import { HapticPressable } from '../../../components/HapticPressable';
import { ProfileAvatar } from '../../../components/ProfileAvatar';
import { ProfileTitleBadge } from '../../../components/ProfileTitleBadge';
import { JointWorkoutLiveRoster } from '../../../components/JointWorkoutLiveRoster';
import { DraggableList } from '../../../components/DraggableList';
import { ChatFab } from '../../../components/ChatFab';
import { RestCompletionBadge } from '../../../components/RestCompletionBadge';
import { GlassButton, GlassInput } from '../../../components/UI';
import { getRandomSetEncouragementMessage } from '../../../constants/encouragement';
import { useAuth } from '../../../context/AuthContext';
import { useData } from '../../../context/DataContext';
import { useShop } from '../../../context/ShopContext';
import { useTheme } from '../../../context/ThemeContext';
import { useSocial } from '../../../context/SocialContext';
import { CompletedExercise, CompletedSet, Exercise, ExperienceReceipt, Routine, SetType, WorkoutAttempt } from '../../../types';
import { vibrateRestTimerComplete } from '../../../utils/haptics';
import { generateId } from '../../../utils/storage';
import { classifyTrainingFinalizationError } from '../../../services/trainingState';
import { createWorkoutAttempt } from '../../../utils/workoutAttempts';
import { receiptTotal } from '../../../services/rewardWallet';
import * as Haptics from 'expo-haptics';
import { RewardReceipt } from '../../../types';
import { matchesActiveWorkout } from '../../../utils/activeWorkoutReentry';
import { reconcileActiveWorkoutTiming } from '../../../utils/activeWorkoutTiming';
import { validateMesocycleExecutionLineage } from '../../../utils/mesocycleExecutionLineage';
import { ActiveWorkoutInviteCandidate, completedJointWorkoutInput, directPartnerRecipient, finishJointWorkout, inviteActiveWorkoutMember, jointParticipantInviteCapacity, JointParticipant, JointWorkoutLiveState, listActiveWorkoutInviteCandidates, listJointWorkouts, updateJointWorkoutLiveProgress } from '../../../services/jointWorkouts';
import { recapSharePayload } from '../../../services/workoutRecapFeed';
import { closeWorkoutStartActivity, publishWorkoutStartActivity } from '../../../services/workoutStartActivity';
import { attemptToSession } from '../../../utils/workoutAttempts';
import { appendSessionExercise, moveWorkoutExercise, nextEffectiveSessionSetNumber, reconcileSessionSetValues, snapshotWorkoutRoutine, updateSessionExerciseSets, withSessionSetType } from '../../../utils/workoutDraft';
import { getShopTheme } from '../../../constants/shopThemes';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

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

interface SetRuntimeValues {
  weight: string;
  reps: string;
}

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
  const parsedLineage = parseLineage(params);
  const lineageValidation = validateMesocycleExecutionLineage(mesocycles, id, parsedLineage, readSingleParam(params.mesocycleId));
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
  const [celebrationNonce, setCelebrationNonce] = useState(0);
  const [jointWorkoutId, setJointWorkoutId] = useState<string | null>(initialJointWorkoutId ?? null);
  const [jointTargets, setJointTargets] = useState<JointParticipant[]>([]);
  const [jointInviteCandidates, setJointInviteCandidates] = useState<ActiveWorkoutInviteCandidate[]>([]);
  const [selectedJointInviteIds, setSelectedJointInviteIds] = useState<string[]>([]);
  const [isJointBusy, setJointBusy] = useState(false);
  const [isJointExpanded, setJointExpanded] = useState(false);
  const [workoutRoutine, setWorkoutRoutine] = useState<Routine | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pauseMenuVisible, setPauseMenuVisible] = useState(false);
  const [restCompletionBadgeVisible, setRestCompletionBadgeVisible] = useState(false);
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
  const startInFlightRef = useRef(false);
  const publishedJointSessionRef = useRef<string | null>(null);
  const reconcileElapsedRef = useRef<() => void>(() => undefined);
  const handleRestCompleteRef = useRef<() => void>(() => undefined);
  const refreshActiveWorkoutTimingRef = useRef(refreshActiveWorkoutTiming);
  const restTimerConfig = parseInt(restSeconds, 10) || 90;
  const pausePulse = useSharedValue(1);
  const pauseControlIsActive = phase === 'active' && !activeWorkoutDraft?.pausedAtMs && !pauseMenuVisible;
  const pauseDotStyle = useAnimatedStyle(() => ({
    opacity: pausePulse.value,
    transform: [{ scale: 0.78 + pausePulse.value * 0.22 }],
  }));

  useEffect(() => {
    pausePulse.value = pauseControlIsActive
      ? withRepeat(withSequence(withTiming(0.35, { duration: 700 }), withTiming(1, { duration: 700 })), -1, true)
      : withTiming(1, { duration: 120 });
  }, [pauseControlIsActive, pausePulse]);

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

  useEffect(() => {
    if (!sourceRoutine || !activeWorkoutDraft || !matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: sourceRoutine.id, ...(lineage ? { lineage } : {}) }) || phase !== 'setup') return;
    attemptIdRef.current = activeWorkoutDraft.attemptId;
    startTimeRef.current = activeWorkoutDraft.startedAtMs;
    setRestSeconds(String(activeWorkoutDraft.restTimerSeconds));
    setSetValues(activeWorkoutDraft.setValues);
    setCompletedSets(activeWorkoutDraft.completedSets);
    const snapshot = activeWorkoutDraft.routineSnapshot ?? snapshotWorkoutRoutine(sourceRoutine);
    setWorkoutRoutine(snapshot);
    if (!activeWorkoutDraft.routineSnapshot) void updateActiveWorkout({ ...activeWorkoutDraft, routineSnapshot: snapshot });
    setJointWorkoutId(activeWorkoutDraft.jointWorkoutId ?? initialJointWorkoutId ?? null);
    const timing = reconcileActiveWorkoutTiming(activeWorkoutDraft, Date.now());
    setRestRemaining(timing.restRemainingSeconds);
    setIsResting(timing.isResting);
    setElapsed(timing.elapsedSeconds);
    setPhase('active');
  }, [activeWorkoutDraft, initialJointWorkoutId, lineage, phase, sourceRoutine, updateActiveWorkout, user]);

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
    void updateJointWorkoutLiveProgress(jointWorkoutId, { state, ...jointProgress(routine, nextCompletedSets), ...(state === 'resting' && restSeconds ? { restSeconds } : {}) }).catch(() => undefined);
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
    if (activeWorkoutDraft) void updateActiveWorkout({ ...activeWorkoutDraft, restEndsAtMs });
    startRestCountdown(restEndsAtMs);
    publishJointLiveProgress(nextCompletedSets, 'resting', restTimerConfig);
  }, [activeWorkoutDraft, completedSets, publishJointLiveProgress, restTimerConfig, startRestCountdown, updateActiveWorkout]);

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
      setSetValues(values);
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
    if (activeWorkoutDraft) void updateActiveWorkout({ ...activeWorkoutDraft, routineSnapshot: next, ...(nextSetValues ? { setValues: nextSetValues } : {}) });
  };

  const moveExercise = (from: number, to: number) => {
    if (!routine) return;
    persistWorkoutRoutine(moveWorkoutExercise(routine, from, to));
  };

  const addSessionExercise = (exercise: Exercise) => {
    if (!routine) return;
    const next = appendSessionExercise(routine, exercise, definitions, generateId);
    const merged = reconcileSessionSetValues(next, setValues);
    setSetValues(merged);
    persistWorkoutRoutine(next, merged);
    setPickerVisible(false);
  };

  const pauseWorkout = async () => {
    if (!activeWorkoutDraft || pauseMutationRef.current) return;
    pauseMutationRef.current = true;
    try {
      const nowMs = Date.now();
      const timing = reconcileActiveWorkoutTiming(activeWorkoutDraft, nowMs);
      if (restRef.current) clearInterval(restRef.current);
      restRef.current = null;
      restEndsAtMsRef.current = null;
      await updateActiveWorkout({ ...activeWorkoutDraft, restEndsAtMs: undefined, pausedAtMs: nowMs, pausedRestRemainingSeconds: timing.restRemainingSeconds });
      setElapsed(timing.elapsedSeconds); setRestRemaining(timing.restRemainingSeconds); setIsResting(timing.restRemainingSeconds > 0);
      publishJointLiveProgress(completedSets, 'paused');
    } finally { pauseMutationRef.current = false; }
  };

  const resumeWorkout = async () => {
    if (!activeWorkoutDraft?.pausedAtMs || pauseMutationRef.current) return;
    pauseMutationRef.current = true;
    try {
      const nowMs = Date.now();
      const pauseMs = Math.max(0, nowMs - activeWorkoutDraft.pausedAtMs);
      const remaining = Math.max(0, activeWorkoutDraft.pausedRestRemainingSeconds ?? 0);
      const restEndsAtMs = remaining ? nowMs + remaining * 1000 : undefined;
      const resumed = { ...activeWorkoutDraft, pausedAtMs: undefined, pausedRestRemainingSeconds: undefined, pausedDurationMs: (activeWorkoutDraft.pausedDurationMs ?? 0) + pauseMs, restEndsAtMs };
      await updateActiveWorkout(resumed);
      if (restEndsAtMs) {
        restEndsAtMsRef.current = restEndsAtMs;
        restCompletionAlertedRef.current = false;
        setIsResting(true); setRestRemaining(remaining);
        setRestCompletionBadgeVisible(false);
        startRestCountdown(restEndsAtMs);
      }
      publishJointLiveProgress(completedSets, restEndsAtMs ? 'resting' : 'training', restEndsAtMs ? remaining : undefined);
    } finally { pauseMutationRef.current = false; }
  };

  const showPauseMenu = async () => {
    if (activeWorkoutDraft?.pausedAtMs) {
      setPauseMenuVisible(true);
      return;
    }
    await pauseWorkout();
    setPauseMenuVisible(true);
  };

  const resumeFromPauseMenu = async () => {
    setPauseMenuVisible(false);
    await resumeWorkout();
  };

  const finishFromPauseMenu = () => {
    setPauseMenuVisible(false);
    void finishWorkout(jointWorkoutId ? 'circle' : undefined);
  };

  const cancelFromPauseMenu = async () => {
    setPauseMenuVisible(false);
    await cancelActiveWorkout();
    router.back();
  };

  const loadJointState = async (workoutId = jointWorkoutId) => {
    if (!workoutId) return;
    const sessions = await listJointWorkouts();
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
            activeWorkoutId = await inviteActiveWorkoutMember(profile.id, routine);
            if (activeWorkoutId !== jointWorkoutId) {
            setJointWorkoutId(activeWorkoutId);
            setJointExpanded(false);
            if (activeWorkoutDraft) void updateActiveWorkout({ ...activeWorkoutDraft, jointWorkoutId: activeWorkoutId });
            router.setParams({ jointWorkoutId: activeWorkoutId });
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

  const loadJointInviteCandidates = async (resetSelection = false) => {
    if (phase !== 'active') return;
    setJointBusy(true);
    try {
      const candidates = await listActiveWorkoutInviteCandidates();
      setJointInviteCandidates(candidates);
      setSelectedJointInviteIds((current) => current.filter((id) => candidates.some((candidate) => candidate.id === id)));
      if (resetSelection) setSelectedJointInviteIds([]);
    } catch (error) {
      if (resetSelection) Alert.alert('No se pudieron cargar tus conexiones', error instanceof Error ? error.message : 'Inténtalo nuevamente.');
    } finally { setJointBusy(false); }
  };

  const toggleJointHeader = () => {
    setJointExpanded((expanded) => {
      if (!expanded) void loadJointInviteCandidates(false);
      return !expanded;
    });
  };

  useEffect(() => {
    if (phase !== 'active' || !isJointExpanded) return;
    void loadJointInviteCandidates(false);
  }, [isJointExpanded, phase, realtimeRevision]);

  const updateSetValue = (setKey: SetKey, field: keyof SetRuntimeValues, value: string) => {
    if (completedSets[setKey]) return;
    setSetValues((prev) => {
      const next = { ...prev, [setKey]: { ...prev[setKey], [field]: value } };
      if (activeWorkoutDraft) void updateActiveWorkout({ ...activeWorkoutDraft, setValues: next });
      return next;
    });
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
      setCompletedSets((prev) => {
        const next = { ...prev, [setKey]: true };
        if (activeWorkoutDraft) void updateActiveWorkout({ ...activeWorkoutDraft, completedSets: next });
        startRestTimer(next);
        return next;
      });
      if (theme.interaction === 'set-celebration') setCelebrationNonce((value) => value + 1);
      Alert.alert('¡Serie!', getRandomSetEncouragementMessage(), [{ text: '¡Vamos!' }]);
    } finally {
      completingSetsRef.current.delete(setKey);
    }
  };

  const reopenSet = (setKey: SetKey) => {
    if (!completedSets[setKey]) return;
    setCompletedSets((prev) => {
      const next = { ...prev, [setKey]: false };
      if (activeWorkoutDraft) void updateActiveWorkout({ ...activeWorkoutDraft, completedSets: next });
      publishJointLiveProgress(next, 'training');
      return next;
    });
  };

  const finishWorkout = async (jointVisibility?: 'public' | 'circle' | 'private') => {
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
        const runtime = setValues[key];
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
      const finalized = await addAttempt(attempt);
      void closeWorkoutStartActivity().catch(() => undefined);
      if (jointWorkoutId) {
        const sharePayload = recapSharePayload(
          attemptToSession(attempt),
          routine,
          lineage ? mesocycles.find((mesocycle) => mesocycle.id === lineage.mesocycleId) : undefined,
          routines,
          { shareRoutineTemplate: true, shareMesocycleTemplate: true, sharePerformedSetDetails: true },
        );
        await finishJointWorkout(jointWorkoutId, jointVisibility ?? 'circle', completedJointWorkoutInput(routine, elapsed, exercises, sharePayload));
      }
      setRewardReceipt(finalized.receipt);
      setExperienceReceipt(finalized.experienceReceipt);
      setEarnedGems(receiptTotal(finalized.receipt));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setPhase('done');
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
    setSetValues(merged);
    persistWorkoutRoutine(next, merged);
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
    const message = lineageValidation.reason === 'inactive-mesocycle'
      ? 'Este mesociclo ya no está activo. Actualizá o reabrí el mesociclo antes de entrenar esta sesión.'
      : 'La sesión programada ya no está disponible. Actualizá o reabrí el mesociclo antes de entrenar.';
    return <ThemeBackground><SafeAreaView style={[styles.safe, styles.center]}><GlassCard style={styles.doneCard}><Text style={[styles.doneTitle, { color: theme.text }]}>Sesión desactualizada</Text><Text style={[styles.doneMeta, { color: theme.textMuted }]}>{message}</Text><View style={styles.spacer} /><GlassButton title={lineageValidation.mesocycleId ? 'Volver al mesociclo' : 'Volver a rutinas'} onPress={() => lineageValidation.mesocycleId ? router.replace(`/mesocycle/summary/${lineageValidation.mesocycleId}`) : router.replace('/(tabs)/routines')} /></GlassCard></SafeAreaView></ThemeBackground>;
  }

  if (phase === 'setup') {
    const hasDifferentActiveWorkout = !!activeWorkoutDraft
      && !matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: routine.id, ...(lineage ? { lineage } : {}) });
    return (
      <ThemeBackground>
        <SafeAreaView style={styles.safe}>
          <AppNavBar onBack={() => router.back()} backLabel="← Cancelar" />
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
            loading={isStarting}
            disabled={isStarting}
            onPress={() => hasDifferentActiveWorkout && activeWorkoutDraft ? continueActiveWorkout(activeWorkoutDraft) : void startWorkout()}
          />
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
  const partnerRecipientId = directPartnerRecipient({ id: jointWorkoutId ?? '', createdAt: '', participants: jointTargets });

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <DraggableList
          items={routine.exercises}
          dragEnabled={false}
          labelForItem={(exercise) => `ejercicio ${exercise.name}`}
           onReorder={moveExercise}
           renderPlaceholder={(exercise) => <View
             pointerEvents="none"
             accessible
             accessibilityLabel={`Posición temporal del ejercicio ${exercise.name || 'sin nombre'}`}
             style={[styles.exercisePlaceholder, { borderColor: theme.glassBorder, backgroundColor: theme.glass }]}
           >
             <View style={styles.exercisePlaceholderHeader}>
               <View style={[styles.skeletonTitle, { backgroundColor: theme.glassBorder }]} />
               <View style={[styles.skeletonHandle, { backgroundColor: theme.glassBorder }]} />
             </View>
             <View style={[styles.skeletonMetadata, { backgroundColor: theme.glassBorder }]} />
             {exercise.sets.map((set) => <View key={set.id} style={[styles.skeletonSet, { borderColor: theme.glassBorder }]}>
               <View style={[styles.skeletonSetLabel, { backgroundColor: theme.glassBorder }]} />
               <View style={styles.skeletonSetValues}>
                 <View style={[styles.skeletonValue, { backgroundColor: theme.glassBorder }]} />
                 <View style={[styles.skeletonValue, { backgroundColor: theme.glassBorder }]} />
               </View>
             </View>)}
           </View>}
           style={styles.exerciseList}
           contentContainerStyle={styles.exerciseListContent}
           stickyHeaderIndices={[0]}
           ListHeaderComponent={<View style={[styles.stickyWorkoutStatus, { backgroundColor: theme.tabBarBackground, borderColor: theme.glassBorder }]}>
        <View style={styles.timerBar}>
           <GlassCard style={styles.timerCard}>
            <Text style={[styles.timerLabel, { color: theme.textMuted }]}>Cronómetro</Text>
            <Text style={[styles.timerValue, { color: theme.text }]}>
              {formatTime(elapsed)}
            </Text>
          </GlassCard>
          <HapticPressable accessibilityRole="button" accessibilityLabel={activeWorkoutDraft?.pausedAtMs ? 'Resolver entrenamiento pausado' : 'Pausar entrenamiento'} accessibilityHint="Abre las opciones para reanudar, finalizar o cancelar" onPress={() => void showPauseMenu()} style={[styles.pauseControl, { borderColor: theme.glassBorder, backgroundColor: theme.glass }]}>
            <Animated.View style={[styles.pauseDot, { backgroundColor: activeWorkoutDraft?.pausedAtMs ? theme.textMuted : theme.accent }, pauseDotStyle]} />
          </HapticPressable>
          <View style={styles.restColumn}>
            <GlassCard style={[styles.timerCard, isResting ? styles.restActive : undefined]}>
              <Text style={[styles.timerLabel, { color: theme.textMuted }]}>Descanso</Text>
              <Text style={[styles.timerValue, { color: isResting ? theme.accent : theme.textMuted }]}>{isResting ? formatTime(restRemaining) : formatTime(restTimerConfig)}</Text>
            </GlassCard>
          </View>
        </View>

        <View style={styles.stickyMetaRow}>
          <Text style={[styles.progress, { color: theme.textMuted }]}>Series: {doneSets}/{totalSets}</Text>
          <JointWorkoutLiveRoster participants={jointTargets} expanded={isJointExpanded} onToggle={toggleJointHeader} />
        </View>
        {isJointExpanded ? <View style={[styles.jointHeaderPanel, { borderTopColor: theme.glassBorder }]}>
          {jointInviteCandidates.length ? <View style={styles.jointInviteList}>
            <Text style={{ color: theme.textMuted }}>Entrenando en tu círculo</Text>
            {jointInviteCandidates.map((profile) => {
              const recipientTheme = getShopTheme(profile.themeId ?? '') ?? getShopTheme('profile-rodaja')!;
              const selected = selectedJointInviteIds.includes(profile.id);
              const selectionFull = !selected && selectedJointInviteMembers + profile.groupMemberCount > jointInviteLimit;
              return <Pressable key={profile.id} accessibilityRole="checkbox" accessibilityLabel={`Invitar a ${profile.alias}`} accessibilityState={{ selected, disabled: isJointBusy || selectionFull }} disabled={isJointBusy || selectionFull} onPress={() => toggleJointInviteCandidate(profile.id)}><GlassCard style={[styles.jointInviteMember, selected && styles.jointInviteMemberSelected]}><LinearGradient colors={[recipientTheme.primary, recipientTheme.accent, recipientTheme.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.jointInviteBanner}><ProfileAvatar avatarId={profile.avatarId} frameId={profile.frameId} size={40} borderColor="rgba(255,255,255,0.7)" /><View style={styles.jointInviteCopy}><Text style={styles.jointInviteAlias}>{profile.alias}</Text><ProfileTitleBadge titleId={profile.titleId} /><Text style={styles.jointInviteRelationship}>{profile.groupMemberCount === 1 ? `${profile.relationshipKind === 'partner' ? 'Partner' : 'Bro'} · entrenando ahora` : `Grupo de ${profile.groupMemberCount} entrenando ahora`}</Text></View>{selected ? <View style={styles.jointInviteSelectedBadge}><Text style={styles.jointInviteSelectedBadgeText}>Seleccionado</Text></View> : null}</LinearGradient></GlassCard></Pressable>;
            })}
            <View style={styles.jointInviteAction}><Text style={[styles.jointInviteCount, { color: theme.textMuted }]}>{selectedJointInviteCount ? `${selectedJointInviteCount} invitación${selectedJointInviteCount === 1 ? '' : 'es'} · ${selectedJointInviteMembers} persona${selectedJointInviteMembers === 1 ? '' : 's'} se sumarán` : 'Elegí a quién invitar'}</Text><GlassButton title={`Invitar a ${selectedJointInviteCount} ${selectedJointInviteCount === 1 ? 'persona' : 'personas'}`} loading={isJointBusy} disabled={isJointBusy || !selectedJointInviteCount} onPress={() => void inviteSelectedToJointWorkout()} /></View>
          </View> : <Text style={[styles.jointHeaderEmpty, { color: theme.textMuted }]}>{isJointBusy ? 'Actualizando personas activas...' : 'Nadie de tu círculo está entrenando ahora.'}</Text>}
        </View> : null}
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
        >
          {(exercise, exIndex) => <>
            <GlassCard style={styles.exerciseCard}>
              <Text style={[styles.exerciseName, { color: theme.text }]}>
                {exIndex + 1}. {exercise.name || 'Sin nombre'}
              </Text>

                {exercise.sets.map((set, setIndex) => {
                 const setKey = `${exercise.id}-${set.id}`;
                  const completed = !!completedSets[setKey];
                  const canEditPrescription = !exercise.sets.some((candidate) => completedSets[`${exercise.id}-${candidate.id}`]);
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
                        {
                        borderColor: completed ? theme.success : theme.glassBorder,
                        backgroundColor: completed ? `${theme.glass}` : 'rgba(0,0,0,0.15)',
                      },
                    ]}
                  >
                    <View style={styles.setCardHeader}>
                      <Text style={[styles.setTitle, { color: theme.text }]}> 
                        {getSetTypeLabel(set.tipo)}
                      </Text>
                      <Text style={[styles.setTypeHint, { color: theme.textMuted }]}>
                        {isBackoff ? (firstInBackoff ? `Backoff · ${backoffCount} subseries` : `Subserie ${subseries}`) : isFailureSet(set.tipo) ? 'Sin repeticiones' : `Serie ${setIndex + 1}`}
                      </Text>
                      {completed && (
                        <View style={[styles.completedBadge, { backgroundColor: theme.success }]}> 
                          <Text style={styles.completedBadgeText}>✓ Hecha</Text>
                        </View>
                      )}
                    </View>

                    {canEditPrescription ? <View style={styles.sessionSetControls}>
                      <View style={styles.typeControl}>
                        {(['C', 'effective', 'F'] as const).map((type) => {
                          const selected = type === 'effective' ? typeof set.tipo === 'number' : set.tipo === type;
                          const label = type === 'effective' ? String(typeof set.tipo === 'number' ? set.tipo : 'E') : type;
                          return <HapticPressable
                            key={type}
                            accessibilityRole="radio"
                            accessibilityLabel={type === 'C' ? 'Calentamiento' : type === 'F' ? 'Fallo muscular' : `Serie efectiva ${label}`}
                            accessibilityState={{ selected }}
                            onPress={() => updateSessionSetType(exercise.id, set.id, type)}
                            style={[styles.typeOption, { borderColor: selected ? theme.primary : theme.glassBorder, backgroundColor: selected ? theme.primary : theme.glass }]}
                          ><Text style={{ color: selected ? theme.onPrimary : theme.textMuted, fontWeight: '800' }}>{label}</Text></HapticPressable>;
                        })}
                      </View>
                      <HapticPressable
                        accessibilityRole="button"
                        accessibilityLabel={`Quitar ${getSetTypeLabel(set.tipo)}`}
                        accessibilityState={{ disabled: exercise.sets.length <= 1 }}
                        disabled={exercise.sets.length <= 1}
                        onPress={() => removeSessionSet(exercise.id, set.id)}
                        style={[styles.removeSetBtn, { borderColor: theme.glassBorder, opacity: exercise.sets.length <= 1 ? 0.45 : 1 }]}
                      ><Text style={[styles.removeSetBtnText, { color: theme.textMuted }]}>Quitar serie</Text></HapticPressable>
                    </View> : null}

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
                        />
                      </View>
                      {isFailureSet(set.tipo) ? (
                        <View style={styles.inputGroup}>
                          <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Repeticiones al fallo</Text>
                          <GlassInput style={styles.setInput} keyboardType="number-pad" value={values.reps}
                            editable={!completed} placeholder="0"
                            onChangeText={(text) => updateSetValue(setKey, 'reps', text)} />
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
                          />
                        </View>
                      )}
                    </View>

                    <EffortTargetControl
                      value={set.effortTarget}
                      disabled={completed || !canEditPrescription}
                      onChange={(effortTarget) => updateSessionSets(
                        exercise.id,
                        (sets) => sets.map((candidate) => candidate.id === set.id ? { ...candidate, effortTarget } : candidate),
                      )}
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
                        style={[styles.completeBtn, { backgroundColor: theme.primary }]}
                      >
                        <Text style={styles.completeBtnText}>Finalizar serie</Text>
                      </HapticPressable>
                    )}
                  </View>
                );
               })}
               {exercise.sets.some((set) => completedSets[`${exercise.id}-${set.id}`]) ? <Text style={[styles.sessionSetsLockedNote, { color: theme.textMuted }]}>La prescripción queda bloqueada después de completar una serie.</Text> : <View style={styles.sessionAddActions}>
                 <HapticPressable accessibilityLabel={`Agregar serie a ${exercise.name}`} onPress={() => updateSessionSets(exercise.id, (sets) => [...sets, { id: generateId(), tipo: nextEffectiveSessionSetNumber(sets), weight: 0, reps: 0 }])} style={[styles.editSetBtn, { borderColor: theme.glassBorder }]}>
                   <Text style={[styles.editSetBtnText, { color: theme.primary }]}>+ Serie</Text>
                 </HapticPressable>
                 <HapticPressable accessibilityLabel={`Agregar backoff a ${exercise.name}`} onPress={() => addSessionBackoff(exercise.id)} style={[styles.editSetBtn, { borderColor: theme.glassBorder }]}>
                   <Text style={[styles.editSetBtnText, { color: theme.primary }]}>+ Backoff</Text>
                 </HapticPressable>
               </View>}
            </GlassCard>
           </>}
        </DraggableList>

        <Modal
          transparent
          animationType="fade"
          visible={pauseMenuVisible}
          onRequestClose={() => void resumeFromPauseMenu()}
        >
          <View style={styles.pauseMenuBackdrop}>
            <GlassCard style={[styles.pauseMenu, { borderColor: theme.glassBorder, backgroundColor: theme.tabBarBackground }]}>
              <View style={styles.pauseMenuTitleRow}>
                <View style={[styles.pauseMenuDot, { backgroundColor: theme.accent }]} />
                <Text style={[styles.pauseMenuTitle, { color: theme.text }]}>Entrenamiento pausado</Text>
              </View>
              <Text style={[styles.pauseMenuCopy, { color: theme.textMuted }]}>El cronómetro y el descanso están detenidos hasta que elijas cómo continuar.</Text>
              <GlassButton title="Reanudar" onPress={() => void resumeFromPauseMenu()} />
              <GlassButton title="Finalizar entrenamiento" variant="secondary" loading={isFinishing} disabled={isFinishing} onPress={finishFromPauseMenu} />
              <HapticPressable accessibilityRole="button" accessibilityLabel="Cancelar entrenamiento" onPress={() => void cancelFromPauseMenu()} style={styles.pauseCancelButton}>
                <Text style={styles.pauseCancelText}>Cancelar entrenamiento</Text>
              </HapticPressable>
            </GlassCard>
          </View>
        </Modal>

        <ExercisePicker exercises={catalogExercises} routineMuscleGroups={[]} catalogMode visible={pickerVisible} onClose={() => setPickerVisible(false)} onSelect={addSessionExercise} />

        {partnerRecipientId ? <ChatFab recipientId={partnerRecipientId} /> : null}

      </SafeAreaView>
      <ExclusiveSetCelebration active={celebrationNonce} theme={theme} />
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
   timerBar: {
     flexDirection: 'row',
     gap: 10,
   },
   stickyWorkoutStatus: { borderBottomWidth: 1, gap: 8, paddingTop: 8, paddingBottom: 10 },
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
   restColumn: { flex: 1, gap: 2 },
   pauseControl: { alignItems: 'center', alignSelf: 'center', borderRadius: 14, borderWidth: 1, minHeight: 52, justifyContent: 'center', paddingHorizontal: 12 },
   pauseDot: { borderRadius: 8, height: 16, width: 16 },
  cancelLink: { alignSelf: 'flex-end', paddingHorizontal: 4, paddingVertical: 2 },
  cancelLinkText: { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  timerCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  restActive: {
    transform: [{ scale: 1.02 }],
  },
  timerLabel: { fontSize: 12, fontWeight: '600' },
  timerValue: { fontSize: 32, fontWeight: '900', marginTop: 4 },
   progress: { fontSize: 13, fontWeight: '800' },
  addExerciseCard: { gap: 10, marginBottom: 12 },
  addExerciseHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 },
  addExerciseChevron: { fontSize: 22, fontWeight: '700' },
  addExerciseContent: { gap: 10 },
  addExerciseTitle: { fontSize: 16, fontWeight: '800' },
  addExerciseChangeGroup: { fontSize: 13, fontWeight: '800' },
   exerciseList: { flex: 1 },
   exerciseListContent: { paddingBottom: 120 },
   exercisePlaceholder: { borderRadius: 16, borderStyle: 'dashed', borderWidth: 1, gap: 10, marginBottom: 14, padding: 16 },
   exercisePlaceholderHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
   skeletonTitle: { borderRadius: 6, height: 20, flex: 1, opacity: 0.55 },
   skeletonHandle: { borderRadius: 4, height: 20, opacity: 0.45, width: 20 },
   skeletonMetadata: { borderRadius: 5, height: 12, opacity: 0.35, width: '42%' },
   skeletonSet: { borderRadius: 14, borderWidth: 1, gap: 10, padding: 12 },
   skeletonSetLabel: { borderRadius: 5, height: 14, opacity: 0.45, width: '35%' },
   skeletonSetValues: { flexDirection: 'row', gap: 10 },
   skeletonValue: { borderRadius: 8, flex: 1, height: 42, opacity: 0.35 },
   exerciseCard: { marginBottom: 14 },
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
  backoffSetCard: { borderRadius: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: 0, marginBottom: 0 },
  backoffStart: { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderTopWidth: 1, marginTop: 10 },
  backoffEnd: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14, borderBottomWidth: 1, marginBottom: 10 },
  setCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  setTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  completedBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  setTypeHint: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 'auto',
    marginRight: 8,
  },
  sessionSetControls: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  typeControl: { flex: 1, flexDirection: 'row', gap: 6 },
  typeOption: { minWidth: 34, alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 8 },
  removeSetBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  removeSetBtnText: { fontSize: 12, fontWeight: '700' },
   sessionSetsLockedNote: { marginTop: 12, fontSize: 12, textAlign: 'center' },
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
   jointActions: { flexDirection: 'row', gap: 8 },
   pauseMenuBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.54)', flex: 1, justifyContent: 'center', padding: 24 },
   pauseMenu: { alignSelf: 'stretch', gap: 12 },
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
});
