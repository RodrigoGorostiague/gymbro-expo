import React, { useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppScreenHeader } from '../../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { GlassButton } from '../../../components/UI';
import { HapticPressable } from '../../../components/HapticPressable';
import { MesocycleOverviewCard } from '../../../components/MesocycleOverviewCard';
import { useData } from '../../../context/DataContext';
import { useTheme } from '../../../context/ThemeContext';
import { groupMesocyclesForList, MesocycleListSection } from '../../../utils/mesocycleAnalytics';

const sectionCopy: Record<MesocycleListSection, string> = {
  active: 'Activos',
  shared: 'Compartidos conmigo',
  draft: 'Borradores',
  completed: 'Completados',
  archived: 'Archivados',
};

export default function MesocyclesScreen({ navigation }: { navigation?: React.ReactNode }) {
  const { theme } = useTheme();
  const { mesocycles, attempts, routines, deleteMesocycle } = useData();
  const [expandedSections, setExpandedSections] = useState<Record<Exclude<MesocycleListSection, 'active'>, boolean>>({
    shared: false,
    draft: false,
    completed: false,
    archived: false,
  });
  const sections = groupMesocyclesForList(mesocycles).filter((section) => section.items.length > 0);
  const confirmDelete = (id: string, name: string) => Alert.alert('Eliminar mesociclo', `¿Eliminar "${name}"? Las rutinas seguirán disponibles en tu biblioteca.`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: async () => { try { await deleteMesocycle(id); } catch (error) { Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Inténtalo nuevamente.'); } } }]);

  return <ThemeBackground><SafeAreaView style={styles.safe}><AppScreenHeader title="Mesociclos" subtitle="Bloques para planificar semanas de entrenamiento" trailing={<GlassButton title="+ Nuevo" onPress={() => router.push('/mesocycle/create')} />}/>{navigation}{mesocycles.length === 0 ? <GlassCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: theme.text }]}>Todavía no tienes mesociclos</Text><Text style={[styles.emptyText, { color: theme.textMuted }]}>Crea un bloque para organizar objetivos, duración y la estructura semanal antes de planificar sesiones.</Text><View style={styles.emptyAction}><GlassButton title="Crear mi primer mesociclo" onPress={() => router.push('/mesocycle/create')} /></View></GlassCard> : <FlatList data={sections} keyExtractor={(section) => section.key} contentContainerStyle={styles.list} renderItem={({ item: section }) => {
    const collapsibleKey = section.key === 'active' ? null : section.key;
    const expanded = collapsibleKey === null || expandedSections[collapsibleKey];
    return <View style={styles.section}>
      {collapsibleKey ? <HapticPressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${expanded ? 'Ocultar' : 'Mostrar'} ${sectionCopy[section.key]}`} onPress={() => setExpandedSections((current) => ({ ...current, [collapsibleKey]: !current[collapsibleKey] }))} style={[styles.sectionHeader, { borderColor: theme.glassBorder }]}><View><Text style={[styles.sectionTitle, { color: theme.text }]}>{sectionCopy[section.key]}</Text><Text style={[styles.sectionCount, { color: theme.textMuted }]}>{section.items.length} {section.items.length === 1 ? 'mesociclo' : 'mesociclos'}</Text></View><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={21} color={theme.primary} /></HapticPressable> : <View style={[styles.sectionHeader, { borderColor: theme.glassBorder }]}><View><Text style={[styles.sectionTitle, { color: theme.text }]}>{sectionCopy[section.key]}</Text><Text style={[styles.sectionCount, { color: theme.textMuted }]}>{section.items.length} {section.items.length === 1 ? 'mesociclo' : 'mesociclos'}</Text></View></View>}
      {expanded ? <View style={styles.sectionItems}>{section.items.map((mesocycle) => <MesocycleOverviewCard key={mesocycle.id} mesocycle={mesocycle} attempts={attempts} routines={routines} onOpen={() => router.push(`/mesocycle/summary/${mesocycle.id}`)} onDelete={() => confirmDelete(mesocycle.id, mesocycle.name)} />)}</View> : null}
    </View>;
  }} />}</SafeAreaView></ThemeBackground>;
}

const styles = StyleSheet.create({ safe: { flex: 1, paddingHorizontal: 20, paddingTop: 12 }, list: { paddingBottom: 32, gap: 16 }, section: { gap: 12 }, sectionHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10 }, sectionTitle: { fontSize: 16, fontWeight: '900' }, sectionCount: { fontSize: 12, fontWeight: '700', marginTop: 2 }, sectionItems: { gap: 12 }, emptyCard: { marginTop: 8 }, emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 }, emptyText: { fontSize: 14, lineHeight: 20 }, emptyAction: { marginTop: 16 } });
