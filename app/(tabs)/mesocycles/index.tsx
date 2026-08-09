import React from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppScreenHeader } from '../../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { GlassButton } from '../../../components/UI';
import { MesocycleOverviewCard } from '../../../components/MesocycleOverviewCard';
import { useData } from '../../../context/DataContext';
import { useTheme } from '../../../context/ThemeContext';
import { sortMesocyclesActiveFirst } from '../../../utils/mesocycleAnalytics';

export default function MesocyclesScreen({ navigation }: { navigation?: React.ReactNode }) {
  const { theme } = useTheme();
  const { mesocycles, attempts, routines, deleteMesocycle } = useData();
  const orderedMesocycles = sortMesocyclesActiveFirst(mesocycles);
  const confirmDelete = (id: string, name: string) => Alert.alert('Eliminar mesociclo', `¿Eliminar "${name}"? Las rutinas seguirán disponibles en tu biblioteca.`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: async () => { try { await deleteMesocycle(id); } catch (error) { Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Inténtalo nuevamente.'); } } }]);

  return <ThemeBackground><SafeAreaView style={styles.safe}><AppScreenHeader title="Mesociclos" subtitle="Bloques para planificar semanas de entrenamiento" trailing={<GlassButton title="+ Nuevo" onPress={() => router.push('/mesocycle/create')} />}/>{navigation}{mesocycles.length === 0 ? <GlassCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: theme.text }]}>Todavía no tienes mesociclos</Text><Text style={[styles.emptyText, { color: theme.textMuted }]}>Crea un bloque para organizar objetivos, duración y la estructura semanal antes de planificar sesiones.</Text><View style={styles.emptyAction}><GlassButton title="Crear mi primer mesociclo" onPress={() => router.push('/mesocycle/create')} /></View></GlassCard> : <FlatList data={orderedMesocycles} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} renderItem={({ item }) => <MesocycleOverviewCard mesocycle={item} attempts={attempts} routines={routines} onOpen={() => router.push(`/mesocycle/summary/${item.id}`)} onDelete={() => confirmDelete(item.id, item.name)} />} />}</SafeAreaView></ThemeBackground>;
}

const styles = StyleSheet.create({ safe: { flex: 1, paddingHorizontal: 20, paddingTop: 12 }, list: { paddingBottom: 32, gap: 12 }, emptyCard: { marginTop: 8 }, emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 }, emptyText: { fontSize: 14, lineHeight: 20 }, emptyAction: { marginTop: 16 } });
