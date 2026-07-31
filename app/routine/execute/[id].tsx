import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../../components/AppNavBar';
import { AppScreenHeader } from '../../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { HapticPressable } from '../../../components/HapticPressable';
import { GlassButton, GlassInput } from '../../../components/UI';
import { getRandomSetEncouragementMessage } from '../../../constants/encouragement';
import { useAuth } from '../../../context/AuthContext';
import { useData } from '../../../context/DataContext';
import { useShop } from '../../../context/ShopContext';
import { useTheme } from '../../../context/ThemeContext';
import { CompletedExercise, CompletedSet, Routine, SetType, WorkoutAttempt } from '../../../types';
import { vibrateRestTimerComplete } from '../../../utils/haptics';
import { generateId } from '../../../utils/storage';
import { createWorkoutAttempt } from '../../../utils/workoutAttempts';
import { matchesActiveWorkout } from '../../../utils/activeWorkoutReentry';
import { reconcileActiveWorkoutTiming } from '../../../utils/activeWorkoutTiming';

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
  const weekNumber = rawWeekNumber ? Number.parseInt(rawWeekNumber, 10) : Number.NaN;

  if (!mesocycleId && !plannedSessionId && !rawWeekNumber) return undefined;
  if (!mesocycleId || !plannedSessionId || !Number.isInteger(weekNumber) || weekNumber <= 0) return undefined;

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
  }>();
  const id = readSingleParam(params.id) ?? '';
  const { user } = useAuth();
  const { getRoutine, addAttempt, activeWorkoutDraft, startActiveWorkout, updateActiveWorkout, cancelActiveWorkout, refreshActiveWorkoutTiming = async () => undefined } = useData();
  const { retryPendingRewards } = useShop();
  const { theme } = useTheme();
  const routine = getRoutine(id);
  const lineage = parseLineage(params);

  const [phase, setPhase] = useState<'setup' | 'active' | 'done'>('setup');
  const [restSeconds, setRestSeconds] = useState('90');
  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [completedSets, setCompletedSets] = useState<Record<SetKey, boolean>>({});
  const [setValues, setSetValues] = useState<Record<SetKey, SetRuntimeValues>>({});
  const [isFinishing, setIsFinishing] = useState(false);
  const [earnedGems, setEarnedGems] = useState(0);

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
    if (!routine || !user) return;
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
      Alert.alert('¡Serie!', getRandomSetEncouragementMessage(), [{ text: '¡Vamos!' }]);
      startRestTimer();
    } finally {
      completingSetsRef.current.delete(setKey);
    }
  };

  const finishWorkout = async () => {
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
      await addAttempt(attempt);
      await cancelActiveWorkout();
      await retryPendingRewards();
      setEarnedGems(attempt.reward.totalGems);
      setPhase('done');
    } catch {
      Alert.alert(
        'No se pudo guardar el entrenamiento',
        'El entrenamiento no se completó. Revisa el almacenamiento e inténtalo de nuevo.',
      );
    } finally {
      finishInFlightRef.current = false;
      setIsFinishing(false);
    }
  };

  const handleFinishConfirm = () => {
    Alert.alert('Finalizar entrenamiento', '¿Terminaste el entrenamiento?', [
      { text: 'Seguir', style: 'cancel' },
      { text: 'Finalizar', onPress: finishWorkout },
    ]);
  };

  if (!routine) return null;

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
  center: { justifyContent: 'center', padding: 20 },
  doneCard: { alignItems: 'center', padding: 32 },
  doneEmoji: { fontSize: 48, marginBottom: 12 },
  doneTitle: { fontSize: 22, fontWeight: '800' },
  doneMeta: { marginTop: 8, fontSize: 16 },
  doneGems: { marginTop: 6, fontSize: 15, fontWeight: '700' },
});
