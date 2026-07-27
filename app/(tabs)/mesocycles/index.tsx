import React from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppScreenHeader } from '../../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { HapticPressable } from '../../../components/HapticPressable';
import { GlassButton } from '../../../components/UI';
import { useData } from '../../../context/DataContext';
import { useTheme } from '../../../context/ThemeContext';
import { Mesocycle, MesocycleStatus } from '../../../types';

const STATUS_META: Record<MesocycleStatus, { label: string; emoji: string }> = {
  draft: { label: 'Borrador', emoji: '📝' },
  active: { label: 'Activo', emoji: '🔥' },
  completed: { label: 'Completado', emoji: '✅' },
  archived: { label: 'Archivado', emoji: '🗂️' },
};

const formatStartDate = (value?: string) => (value ? value : 'Sin fecha definida');

function MesocycleCard({ mesocycle, onDelete }: { mesocycle: Mesocycle; onDelete: () => void }) {
  const { theme } = useTheme();
  const status = STATUS_META[mesocycle.status];
  const sessionCount = mesocycle.weeks.reduce((total, week) => total + week.entries.filter((entry) => !('kind' in entry && entry.kind === 'rest')).length, 0);

  return (
    <HapticPressable onPress={() => router.push(`/mesocycle/summary/${mesocycle.id}`)}>
      <GlassCard style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleWrap}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{mesocycle.name}</Text>
            <Text style={[styles.cardGoal, { color: theme.textMuted }]}>
              {mesocycle.goal || 'Sin objetivo definido'}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}> 
            <Text style={[styles.statusText, { color: theme.text }]}>{status.emoji} {status.label}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: theme.textMuted }]}>Duración: {mesocycle.durationWeeks} semana{mesocycle.durationWeeks === 1 ? '' : 's'}</Text>
          <Text style={[styles.metaText, { color: theme.textMuted }]}>Sesiones: {sessionCount}</Text>
        </View>
        <Text style={[styles.metaText, { color: theme.textMuted }]}>Inicio: {formatStartDate(mesocycle.startDate)}</Text>

        <View style={styles.actions}>
          <GlassButton title="Abrir" onPress={() => router.push(`/mesocycle/summary/${mesocycle.id}`)} variant="secondary" />
          <GlassButton title="Eliminar" onPress={onDelete} variant="danger" />
        </View>
      </GlassCard>
    </HapticPressable>
  );
}

export default function MesocyclesScreen() {
  const { theme } = useTheme();
  const { mesocycles, deleteMesocycle } = useData();

  const confirmDelete = (id: string, name: string) => {
    Alert.alert('Eliminar mesociclo', `¿Eliminar "${name}"? Las rutinas seguirán disponibles en tu biblioteca.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMesocycle(id);
          } catch (error) {
            Alert.alert(
              'No se pudo eliminar',
              error instanceof Error ? error.message : 'Inténtalo nuevamente.',
            );
          }
        },
      },
    ]);
  };

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppScreenHeader
          title="Mesociclos"
          subtitle="Bloques para planificar semanas de entrenamiento"
          trailing={<GlassButton title="+ Nuevo" onPress={() => router.push('/mesocycle/create')} />}
        />

        {mesocycles.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Todavía no tienes mesociclos</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>Crea un bloque para organizar objetivos, duración y la estructura semanal antes de planificar sesiones.</Text>
            <View style={styles.emptyAction}>
              <GlassButton title="Crear mi primer mesociclo" onPress={() => router.push('/mesocycle/create')} />
            </View>
          </GlassCard>
        ) : (
          <FlatList
            data={mesocycles}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <MesocycleCard
                mesocycle={item}
                onDelete={() => confirmDelete(item.id, item.name)}
              />
            )}
          />
        )}
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  list: { paddingBottom: 32, gap: 12 },
  card: { marginBottom: 4 },
  cardHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cardTitleWrap: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 20, fontWeight: '800' },
  cardGoal: { fontSize: 13, lineHeight: 18 },
  statusBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { fontSize: 11, fontWeight: '800' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 14 },
  metaText: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  emptyCard: { marginTop: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  emptyText: { fontSize: 14, lineHeight: 20 },
  emptyAction: { marginTop: 16 },
});
