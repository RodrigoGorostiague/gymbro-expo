import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MUSCLE_GROUP_LABELS } from '../constants/muscleGroups';
import { useTheme } from '../context/ThemeContext';
import { Exercise, MuscleGroup } from '../types';
import { GlassCard } from './GlassCard';
import { HapticPressable } from './HapticPressable';
import { GlassButton } from './UI';

interface ExercisePickerProps {
  exercises: Exercise[];
  routineMuscleGroups: MuscleGroup[];
  visible: boolean;
  onClose: () => void;
  onCreateNew: () => void;
  onSelect: (exercise: Exercise) => void;
}

export function ExercisePicker({
  exercises,
  routineMuscleGroups,
  visible,
  onClose,
  onCreateNew,
  onSelect,
}: ExercisePickerProps) {
  const { theme } = useTheme();
  const [filter, setFilter] = useState<MuscleGroup | null>(routineMuscleGroups[0] ?? null);
  const activeFilter =
    filter && !routineMuscleGroups.includes(filter) ? routineMuscleGroups[0] ?? null : filter;

  useEffect(() => {
    if (filter && !routineMuscleGroups.includes(filter)) {
      setFilter(routineMuscleGroups[0] ?? null);
    }
  }, [filter, routineMuscleGroups]);

  const filteredExercises = useMemo(() => {
    if (activeFilter) {
      return exercises.filter((exercise) => exercise.muscleGroups.includes(activeFilter));
    }

    if (routineMuscleGroups.length === 0) {
      return exercises;
    }

    return exercises.filter((exercise) =>
      exercise.muscleGroups.some((group) => routineMuscleGroups.includes(group)),
    );
  }, [activeFilter, exercises, routineMuscleGroups]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <GlassCard style={styles.card}>
          <Text style={[styles.title, { color: theme.text }]}>Agregar ejercicio</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>Catálogo filtrado por los grupos musculares de esta rutina.</Text>

          {routineMuscleGroups.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              <HapticPressable
                onPress={() => setFilter(null)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: !activeFilter ? theme.primary : theme.glass,
                    borderColor: theme.glassBorder,
                  },
                ]}
              >
                <Text style={{ color: !activeFilter ? theme.onPrimary : theme.text, fontWeight: '700' }}>
                  Todos
                </Text>
              </HapticPressable>
              {routineMuscleGroups.map((group) => {
                const selected = activeFilter === group;
                return (
                  <HapticPressable
                    key={group}
                    onPress={() => setFilter(selected ? null : group)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: selected ? theme.primary : theme.glass,
                        borderColor: theme.glassBorder,
                      },
                    ]}
                  >
                    <Text style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: '700' }}>
                      {MUSCLE_GROUP_LABELS[group]}
                    </Text>
                  </HapticPressable>
                );
              })}
            </ScrollView>
          ) : null}

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {filteredExercises.length === 0 ? (
              <Text style={{ color: theme.textMuted }}>
                No hay ejercicios del catálogo para este filtro.
              </Text>
            ) : (
              filteredExercises.map((exercise) => (
                <HapticPressable
                  key={exercise.id}
                  onPress={() => onSelect(exercise)}
                  style={[styles.exerciseRow, { borderColor: theme.glassBorder }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.exerciseName, { color: theme.text }]}>{exercise.name}</Text>
                    <Text style={[styles.exerciseMeta, { color: theme.textMuted }]}>
                      {exercise.variant} · {exercise.defaultSets.length} serie
                      {exercise.defaultSets.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Text style={[styles.link, { color: theme.primary }]}>Agregar</Text>
                </HapticPressable>
              ))
            )}
          </ScrollView>

          <View style={styles.actions}>
            <GlassButton title="Crear ejercicio nuevo" onPress={onCreateNew} variant="secondary" />
            <View style={styles.spacer} />
            <GlassButton title="Cerrar" onPress={onClose} variant="secondary" />
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  card: {
    maxHeight: '85%',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 14,
  },
  filters: {
    gap: 8,
    paddingBottom: 12,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  list: {
    maxHeight: 320,
  },
  listContent: {
    gap: 10,
    paddingBottom: 8,
  },
  exerciseRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '800',
  },
  exerciseMeta: {
    fontSize: 13,
    marginTop: 3,
  },
  link: {
    fontSize: 14,
    fontWeight: '800',
  },
  actions: {
    marginTop: 16,
  },
  spacer: {
    height: 10,
  },
});
