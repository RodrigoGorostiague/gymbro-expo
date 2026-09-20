import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Exercise } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useData } from '../context/DataContext';
import { HapticPressable } from './HapticPressable';
import { GlassButton, GlassInput } from './UI';
import { muscleGroupLabel } from '../utils/catalogMuscleGroups';

const searchable = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function RoutineExercisePicker({
  exercises,
  routineMuscleGroups = [],
  onClose,
  onSelect,
  replacing = false,
}: {
  exercises: Exercise[];
  routineMuscleGroups?: string[];
  onClose: () => void;
  onSelect: (exercises: Exercise[]) => void;
  replacing?: boolean;
}) {
  const { theme } = useTheme();
  const { catalogMuscleGroups = [] } = useData();
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const exerciseGroups = useMemo(
    () => new Map(exercises.map((exercise) => [
      exercise.id,
      new Set(exercise.muscleGroups.flatMap((id) => [
          id,
          ...(catalogMuscleGroups.find((muscle) => muscle.id === id)?.parentIds ?? []),
      ])),
    ])),
    [exercises, catalogMuscleGroups],
  );
  const groups = [...new Set(
    routineMuscleGroups.length
      ? routineMuscleGroups
      : exercises.flatMap((exercise) => exercise.muscleGroups),
  )];
  const scopedExercises = useMemo(
    () => routineMuscleGroups.length
      ? exercises.filter((exercise) => routineMuscleGroups.some(
          (id) => exerciseGroups.get(exercise.id)?.has(id),
        ))
      : exercises,
    [exercises, routineMuscleGroups, exerciseGroups],
  );
  const equipments = useMemo(
    () => [
      ...new Set(
        scopedExercises.flatMap((exercise) =>
          exercise.catalog?.equipment ? [exercise.catalog.equipment] : [],
        ),
      ),
    ],
    [scopedExercises],
  );
  const filtered = scopedExercises.filter(
    (exercise) =>
      (!group || exerciseGroups.get(exercise.id)?.has(group)) &&
      (!equipment || exercise.catalog?.equipment === equipment) &&
      searchable(`${exercise.name} ${exercise.variant}`).includes(
        searchable(search.trim()),
      ),
  );
  const chip = (label: string, active: boolean, onPress: () => void) => (
    <HapticPressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: active ? theme.primary : theme.glassBorder,
          backgroundColor: active ? theme.primary : theme.glass,
        },
      ]}
    >
      <Text style={{ color: active ? theme.onPrimary : theme.text }}>
        {label}
      </Text>
    </HapticPressable>
  );
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView
        style={[styles.root, { backgroundColor: theme.background[0] }]}
      >
        <View style={styles.row}>
          <Text style={[styles.title, { color: theme.text }]}>
            {replacing ? 'Reemplazar ejercicio' : 'Agregar ejercicios'}
          </Text>
          {chip('Cerrar', false, onClose)}
        </View>
        <GlassInput
          accessibilityLabel="Buscar ejercicios"
          placeholder="Buscar por nombre o variante"
          value={search}
          onChangeText={setSearch}
        />
        <ScrollView
          horizontal
          style={styles.filters}
          contentContainerStyle={styles.row}
        >
          {chip(routineMuscleGroups.length ? 'Grupos de la rutina' : 'Todos los músculos', !group, () => setGroup(null))}
          {groups.map((id) =>
            chip(muscleGroupLabel(catalogMuscleGroups, id), group === id, () =>
              setGroup(group === id ? null : id),
            ),
          )}
        </ScrollView>
        <ScrollView
          horizontal
          style={styles.filters}
          contentContainerStyle={styles.row}
        >
          {chip('Todo el equipo', !equipment, () => setEquipment(null))}
          {equipments.map((value) =>
            chip(value, equipment === value, () =>
              setEquipment(equipment === value ? null : value),
            ),
          )}
        </ScrollView>
        <Text style={{ color: theme.textMuted }}>
          {filtered.length} ejercicios · selección en el orden en que los
          agregas
        </Text>
        <FlatList
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          data={filtered}
          extraData={selected}
          keyExtractor={(exercise) => exercise.id}
          initialNumToRender={16}
          windowSize={7}
          renderItem={({ item: exercise }) => {
            const index = selected.indexOf(exercise.id);
            return (
              <HapticPressable
                key={exercise.id}
                accessibilityRole="checkbox"
                accessibilityLabel={exercise.name}
                accessibilityState={{ checked: index >= 0 }}
                onPress={() =>
                  setSelected((current) =>
                    index >= 0
                      ? current.filter((id) => id !== exercise.id)
                      : replacing
                        ? [exercise.id]
                        : [...current, exercise.id],
                  )
                }
                style={[
                  styles.exercise,
                  {
                    borderColor: index >= 0 ? theme.primary : theme.glassBorder,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '800' }}>
                    {exercise.name}
                  </Text>
                  <Text style={{ color: theme.textMuted }}>
                    {exercise.variant} ·{' '}
                    {exercise.catalog?.equipment ?? 'Sin equipo indicado'}
                  </Text>
                </View>
                <Text style={{ color: theme.primary }}>
                  {index >= 0 ? `✓ ${index + 1}` : '+'}
                </Text>
              </HapticPressable>
            );
          }}
          ListEmptyComponent={
            <Text style={{ color: theme.textMuted, paddingVertical: 24 }}>
              No hay coincidencias. Prueba otro nombre o quita los filtros.
            </Text>
          }
        />
        <GlassButton
          title={
            replacing ? 'Reemplazar' : `Agregar ${selected.length} ejercicios`
          }
          disabled={!selected.length}
          onPress={() =>
            onSelect(
              selected.flatMap((id) => {
                const exercise = exercises.find((item) => item.id === id);
                return exercise ? [exercise] : [];
              }),
            )
          }
        />
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, padding: 20, gap: 12 },
  title: { flex: 1, fontSize: 22, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  filters: { flexGrow: 0, maxHeight: 48 },
  exercise: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginVertical: 5,
  },
});
