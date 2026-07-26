import React, { useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppScreenHeader } from '../../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { HapticPressable } from '../../../components/HapticPressable';
import { GlassButton } from '../../../components/UI';
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUP_OPTIONS } from '../../../constants/muscleGroups';
import { useData } from '../../../context/DataContext';
import { useTheme } from '../../../context/ThemeContext';
import { MuscleGroup } from '../../../types';

export default function ExercisesScreen() {
  const { theme } = useTheme();
  const { exercises, deleteExercise } = useData();
  const [filter, setFilter] = useState<MuscleGroup | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredExercises = useMemo(
    () => (filter ? exercises.filter((exercise) => exercise.muscleGroups.includes(filter)) : exercises),
    [exercises, filter],
  );

  const confirmDelete = (id: string, name: string) => {
    Alert.alert('Eliminar ejercicio', `¿Eliminar "${name}" del catálogo?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(id);
          try {
            await deleteExercise(id);
          } catch (error) {
            Alert.alert(
              'No se pudo eliminar',
               error instanceof Error ? error.message : 'Inténtalo nuevamente.',
            );
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppScreenHeader
          title="Ejercicios"
          subtitle="Catálogo global para reutilizar en rutinas"
          trailing={<GlassButton title="+ Nuevo" onPress={() => router.push('/exercise/create')} />}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <HapticPressable
            onPress={() => setFilter(null)}
            style={[styles.filterChip, { backgroundColor: !filter ? theme.primary : theme.glass, borderColor: theme.glassBorder }]}
          >
            <Text style={{ color: !filter ? theme.onPrimary : theme.text, fontWeight: '700' }}>Todos</Text>
          </HapticPressable>
          {MUSCLE_GROUP_OPTIONS.map((option) => {
            const selected = filter === option.value;
            return (
              <HapticPressable
                key={option.value}
                onPress={() => setFilter(selected ? null : option.value)}
                style={[styles.filterChip, { backgroundColor: selected ? theme.primary : theme.glass, borderColor: theme.glassBorder }]}
              >
                <Text style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: '700' }}>
                  {option.label}
                </Text>
              </HapticPressable>
            );
          })}
        </ScrollView>

        {filteredExercises.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No hay ejercicios todavía</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>Crea ejercicios con grupos musculares, variante y series por defecto.</Text>
          </GlassCard>
        ) : (
          <FlatList
            data={filteredExercises}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <GlassCard style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: theme.text }]}>{item.name}</Text>
                    <Text style={[styles.meta, { color: theme.textMuted }]}>
                      {item.variant} · {item.defaultSets.length} serie{item.defaultSets.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <HapticPressable onPress={() => router.push({ pathname: '/exercise/create', params: { exerciseId: item.id } })}>
                    <Text style={[styles.link, { color: theme.primary }]}>Editar</Text>
                  </HapticPressable>
                </View>

                <View style={styles.tags}>
                  {item.muscleGroups.map((group) => (
                    <View key={group} style={[styles.tag, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                      <Text style={[styles.tagText, { color: theme.text }]}>{MUSCLE_GROUP_LABELS[group]}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.actions}>
                  <GlassButton title="Editar" onPress={() => router.push({ pathname: '/exercise/create', params: { exerciseId: item.id } })} variant="secondary" disabled={deletingId !== null} />
                  <GlassButton title="Eliminar" onPress={() => confirmDelete(item.id, item.name)} variant="danger" disabled={deletingId !== null} loading={deletingId === item.id} />
                </View>
              </GlassCard>
            )}
          />
        )}
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  filters: { gap: 8, paddingBottom: 16 },
  filterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
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
