import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { GlassButton } from '../../../components/UI';
import { useAuth } from '../../../context/AuthContext';
import { useData } from '../../../context/DataContext';
import { useSocial } from '../../../context/SocialContext';
import { useTheme } from '../../../context/ThemeContext';
import { recapImportPlan } from '../../../services/workoutRecapFeed';
import { WorkoutRecapDetail } from '../../../types';
import { muscleGroupLabels } from '../../../utils/catalogMuscleGroups';

export default function WorkoutRecapDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { user } = useAuth();
  const { getWorkoutRecapDetail } = useSocial(); const { catalogMuscleGroups = [], importCatalogContent } = useData(); const { theme } = useTheme();
  const [recap, setRecap] = useState<WorkoutRecapDetail | null>(null); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState<'routine' | 'mesocycle' | null>(null); const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => { void getWorkoutRecapDetail(id).then(setRecap).catch((reason) => setError(reason instanceof Error ? reason.message : 'No se pudo cargar el resumen.')); }, [getWorkoutRecapDetail, id]);
  const save = async (kind: 'routine' | 'mesocycle') => { if (!recap?.sharePayload || !user) return; setSaving(kind); setError(null); try { await importCatalogContent(recapImportPlan(recap.id, user, recap.sharePayload, kind === 'mesocycle')); setSaved(kind === 'mesocycle' ? 'Mesociclo guardado como borrador.' : 'Rutina guardada en tu biblioteca.'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la plantilla.'); } finally { setSaving(null); } };
  return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} /><ScrollView contentContainerStyle={styles.scroll}>
    {error ? <GlassCard><Text accessibilityRole="alert" style={{ color: theme.text }}>{error}</Text><GlassButton title="Reintentar" variant="secondary" onPress={() => void getWorkoutRecapDetail(id).then(setRecap).catch((reason) => setError(reason instanceof Error ? reason.message : 'No se pudo cargar el resumen.'))} /></GlassCard> : null}
    {!error && !recap ? <Text style={{ color: theme.textMuted }}>Cargando resumen...</Text> : null}
    {recap ? <><Text style={[styles.title, { color: theme.text }]}>{recap.routineName}</Text><Text style={{ color: theme.textMuted }}>{recap.authorAlias} · {Math.round(recap.durationSeconds / 60)} min · {recap.exerciseCount} ejercicios</Text>{recap.caption ? <Text style={[styles.caption, { color: theme.text }]}>{recap.caption}</Text> : null}
      {recap.sharePayload?.routine ? <GlassCard style={styles.card}><Text style={[styles.section, { color: theme.text }]}>Rutina compartida</Text>{recap.sharePayload.routine.exercises.map((exercise, index) => <Text key={`${exercise.name}-${index}`} style={{ color: theme.textMuted }}>{index + 1}. {exercise.name} · {exercise.sets.map((set) => `${set.reps} reps`).join(', ')}</Text>)}</GlassCard> : <GlassCard style={styles.card}><Text style={{ color: theme.textMuted }}>La plantilla no está disponible para este resumen histórico.</Text></GlassCard>}
      {recap.exercises.length ? recap.exercises.map((exercise, index) => <GlassCard key={`${exercise.name}-${index}`} style={styles.card}><Text style={[styles.exerciseName, { color: theme.text }]}>{exercise.name}</Text>{exercise.muscleGroupIds.length ? <Text style={{ color: theme.textMuted }}>{muscleGroupLabels(catalogMuscleGroups, exercise.muscleGroupIds).join(' · ')}</Text> : null}</GlassCard>) : null}
      {!recap.isAuthor && recap.templateAvailable ? <GlassButton title={saved ?? 'Guardar rutina'} loading={saving === 'routine'} disabled={!!saving || !!saved} onPress={() => void save('routine')} /> : null}{!recap.isAuthor && recap.mesocycleAvailable ? <GlassButton title="Guardar mesociclo" variant="secondary" loading={saving === 'mesocycle'} disabled={!!saving || !!saved} onPress={() => void save('mesocycle')} /> : null}
    </> : null}</ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1, paddingHorizontal: 20 }, scroll: { paddingBottom: 36, gap: 12 }, title: { fontSize: 28, fontWeight: '900', marginBottom: 4 }, card: { gap: 7 }, section: { fontSize: 18, fontWeight: '900' }, exerciseName: { fontSize: 17, fontWeight: '800' }, caption: { marginTop: 10 } });
