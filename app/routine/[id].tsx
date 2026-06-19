import React, { useEffect, useRef, useState } from 'react';
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
import { ExercisePicker } from '../../components/ExercisePicker';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { HapticPressable } from '../../components/HapticPressable';
import { GlassButton, GlassInput } from '../../components/UI';
import { MUSCLE_GROUP_LABELS } from '../../constants/muscleGroups';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { Exercise, ExerciseSet, MuscleGroup, RoutineExercise } from '../../types';
import { generateId } from '../../utils/storage';

export default function EditRoutineScreen() {
  const { id, addExerciseId } = useLocalSearchParams<{ id: string; addExerciseId?: string }>();
  const {
    exercises: catalogExercises,
    getExercise,
    getRoutine,
    updateRoutine,
  } = useData();
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [exercises, setExercises] = useState<RoutineExercise[]>([]);
  const [routineMuscleGroups, setRoutineMuscleGroups] = useState<MuscleGroup[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const handledAutoAddId = useRef<string | null>(null);

  const createRoutineExercise = (exercise: Exercise): RoutineExercise => ({
    id: generateId(),
    catalogExerciseId: exercise.id,
    name: exercise.name,
    muscleGroups: [...exercise.muscleGroups],
    variant: exercise.variant,
    sets: exercise.defaultSets.map((set) => ({
      id: generateId(),
      tipo: set.tipo,
      weight: set.weight,
      reps: set.reps,
    })),
  });

  useEffect(() => {
    const routine = getRoutine(id);
    if (!routine) {
      router.back();
      return;
    }

    setName(routine.name);
    setExercises(routine.exercises);
    setRoutineMuscleGroups(routine.muscleGroups ?? []);
  }, [getRoutine, id]);

  useEffect(() => {
    if (!addExerciseId || handledAutoAddId.current === addExerciseId) return;

    const exercise = getExercise(addExerciseId);
    if (!exercise) return;

    handledAutoAddId.current = addExerciseId;
    setExercises((current) => [...current, createRoutineExercise(exercise)]);
    router.setParams({ addExerciseId: undefined });
  }, [addExerciseId, getExercise]);

  const save = () => {
    const routine = getRoutine(id);
    if (!routine) return;

    updateRoutine({
      ...routine,
      name: name.trim() || routine.name,
      exercises,
    });
    Alert.alert('Guardado', 'Rutina actualizada');
  };

  const addExerciseFromCatalog = (exercise: Exercise) => {
    setExercises((current) => [...current, createRoutineExercise(exercise)]);
    setPickerVisible(false);
  };

  const removeExercise = (exerciseId: string) => {
    setExercises((current) => current.filter((exercise) => exercise.id !== exerciseId));
  };

  const addSet = (exerciseId: string) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: [
                ...exercise.sets,
                {
                  id: generateId(),
                  tipo: exercise.sets.length + 1,
                  weight: 0,
                  reps: 0,
                },
              ],
            }
          : exercise,
      ),
    );
  };

  const updateSet = (exerciseId: string, setId: string, patch: Partial<ExerciseSet>) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.id === setId ? { ...set, ...patch } : set,
              ),
            }
          : exercise,
      ),
    );
  };

  const removeSet = (exerciseId: string, setId: string) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: exercise.sets.filter((set) => set.id !== setId),
            }
          : exercise,
      ),
    );
  };

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppNavBar
          onBack={() => router.back()}
          trailing={
            <HapticPressable onPress={() => router.push(`/routine/execute/${id}`)}>
              <Text style={{ color: theme.primary, fontWeight: '800' }}>▶ Ejecutar</Text>
            </HapticPressable>
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
            <Text style={[styles.screenSubtitle, { color: theme.textMuted }]}>Ejercicios y series</Text>

            <GlassCard style={styles.nameCard}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Nombre</Text>
              <GlassInput value={name} onChangeText={setName} placeholder="Nombre de la rutina" />
            </GlassCard>

            <GlassCard style={styles.nameCard}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Grupos musculares</Text>
              <View style={styles.tags}>
                {routineMuscleGroups.map((group) => (
                  <View
                    key={group}
                    style={[
                      styles.tag,
                      { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                    ]}
                  >
                    <Text style={[styles.tagText, { color: theme.text }]}>
                      {MUSCLE_GROUP_LABELS[group]}
                    </Text>
                  </View>
                ))}
              </View>
            </GlassCard>

            {exercises.map((exercise, exIndex) => (
              <GlassCard key={exercise.id} style={styles.exerciseCard}>
                <View style={styles.exerciseHeader}>
                  <Text style={[styles.exerciseNum, { color: theme.primary }]}>{exIndex + 1}</Text>
                  <View style={styles.exerciseInfo}>
                    <Text style={[styles.exerciseName, { color: theme.text }]}>{exercise.name}</Text>
                    <Text style={[styles.exerciseMeta, { color: theme.textMuted }]}>
                      {exercise.variant}
                    </Text>
                    <View style={styles.tags}>
                      {exercise.muscleGroups.map((group) => (
                        <View
                          key={group}
                          style={[
                            styles.tag,
                            { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                          ]}
                        >
                          <Text style={[styles.tagText, { color: theme.text }]}>
                            {MUSCLE_GROUP_LABELS[group]}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <HapticPressable onPress={() => removeExercise(exercise.id)}>
                    <Text style={{ color: theme.textMuted }}>✕</Text>
                  </HapticPressable>
                </View>

                <Text style={[styles.lockedNote, { color: theme.textMuted }]}>Nombre, grupos musculares y variante quedan bloqueados en la rutina. Solo podés editar las series.</Text>

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
                      onChangeText={(text) =>
                        updateSet(exercise.id, set.id, { weight: parseFloat(text) || 0 })
                      }
                    />
                    <GlassInput
                      style={styles.setInput}
                      keyboardType="numeric"
                      value={set.reps ? String(set.reps) : ''}
                      placeholder="reps"
                      onChangeText={(text) =>
                        updateSet(exercise.id, set.id, { reps: parseInt(text, 10) || 0 })
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

            <GlassButton
              title="+ Agregar ejercicio"
              onPress={() => setPickerVisible(true)}
              variant="secondary"
            />
            <View style={styles.spacer} />
            <GlassButton title="Guardar rutina" onPress={save} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ExercisePicker
        exercises={catalogExercises}
        routineMuscleGroups={routineMuscleGroups}
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={addExerciseFromCatalog}
        onCreateNew={() => {
          setPickerVisible(false);
          router.push({
            pathname: '/exercise/create',
            params: {
              muscleGroups: routineMuscleGroups.join(','),
              returnToRoutineId: id,
            },
          });
        }}
      />
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
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  exerciseNum: {
    fontSize: 18,
    fontWeight: '800',
    width: 24,
    paddingTop: 2,
  },
  exerciseInfo: { flex: 1 },
  exerciseName: {
    fontSize: 17,
    fontWeight: '800',
  },
  exerciseMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  lockedNote: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  tag: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '700',
  },
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
});
