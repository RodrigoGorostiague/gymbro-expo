import React, { useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppScreenHeader } from '../../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { HapticPressable } from '../../../components/HapticPressable';
import { useData } from '../../../context/DataContext';
import { useTheme } from '../../../context/ThemeContext';
import { CatalogParticipationMode } from '../../../services/catalog';
import { isSelectableMuscleParent, muscleGroupLabel } from '../../../utils/catalogMuscleGroups';

export default function ExercisesScreen() {
  const { theme } = useTheme();
  const { exercises, catalogMuscleGroups = [], filterCatalogExercises } = useData();
  const [filter, setFilter] = useState<string | null>(null);
  const [mode, setMode] = useState<CatalogParticipationMode>('all_roles');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [filteredExercises, setFilteredExercises] = useState(exercises);

  const activeFilterLabel = filter ? catalogMuscleGroups.find((group) => group.id === filter)?.displayName ?? null : null;
  const visibleGroups = catalogMuscleGroups.filter((group) => (
    isSelectableMuscleParent(group) && group.displayName.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'))
  ));

  useEffect(() => {
    let active = true;
    if (!filter) {
      setFilteredExercises(exercises);
      return () => { active = false; };
    }
    void filterCatalogExercises(filter, mode).then((next) => {
      if (!active) return;
      const canonicalById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
      setFilteredExercises(next.map((exercise) => canonicalById.get(exercise.id) ?? exercise));
    });
    return () => { active = false; };
  }, [exercises, filter, filterCatalogExercises, mode]);

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppScreenHeader
          title="Ejercicios"
          subtitle="Catálogo curado y normalizado"
        />

        <View style={styles.filterSection}>
          <HapticPressable
            testID="exercise-filter-trigger"
            accessibilityRole="button"
            accessibilityState={{ expanded: filtersExpanded }}
            onPress={() => setFiltersExpanded((current) => !current)}
            style={[styles.filterTrigger, { backgroundColor: theme.glass, borderColor: filter ? theme.primary : theme.glassBorder }]}
          >
            <View style={styles.filterTriggerCopy}>
              <Text style={[styles.filterTriggerTitle, { color: theme.text }]}>Filtros musculares</Text>
              <Text style={[styles.filterTriggerSubtitle, { color: filter ? theme.primary : theme.textMuted }]}>
                {activeFilterLabel ? `Activo: ${activeFilterLabel}` : 'Todos los grupos'}
              </Text>
            </View>
            <Text style={[styles.filterTriggerAction, { color: filter ? theme.primary : theme.textMuted }]}>
              {filtersExpanded ? 'Ocultar' : 'Mostrar'}
            </Text>
          </HapticPressable>

           {filtersExpanded ? (
            <ScrollView
              testID="exercise-filter-strip"
              style={styles.filtersScroll}
              contentContainerStyle={styles.filters}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              <HapticPressable
                onPress={() => setFilter(null)}
                style={[styles.filterChip, { backgroundColor: !filter ? theme.primary : theme.glass, borderColor: theme.glassBorder }]}
              >
                <Text style={{ color: !filter ? theme.onPrimary : theme.text, fontWeight: '700' }}>Todos</Text>
              </HapticPressable>
              <TextInput value={query} onChangeText={setQuery} placeholder="Buscar grupo muscular" placeholderTextColor={theme.textMuted} style={[styles.search, { color: theme.text, borderColor: theme.glassBorder }]} />
              {(['primary_only', 'primary_and_secondary', 'all_roles'] as const).map((item) => {
                const selected = mode === item;
                const label = item === 'primary_only' ? 'Principales' : item === 'primary_and_secondary' ? 'Principal + secundaria' : 'Cualquier participación';
                return (
                  <HapticPressable
                    key={item}
                    onPress={() => setMode(item)}
                    style={[styles.filterChip, { backgroundColor: selected ? theme.primary : theme.glass, borderColor: theme.glassBorder }]}
                  >
                    <Text style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: '700' }}>
                      {label}
                    </Text>
                  </HapticPressable>
                );
              })}
              {visibleGroups.map((group) => {
                const selected = filter === group.id;
                return <HapticPressable key={group.id} onPress={() => setFilter(selected ? null : group.id)} style={[styles.filterChip, { backgroundColor: selected ? theme.primary : theme.glass, borderColor: theme.glassBorder }]}>
                  <Text style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: '700' }}>{group.displayName}</Text>
                </HapticPressable>;
              })}
            </ScrollView>
          ) : null}
        </View>

        {filteredExercises.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No hay ejercicios todavía</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No hay ejercicios para la selección actual.</Text>
          </GlassCard>
        ) : (
          <FlatList
            data={filteredExercises}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              return <GlassCard style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: theme.text }]}>{item.name}</Text>
                    <Text style={[styles.meta, { color: theme.textMuted }]}>
                       {item.catalog?.movementPattern ?? item.variant} · {item.variant}
                    </Text>
                  </View>
                   <Text style={[styles.link, { color: theme.textMuted }]}>{item.id}</Text>
                </View>

                <View style={styles.tags}>
                   {item.muscleGroups.map((group) => (
                    <View key={group} style={[styles.tag, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                       <Text style={[styles.tagText, { color: theme.text }]}>{muscleGroupLabel(catalogMuscleGroups, group)}</Text>
                    </View>
                  ))}
                </View>

                 <Text style={[styles.meta, { color: theme.textMuted, marginTop: 14 }]}>Los datos del catálogo se administran únicamente mediante la importación validada.</Text>
              </GlassCard>
            }}
          />
        )}
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  filterSection: { paddingBottom: 16, gap: 10 },
  filterTrigger: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  filterTriggerCopy: { flex: 1, gap: 2 },
  filterTriggerTitle: { fontSize: 15, fontWeight: '800' },
  filterTriggerSubtitle: { fontSize: 13, fontWeight: '600' },
  filterTriggerAction: { fontSize: 13, fontWeight: '800' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8 },
  filtersScroll: { maxHeight: 280 },
  search: { width: '100%', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  filterChip: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  list: { paddingBottom: 32, gap: 12 },
  emptyCard: { marginTop: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  emptyText: { fontSize: 14, lineHeight: 20 },
  card: { marginBottom: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 18, fontWeight: '800' },
  meta: { fontSize: 13, marginTop: 4 },
  link: { fontSize: 14, fontWeight: '800' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  tagText: { fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
