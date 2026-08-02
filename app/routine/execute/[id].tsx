import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../../components/AppNavBar';
import { AppScreenHeader } from '../../../components/AppScreenHeader';
import { ExclusiveSetCelebration } from '../../../components/ExclusiveSetCelebration';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { HapticPressable } from '../../../components/HapticPressable';
import { ProfileAvatar } from '../../../components/ProfileAvatar';
import { GlassButton, GlassInput } from '../../../components/UI';
import { getRandomSetEncouragementMessage } from '../../../constants/encouragement';
import { useAuth } from '../../../context/AuthContext';
import { useData } from '../../../context/DataContext';
import { useShop } from '../../../context/ShopContext';
import { useTheme } from '../../../context/ThemeContext';
import { useSocial } from '../../../context/SocialContext';
import { CompletedExercise, CompletedSet, Routine, SetType, WorkoutAttempt } from '../../../types';
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
import { addJointWorkoutParticipant, completedJointWorkoutInput, createJointWorkout, finishJointWorkout, JointAction, JointParticipant, listJointWorkoutActions, listJointWorkouts, sendJointWorkoutAction } from '../../../services/jointWorkouts';
import { PublicProfile } from '../../../services/socialGraph';
import { getShopTheme } from '../../../constants/shopThemes';
import { LinearGradient } from 'expo-linear-gradient';

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
  const values: Record<SetKey, SetRuntimeValues> = {};
  for (const exercise of routine.exercises) {
    for (const set of exercise.sets) {
      const key = `${exercise.id}-${set.id}`;
      values[key] = {
        weight: set.weight ? String(set.weight) : '',
        reps: isFailureSet(set.tipo) ? '0' : set.reps ? String(set.reps) : '',
      };
    }
  }
  return values;
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
  const { circle } = useSocial();
  const { getRoutine, addAttempt, mesocycles, activeWorkoutDraft, startActiveWorkout, updateActiveWorkout, cancelActiveWorkout, refreshActiveWorkoutTiming = async () => undefined } = useData();
  const { theme } = useTheme();
  const routine = getRoutine(id);
  const parsedLineage = parseLineage(params);
  const lineageValidation = validateMesocycleExecutionLineage(mesocycles, id, parsedLineage, readSingleParam(params.mesocycleId));
  const lineage = lineageValidation.valid ? lineageValidation.lineage : undefined;
  const initialJointWorkoutId = readSingleParam(params.jointWorkoutId);

  const [phase, setPhase] = useState<'setup' | 'active' | 'done'>('setup');
  const [restSeconds, setRestSeconds] = useState('90');
  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [completedSets, setCompletedSets] = useState<Record<SetKey, boolean>>({});
  const [setValues, setSetValues] = useState<Record<SetKey, SetRuntimeValues>>({});
  const [isFinishing, setIsFinishing] = useState(false);
  const [earnedGems, setEarnedGems] = useState(0);
  const [rewardReceipt, setRewardReceipt] = useState<RewardReceipt | null>(null);
  const [celebrationNonce, setCelebrationNonce] = useState(0);
  const [jointWorkoutId, setJointWorkoutId] = useState<string | null>(initialJointWorkoutId ?? null);
  const [jointTargets, setJointTargets] = useState<JointParticipant[]>([]);
  const [jointInviteCandidates, setJointInviteCandidates] = useState<PublicProfile[]>([]);
  const [selectedJointInviteIds, setSelectedJointInviteIds] = useState<string[]>([]);
  const [jointActions, setJointActions] = useState<JointAction[]>([]);
  const [isJointBusy, setJointBusy] = useState(false);

  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const completingSetsRef = useRef(new Set<SetKey>());
  const finishInFlightRef = useRef(false);
  const attemptRef = useRef<WorkoutAttempt | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const restEndsAtMsRef = useRef<number | null>(null);
  const restCompletionAlertedRef = useRef(false);
  const reconcileElapsedRef = useRef<() => void>(() => undefined);
  const handleRestCompleteRef = useRef<() => void>(() => undefined);
  const refreshActiveWorkoutTimingRef = useRef(refreshActiveWorkoutTiming);
  const restTimerConfig = parseInt(restSeconds, 10) || 90;

  useEffect(() => {
    if (!routine) router.back();
  }, [routine]);

  useEffect(() => {
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (restRef.current) clearInterval(restRef.current);
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
    if (!routine || !activeWorkoutDraft || !matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: routine.id, ...(lineage ? { lineage } : {}) }) || phase !== 'setup') return;
    attemptIdRef.current = activeWorkoutDraft.attemptId;
    startTimeRef.current = activeWorkoutDraft.startedAtMs;
    setRestSeconds(String(activeWorkoutDraft.restTimerSeconds));
    setSetValues(activeWorkoutDraft.setValues);
    setCompletedSets(activeWorkoutDraft.completedSets);
    const timing = reconcileActiveWorkoutTiming(activeWorkoutDraft, Date.now());
    setRestRemaining(timing.restRemainingSeconds);
    setIsResting(timing.isResting);
    setElapsed(timing.elapsedSeconds);
    setPhase('active');
  }, [activeWorkoutDraft, lineage, phase, routine, user]);

  useEffect(() => {
    if (phase === 'active' && attemptIdRef.current && !activeWorkoutDraft) setPhase('setup');
  }, [activeWorkoutDraft, phase]);

  useEffect(() => {
    if (phase !== 'active' || !jointWorkoutId) return;
    void loadJointState().catch(() => undefined);
  }, [jointWorkoutId, phase]);

  const handleRestComplete = useCallback(() => {
    if (restCompletionAlertedRef.current) return;
    restCompletionAlertedRef.current = true;
    restEndsAtMsRef.current = null;
    setIsResting(false);
    setRestRemaining(0);
    vibrateRestTimerComplete();
    Alert.alert(
      'Descanso terminado',
      'Continúa con la próxima serie.',
      [{ text: 'Entendido' }],
    );
  }, []);
  handleRestCompleteRef.current = handleRestComplete;

  const startRestTimer = useCallback(() => {
    if (restRef.current) clearInterval(restRef.current);
    const restEndsAtMs = Date.now() + restTimerConfig * 1000;
    restEndsAtMsRef.current = restEndsAtMs;
    restCompletionAlertedRef.current = false;
    setRestRemaining(restTimerConfig);
    setIsResting(true);
    if (activeWorkoutDraft) void updateActiveWorkout({ ...activeWorkoutDraft, restEndsAtMs });
    restRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((restEndsAtMs - Date.now()) / 1000));
      if (remaining === 0) {
        if (restRef.current) clearInterval(restRef.current);
        void refreshActiveWorkoutTiming();
        handleRestComplete();
      }
      setRestRemaining(remaining);
    }, 1000);
  }, [activeWorkoutDraft, restTimerConfig, handleRestComplete, refreshActiveWorkoutTiming, updateActiveWorkout]);

  const startWorkout = async () => {
    if (!routine || !user || !lineageValidation.valid) return;
    const values = buildSetValues(routine);
    const attemptId = generateId();
    await startActiveWorkout({ version: 1, owner: user, attemptId, routineId: routine.id, lineage, startedAtMs: Date.now(), restTimerSeconds: restTimerConfig, completedSets: {}, setValues: values });
    setSetValues(values);
    setCompletedSets({});
    attemptIdRef.current = attemptId;
    attemptRef.current = null;
    setPhase('active');
    startTimeRef.current = Date.now();
  };

  const loadJointState = async (workoutId = jointWorkoutId) => {
    if (!workoutId) return;
    const [sessions, actions] = await Promise.all([listJointWorkouts(), listJointWorkoutActions(workoutId)]);
    const current = sessions.find((session) => session.id === workoutId);
    setJointTargets(current?.participants.filter((participant) => !participant.isSelf && participant.status !== 'declined') ?? []);
    setJointActions(actions);
  };

  const toggleJointInviteCandidate = (profileId: string) => {
    if (isJointBusy) return;
    setSelectedJointInviteIds((current) => current.includes(profileId)
      ? current.filter((id) => id !== profileId)
      : current.length < (jointWorkoutId ? Math.max(0, 3 - jointTargets.length) : 3)
        ? [...current, profileId]
        : current);
  };

  const inviteSelectedToJointWorkout = async () => {
    if (!routine || phase !== 'active' || !selectedJointInviteIds.length) return;
    const selected = jointInviteCandidates.filter((profile) => selectedJointInviteIds.includes(profile.uid));
    if (!selected.length) return;
    setJointBusy(true);
    const successfulIds = new Set<string>();
    let activeWorkoutId = jointWorkoutId;
    try {
      for (const profile of selected) {
        try {
          if (activeWorkoutId) {
            await addJointWorkoutParticipant(activeWorkoutId, profile.uid);
          } else {
            activeWorkoutId = await createJointWorkout(profile.uid, routine);
            setJointWorkoutId(activeWorkoutId);
            router.setParams({ jointWorkoutId: activeWorkoutId });
          }
          successfulIds.add(profile.uid);
        } catch {
          // Keep failed recipients selected so the user can retry them together.
        }
      }
      setSelectedJointInviteIds((current) => current.filter((id) => !successfulIds.has(id)));
      setJointInviteCandidates((current) => current.filter((profile) => !successfulIds.has(profile.uid)));
      if (activeWorkoutId) await loadJointState(activeWorkoutId);
      const failedCount = selected.length - successfulIds.size;
      if (!failedCount) Alert.alert('Invitaciones enviadas', `${successfulIds.size} ${successfulIds.size === 1 ? 'persona fue invitada' : 'personas fueron invitadas'} a entrenar con vos.`);
      else Alert.alert(successfulIds.size ? 'Invitaciones parciales' : 'No se pudo invitar', successfulIds.size
        ? `Se enviaron ${successfulIds.size} de ${selected.length} invitaciones. Las restantes siguen seleccionadas para reintentar.`
        : 'No se pudo enviar ninguna invitación. Intentá nuevamente.');
    } finally { setJointBusy(false); }
  };

  const openJointInvite = async () => {
    if (phase !== 'active') return;
    setJointBusy(true);
    try {
      const page = await circle();
      const existing = new Set(jointTargets.map((participant) => participant.id));
      setJointInviteCandidates(page.profiles.filter((profile) => !existing.has(profile.uid)));
      setSelectedJointInviteIds([]);
    } catch (error) {
      Alert.alert('No se pudieron cargar tus conexiones', error instanceof Error ? error.message : 'Intentá nuevamente.');
    } finally { setJointBusy(false); }
  };

  const sendJointAction = async (recipientId: string, action: 'push' | 'nice_set' | 'finish_strong' | 'partner_proud') => {
    if (!jointWorkoutId) return;
    setJointBusy(true);
    try { await sendJointWorkoutAction(jointWorkoutId, recipientId, action); await loadJointState(); }
    catch (error) { Alert.alert('No se pudo enviar', error instanceof Error ? error.message : 'Intentá nuevamente.'); }
    finally { setJointBusy(false); }
  };

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
        return next;
      });
      if (theme.interaction === 'set-celebration') setCelebrationNonce((value) => value + 1);
      Alert.alert('¡Serie!', getRandomSetEncouragementMessage(), [{ text: '¡Vamos!' }]);
      startRestTimer();
    } finally {
      completingSetsRef.current.delete(setKey);
    }
  };

  const finishWorkout = async (jointVisibility?: 'public' | 'circle' | 'private') => {
    if (!routine || finishInFlightRef.current) return;
    finishInFlightRef.current = true;
    setIsFinishing(true);

    if (elapsedRef.current) clearInterval(elapsedRef.current);
    if (restRef.current) clearInterval(restRef.current);

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
        results: Object.fromEntries(exercises.flatMap((exercise) => exercise.sets.map((set) =>
          [`${exercise.exerciseId}:${set.setId}`, { performed: set.completed, reps: set.reps, load: set.weight }]))),
      });
      attemptRef.current = attempt;
      const receipt = await addAttempt(attempt);
      if (jointWorkoutId) await finishJointWorkout(jointWorkoutId, jointVisibility ?? 'circle', completedJointWorkoutInput(routine, elapsed, exercises));
      setRewardReceipt(receipt);
      setEarnedGems(receiptTotal(receipt));
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

  const handleFinishConfirm = () => {
    if (jointWorkoutId) {
      Alert.alert('Finalizar entrenamiento conjunto', 'Elegí quién puede ver tu rutina dentro de la publicación conjunta.', [
        { text: 'Seguir', style: 'cancel' },
        { text: 'Público', onPress: () => void finishWorkout('public') },
        { text: 'Mi círculo', onPress: () => void finishWorkout('circle') },
        { text: 'Privado', onPress: () => void finishWorkout('private') },
      ]);
      return;
    }
    Alert.alert('Finalizar entrenamiento', '¿Terminaste el entrenamiento?', [
      { text: 'Seguir', style: 'cancel' },
      { text: 'Finalizar', onPress: () => void finishWorkout() },
    ]);
  };

  if (!routine) return null;

  if (!lineageValidation.valid) {
    const message = lineageValidation.reason === 'inactive-mesocycle'
      ? 'Este mesociclo ya no está activo. Actualizá o reabrí el mesociclo antes de entrenar esta sesión.'
      : 'La sesión programada ya no está disponible. Actualizá o reabrí el mesociclo antes de entrenar.';
    return <ThemeBackground><SafeAreaView style={[styles.safe, styles.center]}><GlassCard style={styles.doneCard}><Text style={[styles.doneTitle, { color: theme.text }]}>Sesión desactualizada</Text><Text style={[styles.doneMeta, { color: theme.textMuted }]}>{message}</Text><View style={styles.spacer} /><GlassButton title={lineageValidation.mesocycleId ? 'Volver al mesociclo' : 'Volver a rutinas'} onPress={() => lineageValidation.mesocycleId ? router.replace(`/mesocycle/summary/${lineageValidation.mesocycleId}`) : router.replace('/(tabs)/routines')} /></GlassCard></SafeAreaView></ThemeBackground>;
  }

  if (phase === 'setup') {
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
          <GlassButton title="Iniciar entrenamiento" onPress={startWorkout} />
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
  const jointInviteLimit = jointWorkoutId ? Math.max(0, 3 - jointTargets.length) : 3;
  const selectedJointInviteCount = selectedJointInviteIds.length;

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.timerBar}>
          <GlassCard style={styles.timerCard}>
            <Text style={[styles.timerLabel, { color: theme.textMuted }]}>Cronómetro</Text>
            <Text style={[styles.timerValue, { color: theme.text }]}>
              {formatTime(elapsed)}
            </Text>
          </GlassCard>
          <GlassCard style={[styles.timerCard, isResting ? styles.restActive : undefined]}>
            <Text style={[styles.timerLabel, { color: theme.textMuted }]}>Descanso</Text>
            <Text
              style={[
                styles.timerValue,
                { color: isResting ? theme.accent : theme.textMuted },
              ]}
            >
              {isResting ? formatTime(restRemaining) : formatTime(restTimerConfig)}
            </Text>
          </GlassCard>
        </View>

        <Text style={[styles.progress, { color: theme.textMuted }]}>
          Series completadas: {doneSets}/{totalSets}
        </Text>
        <GlassCard style={styles.jointCard}>
          <Text style={[styles.jointTitle, { color: theme.text }]}>Entrenamiento conjunto</Text>
          {!jointWorkoutId ? <>
            <Text style={{ color: theme.textMuted }}>Invitá a un Bro o Partner mientras esta rutina está activa.</Text>
            <GlassButton title="Invitar a entrenar juntos" variant="secondary" loading={isJointBusy} disabled={isJointBusy} onPress={() => void openJointInvite()} />
          </> : <>
            <Text style={{ color: theme.textMuted }}>Sesión conjunta activa. Las acciones se envían sólo a conexiones actuales.</Text>
            <GlassButton title="Actualizar grupo" variant="secondary" disabled={isJointBusy} onPress={() => void loadJointState()} />
            <GlassButton title="Agregar Bro o Partner" variant="secondary" disabled={isJointBusy || jointTargets.length >= 3} onPress={() => void openJointInvite()} />
            {jointTargets.map((target) => <View key={target.id} style={styles.jointTarget}><Text style={{ color: theme.text }}>{target.alias} · {target.status}</Text><View style={styles.jointActions}><GlassButton title="¡Dale!" variant="secondary" disabled={isJointBusy} onPress={() => void sendJointAction(target.id, 'push')} /><GlassButton title="Buena serie" variant="secondary" disabled={isJointBusy} onPress={() => void sendJointAction(target.id, 'nice_set')} />{target.relationshipKind === 'partner' ? <GlassButton title="Orgulloso de vos" variant="secondary" disabled={isJointBusy} onPress={() => void sendJointAction(target.id, 'partner_proud')} /> : null}</View></View>)}
            {jointActions.slice(0, 2).map((action) => <Text key={action.id} style={{ color: theme.textMuted }}>Acción: {action.action.replace('_', ' ')}</Text>)}
          </>}
          {jointInviteCandidates.length && jointInviteLimit > 0 ? <View style={styles.jointInviteList}><Text style={{ color: theme.textMuted }}>Elegí hasta {jointInviteLimit} {jointInviteLimit === 1 ? 'persona' : 'personas'} para invitar juntas.</Text>{jointInviteCandidates.map((profile) => {
            const recipientTheme = getShopTheme(profile.presentationThemeId ?? '') ?? getShopTheme('profile-rodaja')!;
            const selected = selectedJointInviteIds.includes(profile.uid);
            const selectionFull = !selected && selectedJointInviteCount >= jointInviteLimit;
            return <Pressable key={profile.uid} accessibilityRole="checkbox" accessibilityLabel={`Invitar a ${profile.alias}`} accessibilityState={{ selected, disabled: isJointBusy || selectionFull }} disabled={isJointBusy || selectionFull} onPress={() => toggleJointInviteCandidate(profile.uid)}><GlassCard style={[styles.jointInviteMember, selected && styles.jointInviteMemberSelected]}><LinearGradient colors={[recipientTheme.primary, recipientTheme.accent, recipientTheme.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.jointInviteBanner}><ProfileAvatar avatarId={profile.avatarId} size={48} borderColor="rgba(255,255,255,0.7)" /><View style={styles.jointInviteCopy}><Text style={styles.jointInviteAlias}>{profile.alias}</Text><Text style={styles.jointInviteRelationship}>{profile.relationshipStatus === 'partner' ? 'Partner' : 'Bro'}</Text></View>{selected ? <View style={styles.jointInviteSelectedBadge}><Text style={styles.jointInviteSelectedBadgeText}>Seleccionado</Text></View> : null}</LinearGradient><View style={styles.jointInviteChips}>{Object.entries(profile.categories).map(([key, value]) => <View key={key} accessibilityLabel={`${key}: ${value}`} style={styles.jointInviteChip}><Text style={styles.jointInviteChipText}>{value}</Text></View>)}</View></GlassCard></Pressable>;
          })}<View style={styles.jointInviteAction}><Text style={[styles.jointInviteCount, { color: theme.textMuted }]}>{selectedJointInviteCount} {selectedJointInviteCount === 1 ? 'persona seleccionada' : 'personas seleccionadas'}</Text><GlassButton title={`Invitar a ${selectedJointInviteCount} ${selectedJointInviteCount === 1 ? 'persona' : 'personas'}`} loading={isJointBusy} disabled={isJointBusy || !selectedJointInviteCount} onPress={() => void inviteSelectedToJointWorkout()} /></View></View> : null}
        </GlassCard>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {routine.exercises.map((exercise, exIndex) => (
            <GlassCard key={exercise.id} style={styles.exerciseCard}>
              <Text style={[styles.exerciseName, { color: theme.text }]}>
                {exIndex + 1}. {exercise.name || 'Sin nombre'}
              </Text>

              {exercise.sets.map((set, setIndex) => {
                const setKey = `${exercise.id}-${set.id}`;
                const completed = !!completedSets[setKey];
                const values = setValues[setKey] ?? { weight: '', reps: '' };

                return (
                  <View
                    key={set.id}
                    style={[
                      styles.setCard,
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
                        {isFailureSet(set.tipo) ? 'Sin repeticiones' : `Bloque ${setIndex + 1}`}
                      </Text>
                      {completed && (
                        <View style={[styles.completedBadge, { backgroundColor: theme.success }]}> 
                          <Text style={styles.completedBadgeText}>✓ Hecha</Text>
                        </View>
                      )}
                    </View>

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

                    {!completed && (
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
            </GlassCard>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <GlassButton
            title="Finalizar entrenamiento"
            onPress={handleFinishConfirm}
            loading={isFinishing}
            disabled={isFinishing}
          />
          <GlassButton title="Cancelar entrenamiento" variant="secondary" onPress={() => { void cancelActiveWorkout(); router.back(); }} />
        </View>
      </SafeAreaView>
      <ExclusiveSetCelebration active={celebrationNonce} theme={theme} />
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
    marginTop: 8,
    marginBottom: 8,
  },
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
  progress: { textAlign: 'center', marginBottom: 12, fontSize: 13 },
  scroll: { paddingBottom: 100 },
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
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
  },
  jointCard: { gap: 10, marginBottom: 12 },
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
  center: { justifyContent: 'center', padding: 20 },
  doneCard: { alignItems: 'center', padding: 32 },
  doneEmoji: { fontSize: 48, marginBottom: 12 },
  doneTitle: { fontSize: 22, fontWeight: '800' },
  doneMeta: { marginTop: 8, fontSize: 16 },
  doneGems: { marginTop: 6, fontSize: 15, fontWeight: '700' },
  receipt: { alignSelf: 'stretch', marginTop: 14, gap: 4 },
  receiptLine: { fontSize: 13, textTransform: 'capitalize' },
  receiptBalance: { marginTop: 4, fontSize: 14, fontWeight: '700' },
});
