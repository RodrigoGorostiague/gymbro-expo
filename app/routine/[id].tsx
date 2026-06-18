import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { HapticPressable } from '../../components/HapticPressable';
import { GlassButton, GlassInput } from '../../components/UI';
import { ShareRoutineModal } from '../../components/ShareRoutineModal';
import { useData } from '../../context/DataContext';
import { useShare } from '../../context/ShareContext';
import { useTheme } from '../../context/ThemeContext';
import { Exercise, ExerciseSet, Routine } from '../../types';
import { generateId } from '../../utils/storage';

export default function EditRoutineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRoutine, updateRoutine } = useData();
  const { hasPendingShare } = useShare();
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [shareModalVisible, setShareModalVisible] = useState(false);

  useEffect(() => {
    const routine = getRoutine(id);
    if (!routine) {
      router.back();
      return;
    }
    setName(routine.name);
    setExercises(routine.exercises);
  }, [id]);

  const save = () => {
    const routine = getRoutine(id);
    if (!routine) return;
    updateRoutine({ ...routine, name: name.trim() || routine.name, exercises });
    Alert.alert('Guardado', 'Rutina actualizada');
  };

  const addExercise = () => {
    setExercises([
      ...exercises,
      {
        id: generateId(),
        name: '',
        sets: [{ id: generateId(), weight: 0, reps: 0 }],
      },
    ]);
  };

  const updateExercise = (exerciseId: string, patch: Partial<Exercise>) => {
    setExercises(
      exercises.map((e) => (e.id === exerciseId ? { ...e, ...patch } : e)),
    );
  };

  const removeExercise = (exerciseId: string) => {
    setExercises(exercises.filter((e) => e.id !== exerciseId));
  };

  const addSet = (exerciseId: string) => {
    setExercises(
      exercises.map((e) =>
        e.id === exerciseId
          ? {
              ...e,
              sets: [...e.sets, { id: generateId(), weight: 0, reps: 0 }],
            }
          : e,
      ),
    );
  };

  const updateSet = (
    exerciseId: string,
    setId: string,
    patch: Partial<ExerciseSet>,
  ) => {
    setExercises(
      exercises.map((e) =>
        e.id === exerciseId
          ? {
              ...e,
              sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
            }
          : e,
      ),
    );
  };

  const removeSet = (exerciseId: string, setId: string) => {
    setExercises(
      exercises.map((e) =>
        e.id === exerciseId
          ? { ...e, sets: e.sets.filter((s) => s.id !== setId) }
          : e,
      ),
    );
  };

  const routine = getRoutine(id);
  const canShare = routine && !routine.isShared && !hasPendingShare(routine.name);

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppNavBar
          onBack={() => router.back()}
          trailing={
            <View style={styles.trailing}>
              <HapticPressable
                onPress={() => setShareModalVisible(true)}
                disabled={!canShare}
                style={{ opacity: canShare ? 1 : 0.4, marginRight: 12 }}
              >
                <Text style={{ fontSize: 20 }}>🔗</Text>
              </HapticPressable>
              <HapticPressable onPress={() => router.push(`/routine/execute/${id}`)}>
                <Text style={{ color: theme.primary, fontWeight: '800' }}>▶ Ejecutar</Text>
              </HapticPressable>
            </View>
          }
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <Text style={[styles.screenTitle, { color: theme.text }]}>Editar Rutina</Text>
          <Text style={[styles.screenSubtitle, { color: theme.textMuted }]}>
            Ejercicios y series
          </Text>
          <GlassCard style={styles.nameCard}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Nombre</Text>
            <GlassInput value={name} onChangeText={setName} placeholder="Nombre de la rutina" />
          </GlassCard>

          {exercises.map((exercise, exIndex) => (
            <GlassCard key={exercise.id} style={styles.exerciseCard}>
              <View style={styles.exerciseHeader}>
                <Text style={[styles.exerciseNum, { color: theme.primary }]}>
                  {exIndex + 1}
                </Text>
                <GlassInput
                  style={styles.exerciseNameInput}
                  placeholder="Nombre del ejercicio"
                  value={exercise.name}
                  onChangeText={(text) => updateExercise(exercise.id, { name: text })}
                />
                <HapticPressable onPress={() => removeExercise(exercise.id)}>
                  <Text style={{ color: theme.textMuted }}>✕</Text>
                </HapticPressable>
              </View>

              <View style={styles.setHeader}>
                <Text style={[styles.setCol, { color: theme.textMuted }]}>Serie</Text>
                <Text style={[styles.setCol, { color: theme.textMuted }]}>Peso</Text>
                <Text style={[styles.setCol, { color: theme.textMuted }]}>Reps</Text>
                <View style={{ width: 28 }} />
              </View>

              {exercise.sets.map((set, setIndex) => (
                <View key={set.id} style={styles.setRow}>
                  <Text style={[styles.setNum, { color: theme.text }]}>{setIndex + 1}</Text>
                  <GlassInput
                    style={styles.setInput}
                    keyboardType="numeric"
                    value={set.weight ? String(set.weight) : ''}
                    placeholder="kg"
                    onChangeText={(t) =>
                      updateSet(exercise.id, set.id, { weight: parseFloat(t) || 0 })
                    }
                  />
                  <GlassInput
                    style={styles.setInput}
                    keyboardType="numeric"
                    value={set.reps ? String(set.reps) : ''}
                    placeholder="reps"
                    onChangeText={(t) =>
                      updateSet(exercise.id, set.id, { reps: parseInt(t, 10) || 0 })
                    }
                  />
                  <HapticPressable onPress={() => removeSet(exercise.id, set.id)}>
                    <Text style={{ color: theme.textMuted }}>−</Text>
                  </HapticPressable>
                </View>
              ))}

              <HapticPressable
                onPress={() => addSet(exercise.id)}
                style={[styles.addSetBtn, { borderColor: theme.glassBorder }]}
              >
                <Text style={{ color: theme.primary, fontWeight: '600' }}>+ Serie</Text>
              </HapticPressable>
            </GlassCard>
          ))}

          <GlassButton title="+ Agregar ejercicio" onPress={addExercise} variant="secondary" />
          <View style={styles.spacer} />
          <GlassButton title="Guardar rutina" onPress={save} />
          </ScrollView>
        </KeyboardAvoidingView>
        <ShareRoutineModal
          visible={shareModalVisible}
          routine={routine ?? null}
          onClose={() => setShareModalVisible(false)}
        />
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  scroll: { paddingBottom: 40 },
  screenTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: 13,
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  nameCard: { marginBottom: 16 },
  label: { fontSize: 13, marginBottom: 8 },
  exerciseCard: { marginBottom: 12 },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  exerciseNum: {
    fontSize: 18,
    fontWeight: '800',
    width: 24,
  },
  exerciseNameInput: { flex: 1 },
  setHeader: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  setCol: { flex: 1, fontSize: 12, fontWeight: '600' },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  setNum: { width: 24, textAlign: 'center', fontWeight: '600' },
  setInput: { flex: 1, paddingVertical: 8 },
  addSetBtn: {
    borderWidth: 1,
    borderRadius: 10,
    borderStyle: 'dashed',
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  spacer: { height: 12 },
  trailing: { flexDirection: 'row', alignItems: 'center' },
});
