import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../../components/AppNavBar';
import { AppScreenHeader } from '../../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { HapticPressable } from '../../../components/HapticPressable';
import { GlassButton, GlassInput } from '../../../components/UI';
import { getRandomSetEncouragementMessage } from '../../../constants/encouragement';
import { GEM_REWARDS } from '../../../constants/shopThemes';
import { useData } from '../../../context/DataContext';
import { useShop } from '../../../context/ShopContext';
import { useTheme } from '../../../context/ThemeContext';
import { CompletedExercise, CompletedSet, Routine } from '../../../types';
import { vibrateRestTimerComplete } from '../../../utils/haptics';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
        reps: set.reps ? String(set.reps) : '',
      };
    }
  }
  return values;
}

export default function ExecuteRoutineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRoutine, addSession } = useData();
  const { awardGems } = useShop();
  const { theme } = useTheme();
  const routine = getRoutine(id);

  const [phase, setPhase] = useState<'setup' | 'active' | 'done'>('setup');
  const [restSeconds, setRestSeconds] = useState('90');
  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [completedSets, setCompletedSets] = useState<Record<SetKey, boolean>>({});
  const [setValues, setSetValues] = useState<Record<SetKey, SetRuntimeValues>>({});

  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
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

  const handleRestComplete = useCallback(() => {
    setIsResting(false);
    setRestRemaining(0);
    vibrateRestTimerComplete();
    Alert.alert(
      'Descanso terminado',
      'Continúa con la próxima serie.',
      [{ text: 'Entendido' }],
    );
  }, []);

  const startRestTimer = useCallback(() => {
    if (restRef.current) clearInterval(restRef.current);
    setRestRemaining(restTimerConfig);
    setIsResting(true);
    restRef.current = setInterval(() => {
      setRestRemaining((prev) => {
        if (prev <= 1) {
          if (restRef.current) clearInterval(restRef.current);
          handleRestComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [restTimerConfig, handleRestComplete]);

  const startWorkout = () => {
    if (!routine) return;
    setSetValues(buildSetValues(routine));
    setCompletedSets({});
    setPhase('active');
    startTimeRef.current = Date.now();
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  };

  const updateSetValue = (setKey: SetKey, field: keyof SetRuntimeValues, value: string) => {
    if (completedSets[setKey]) return;
    setSetValues((prev) => ({
      ...prev,
      [setKey]: { ...prev[setKey], [field]: value },
    }));
  };

  const completeSet = (setKey: SetKey) => {
    if (completedSets[setKey]) return;

    const values = setValues[setKey];
    const weight = parseFloat(values?.weight ?? '0');
    const reps = parseInt(values?.reps ?? '0', 10);

    if (!weight || !reps) {
      Alert.alert('Datos incompletos', 'Ingresa peso y repeticiones antes de finalizar la serie.');
      return;
    }

    setCompletedSets((prev) => ({ ...prev, [setKey]: true }));
    awardGems(GEM_REWARDS.setComplete);
    Alert.alert('¡Serie!', getRandomSetEncouragementMessage(), [{ text: '¡Vamos!' }]);
    startRestTimer();
  };

  const finishWorkout = () => {
    if (!routine) return;

    if (elapsedRef.current) clearInterval(elapsedRef.current);
    if (restRef.current) clearInterval(restRef.current);

    const exercises: CompletedExercise[] = routine.exercises.map((exercise) => ({
      exerciseId: exercise.id,
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

    addSession({
      routineId: routine.id,
      routineName: routine.name,
      completedAt: new Date().toISOString(),
      durationSeconds: elapsed,
      restTimerSeconds: restTimerConfig,
      exercises,
    });

    awardGems(GEM_REWARDS.routineComplete);
    setPhase('done');
  };

  const handleFinishConfirm = () => {
    Alert.alert('Finalizar rutina', '¿Terminaste la rutina?', [
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
          <AppScreenHeader title={routine.name} subtitle="Configura antes de iniciar" />
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
          <GlassButton title="Iniciar cronómetro" onPress={startWorkout} />
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
            <Text style={[styles.doneTitle, { color: theme.text }]}>¡Rutina completada!</Text>
            <Text style={[styles.doneMeta, { color: theme.textMuted }]}>
              Tiempo: {formatTime(elapsed)}
            </Text>
            <Text style={[styles.doneGems, { color: theme.primary }]}>
              +{GEM_REWARDS.routineComplete} gemas
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
                        Serie {setIndex + 1}
                      </Text>
                      {completed && (
                        <View style={[styles.completedBadge, { backgroundColor: theme.success }]}>
                          <Text style={styles.completedBadgeText}>✓ Hecha</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.inputRow}>
                      <View style={styles.inputGroup}>
                        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Peso (kg)</Text>
                        <GlassInput
                          style={styles.setInput}
                          keyboardType="decimal-pad"
                          value={values.weight}
                          editable={!completed}
                          placeholder="0"
                          onChangeText={(text) => updateSetValue(setKey, 'weight', text)}
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Reps</Text>
                        <GlassInput
                          style={styles.setInput}
                          keyboardType="number-pad"
                          value={values.reps}
                          editable={!completed}
                          placeholder="0"
                          onChangeText={(text) => updateSetValue(setKey, 'reps', text)}
                        />
                      </View>
                    </View>

                    {!completed && (
                      <HapticPressable
                        onPress={() => completeSet(setKey)}
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
          <GlassButton title="Finalizar rutina" onPress={handleFinishConfirm} />
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
