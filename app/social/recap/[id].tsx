import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { GlassButton } from '../../../components/UI';
import { WorkoutRecapPresentation } from '../../../components/WorkoutRecapPresentation';
import { useAuth } from '../../../context/AuthContext';
import { useData } from '../../../context/DataContext';
import { useSocial } from '../../../context/SocialContext';
import { useTheme } from '../../../context/ThemeContext';
import { recapImportPlan } from '../../../services/workoutRecapFeed';
import { WorkoutRecapDetail } from '../../../types';

export default function WorkoutRecapDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { user } = useAuth();
  const { getWorkoutRecapDetail } = useSocial(); const { importCatalogContent } = useData(); const { theme } = useTheme();
  const [recap, setRecap] = useState<WorkoutRecapDetail | null>(null); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState<'routine' | 'mesocycle' | null>(null); const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => { void getWorkoutRecapDetail(id).then(setRecap).catch((reason) => setError(reason instanceof Error ? reason.message : 'No se pudo cargar el resumen.')); }, [getWorkoutRecapDetail, id]);
  const save = async (kind: 'routine' | 'mesocycle') => { if (!recap?.sharePayload || !user) return; setSaving(kind); setError(null); try { await importCatalogContent(recapImportPlan(recap.id, user, recap.sharePayload, kind === 'mesocycle')); setSaved(kind === 'mesocycle' ? 'Mesociclo guardado como borrador.' : 'Rutina guardada en tu biblioteca.'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la plantilla.'); } finally { setSaving(null); } };
  return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} /><ScrollView contentContainerStyle={styles.scroll}>
    {error ? <GlassCard><Text accessibilityRole="alert" style={{ color: theme.text }}>{error}</Text><GlassButton title="Reintentar" variant="secondary" onPress={() => void getWorkoutRecapDetail(id).then(setRecap).catch((reason) => setError(reason instanceof Error ? reason.message : 'No se pudo cargar el resumen.'))} /></GlassCard> : null}
    {!error && !recap ? <Text style={{ color: theme.textMuted }}>Cargando resumen...</Text> : null}
    {recap ? <><Text style={{ color: theme.textMuted }}>{recap.authorAlias}</Text><WorkoutRecapPresentation recap={recap} copyState={saving} copiedLabel={saved} onCopyRoutine={!recap.isAuthor && recap.templateAvailable ? () => void save('routine') : undefined} onViewMesocycle={!recap.isAuthor && recap.mesocycleAvailable ? () => router.push({ pathname: '/social/recap/[id]/mesocycle', params: { id: recap.id } }) : undefined} /></> : null}</ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1, paddingHorizontal: 20 }, scroll: { paddingBottom: 36, gap: 12 } });
