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
import { MuscleGroupSelector } from '../../components/MuscleGroupSelector';
import { GlassButton, GlassInput } from '../../components/UI';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Exercise, ExerciseSet, MuscleGroup, RoutineExercise } from '../../types';
import { buildDecimalDraftMap, type DecimalDraftMap, normalizeDecimalInput } from '../../utils/decimalInput';
import { generateId } from '../../utils/storage';
import { matchesActiveWorkout } from '../../utils/activeWorkoutReentry';
import { muscleGroupLabel } from '../../utils/catalogMuscleGroups';

export default function EditRoutineScreen() {
  const { id, addExerciseId } = useLocalSearchParams<{ id: string; addExerciseId?: string }>();
  const {
    exercises: catalogExercises,
    catalogMuscleGroups = [],
    definitions,
    getExercise,
    getRoutine,
    updateRoutine,
    activeWorkoutDraft,
  } = useData();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [exercises, setExercises] = useState<RoutineExercise[]>([]);
  const [draftWeights, setDraftWeights] = useState<DecimalDraftMap>({});
  const [routineMuscleGroups, setRoutineMuscleGroups] = useState<MuscleGroup[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const handledAutoAddId = useRef<string | null>(null);
  const groupLabel = (groupId: string) => muscleGroupLabel(catalogMuscleGroups, groupId);

  const createRoutineExercise = (exercise: Exercise): RoutineExercise => {
    const definition = definitions?.find((candidate) => candidate.id === exercise.id);
    return ({
    id: generateId(),
    catalogExerciseId: exercise.id,
    definitionId: definition?.id,
    definitionSnapshot: definition ? {
      id: definition.id,
      name: definition.name,
      muscleGroups: [...definition.muscleGroups],
      loadMode: definition.loadMode,
      loadUnit: definition.loadUnit,
      variant: definition.variant,
    } : undefined,
    name: exercise.name,
    muscleGroups: [...exercise.muscleGroups],
    loadMode: exercise.loadMode,
    loadUnit: exercise.loadUnit,
    attribution: exercise.attribution,
    variant: exercise.variant,
    sets: exercise.defaultSets.map((set) => ({
      id: generateId(),
      tipo: set.tipo,
      weight: set.weight,
      reps: set.reps,
    })),
    });
  };

  useEffect(() => {
    const routine = getRoutine(id);
    if (!routine) {
      router.back();
      return;
    }

    setName(routine.name);
    setExercises(routine.exercises);
    setRoutineMuscleGroups(routine.muscleGroups ?? []);
    setDraftWeights(buildDecimalDraftMap(routine.exercises.flatMap((exercise) => exercise.sets)));
  }, [getRoutine, id]);

  useEffect(() => {
    if (!addExerciseId || handledAutoAddId.current === addExerciseId) return;

    const exercise = getExercise(addExerciseId);
    if (!exercise) return;

    handledAutoAddId.current = addExerciseId;
    const nextExercise = createRoutineExercise(exercise);
    setExercises((current) => [...current, nextExercise]);
    setDraftWeights((current) => ({ ...current, ...buildDecimalDraftMap(nextExercise.sets) }));
    router.setParams({ addExerciseId: undefined });
  }, [addExerciseId, getExercise]);

  const save = () => {
    const routine = getRoutine(id);
    if (!routine) return;
    if (routineMuscleGroups.length === 0) {
      Alert.alert('Validación', 'Selecciona al menos un grupo muscular.');
      return;
    }

    const normalizedExercises: RoutineExercise[] = [];
    for (const exercise of exercises) {
      const normalizedSets: ExerciseSet[] = [];
      for (const set of exercise.sets) {
        const weight = normalizeDecimalInput(draftWeights[set.id] ?? '');
        if (weight === null) {
          Alert.alert('Validación', 'Cada serie debe tener un peso válido mayor o igual a 0.');
          return;
        }
        normalizedSets.push({ ...set, weight });
      }

      normalizedExercises.push({
        ...exercise,
        sets: normalizedSets,
      });
    }

    updateRoutine({
      ...routine,
      name: name.trim() || routine.name,
      muscleGroups: routineMuscleGroups,
      exercises: normalizedExercises,
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
    const nextId = generateId();
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: [
                ...exercise.sets,
                {
                  id: nextId,
                  tipo: exercise.sets.length + 1,
                  weight: 0,
                  reps: 0,
                },
              ],
            }
          : exercise,
      ),
    );
    setDraftWeights((current) => ({ ...current, [nextId]: '' }));
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

  const updateDraftWeight = (setId: string, value: string) => {
    setDraftWeights((current) => ({ ...current, [setId]: value }));
  };

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppNavBar
          onBack={() => router.back()}
          trailing={
            <HapticPressable
              accessibilityLabel={`${matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: id }) ? 'Continuar' : 'Ejecutar'} ${getRoutine(id)?.name ?? ''}`}
              onPress={() => router.push(`/routine/execute/${id}`)}
            >
              <Text style={{ color: theme.primary, fontWeight: '800' }}>▶ {matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: id }) ? 'Continuar' : 'Ejecutar'}</Text>
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
            <Text style={[styles.screenTitle, { color: theme.text }]}>Editar rutina</Text>
            <Text style={[styles.screenSubtitle, { color: theme.textMuted }]}>Ejercicios y series</Text>

            <GlassCard style={styles.nameCard}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Nombre</Text>
              <GlassInput value={name} onChangeText={setName} placeholder="Nombre de la rutina" />
            </GlassCard>

            <GlassCard style={styles.nameCard}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Grupos musculares</Text>
              <MuscleGroupSelector
                value={routineMuscleGroups}
                onChange={setRoutineMuscleGroups}
              />
            </GlassCard>

            {exercises.length === 0 ? (
              <GlassCard style={styles.emptyStateCard}>
                <Text style={[styles.emptyStateTitle, { color: theme.text }]}>Todavía no agregaste ejercicios</Text>
                <Text style={[styles.emptyStateText, { color: theme.textMuted }]}>Empieza con una plantilla del catálogo para que la rutina quede usable sin perder el acceso al botón principal.</Text>
              </GlassCard>
            ) : null}

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
                      {exercise.muscleGroups.slice(0, 2).map((group) => (
                        <View
                          key={group}
                          style={[
                            styles.tag,
                            { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                          ]}
                        >
                          <Text style={[styles.tagText, { color: theme.text }]}>
                            {groupLabel(group)}
                          </Text>
                        </View>
                      ))}
                      {exercise.muscleGroups.length > 2 ? (
                        <View style={[styles.tag, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                          <Text style={[styles.tagText, { color: theme.textMuted }]}>+{exercise.muscleGroups.length - 2}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <HapticPressable onPress={() => removeExercise(exercise.id)}>
                    <Text style={{ color: theme.textMuted }}>✕</Text>
                  </HapticPressable>
                </View>

                <Text style={[styles.lockedNote, { color: theme.textMuted }]}>Nombre, grupos musculares y variante quedan bloqueados en la rutina. Solo puedes editar las series.</Text>

                <View style={styles.setHeader}>
                  <Text style={[styles.setCol, { color: theme.textMuted }]}>Serie</Text>
                  <Text style={[styles.setCol, { color: theme.textMuted }]}>Peso</Text>
                  <Text style={[styles.setCol, { color: theme.textMuted }]}>Repeticiones</Text>
                  <View style={{ width: 28 }} />
                </View>

                {exercise.sets.map((set, setIndex) => (
                  <View key={set.id} style={styles.setRow}>
                    <Text style={[styles.setNum, { color: theme.text }]}>{setIndex + 1}</Text>
                    <GlassInput
                      style={styles.setInput}
                      keyboardType="decimal-pad"
                      value={draftWeights[set.id] ?? ''}
                      placeholder="kg"
                      onChangeText={(text) => updateDraftWeight(set.id, text)}
                    />
                    <GlassInput
                      style={styles.setInput}
                      keyboardType="numeric"
                      value={set.reps ? String(set.reps) : ''}
                      placeholder="repeticiones"
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

            <View style={styles.footerActions}>
              <GlassButton
                title="+ Agregar ejercicio"
                onPress={() => setPickerVisible(true)}
                variant="secondary"
              />
              <View style={styles.spacer} />
            </View>
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
  emptyStateCard: { marginBottom: 12 },
  emptyStateTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  emptyStateText: { fontSize: 14, lineHeight: 20 },
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
  footerActions: {
    marginTop: 4,
    marginBottom: 4,
  },
  spacer: { height: 12 },
});
