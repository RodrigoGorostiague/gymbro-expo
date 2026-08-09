import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { Exercise, MuscleGroup } from '../types';
import { isSelectableMuscleParent, muscleGroupLabel } from '../utils/catalogMuscleGroups';
import { GlassCard } from './GlassCard';
import { HapticPressable } from './HapticPressable';
import { GlassButton } from './UI';

interface ExercisePickerProps {
  exercises: Exercise[];
  routineMuscleGroups: MuscleGroup[];
  /** Shows the whole catalog and its visible parent-group filters. */
  catalogMode?: boolean;
  visible: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
}

export function ExercisePicker({
  exercises,
  routineMuscleGroups,
  catalogMode = false,
  visible,
  onClose,
  onSelect,
}: ExercisePickerProps) {
  const { theme } = useTheme();
  const { catalogMuscleGroups = [], filterCatalogExercises } = useData();
  const catalogAvailableGroups = useMemo(
    () => catalogMuscleGroups.filter(isSelectableMuscleParent).map((group) => group.id),
    [catalogMuscleGroups],
  );
  const availableGroups = catalogMode ? catalogAvailableGroups : routineMuscleGroups;
  const [filter, setFilter] = useState<MuscleGroup | null>(catalogMode ? null : routineMuscleGroups[0] ?? null);
  const [filteredExercises, setFilteredExercises] = useState<Exercise[]>(exercises);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const activeFilter =
    filter && !availableGroups.includes(filter) ? (catalogMode ? null : routineMuscleGroups[0] ?? null) : filter;

  useLayoutEffect(() => {
    if (visible) setIsLoading(true);
  }, [activeFilter, availableGroups, exercises, visible]);

  useEffect(() => {
    if (!visible) return;
    if (filter && !availableGroups.includes(filter)) {
      setFilter(catalogMode ? null : routineMuscleGroups[0] ?? null);
    }
  }, [availableGroups, catalogMode, filter, routineMuscleGroups, visible]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    const load = async () => {
      setLoadError(null);
      if (!activeFilter && availableGroups.length === 0) {
        if (active) {
          setFilteredExercises(exercises);
          setIsLoading(false);
        }
        return;
      }
      setIsLoading(true);
      const groupIds = activeFilter ? [activeFilter] : availableGroups;
      const matches = await Promise.all(groupIds.map((groupId) => filterCatalogExercises(groupId, 'all_roles')));
      if (!active) return;
      const canonicalById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
      const unique = new Map<string, Exercise>();
      matches.flat().forEach((exercise) => unique.set(exercise.id, canonicalById.get(exercise.id) ?? exercise));
      setFilteredExercises([...unique.values()]);
      setIsLoading(false);
    };
    void load().catch(() => {
      if (!active) return;
      setFilteredExercises([]);
      setLoadError('No se pudo cargar el catálogo para estos grupos.');
      setIsLoading(false);
    });
    return () => { active = false; };
  }, [activeFilter, availableGroups, exercises, filterCatalogExercises, visible]);

  const groupLabel = (id: string) => muscleGroupLabel(catalogMuscleGroups, id);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <GlassCard fill style={styles.card}>
          <Text style={[styles.title, { color: theme.text }]}>Agregar ejercicio</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>{catalogMode ? 'Explorá el catálogo completo por grupos musculares padre.' : 'El catálogo respeta los grupos padre seleccionados para esta rutina.'}</Text>

          {availableGroups.length > 0 ? (
            <ScrollView style={styles.filtersWrap} showsVerticalScrollIndicator={false} contentContainerStyle={styles.filters}>
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
                  Todos los grupos
                </Text>
              </HapticPressable>
              {availableGroups.map((group) => {
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
                      {groupLabel(group)}
                    </Text>
                  </HapticPressable>
                );
              })}
            </ScrollView>
          ) : null}

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {isLoading ? (
              <View accessibilityLabel="Cargando ejercicios" style={styles.skeletonList}>
                {[0, 1, 2].map((index) => <View key={index} style={[styles.skeletonRow, { borderColor: theme.glassBorder }]}>
                  <View style={[styles.skeletonTitle, { backgroundColor: theme.glassBorder }]} />
                  <View style={[styles.skeletonMeta, { backgroundColor: theme.glassBorder }]} />
                </View>)}
              </View>
            ) : loadError ? (
              <View style={styles.errorState}>
                <Text style={{ color: theme.textMuted }}>{loadError}</Text>
                <HapticPressable onPress={() => setFilter((current) => current ? null : availableGroups[0] ?? null)}>
                  <Text style={[styles.link, { color: theme.primary }]}>Reintentar</Text>
                </HapticPressable>
              </View>
            ) : filteredExercises.length === 0 ? (
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
                      {exercise.catalog?.movementPattern ?? 'Patrón no especificado'} · {exercise.variant}
                    </Text>
                    {exercise.attribution?.primary ? <Text style={[styles.exerciseMeta, { color: theme.textMuted }]}>
                      Principal: {groupLabel(exercise.attribution.primary)}
                    </Text> : null}
                  </View>
                  <Text style={[styles.link, { color: theme.primary }]}>Agregar</Text>
                </HapticPressable>
              ))
            )}
          </ScrollView>

          <View style={styles.actions}>
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
    height: '85%',
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 4,
  },
  filtersWrap: {
    maxHeight: 96,
    marginBottom: 12,
  },
  filterChip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  list: {
    flex: 1,
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
  errorState: {
    gap: 10,
  },
  skeletonList: { gap: 10 },
  skeletonRow: { borderRadius: 16, borderWidth: 1, gap: 10, padding: 14 },
  skeletonTitle: { borderRadius: 5, height: 20, opacity: 0.55, width: '58%' },
  skeletonMeta: { borderRadius: 4, height: 13, opacity: 0.35, width: '78%' },
  spacer: {
    height: 10,
  },
});
