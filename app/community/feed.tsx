import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { HapticPressable } from '../../components/HapticPressable';
import { GlassButton, GlassInput } from '../../components/UI';
import { useData } from '../../context/DataContext';
import { useSocial } from '../../context/SocialContext';
import { useTheme } from '../../context/ThemeContext';
import { recapInputFromSession, recapSharePayload } from '../../services/workoutRecapFeed';
import { WorkoutRecap, WorkoutSession } from '../../types';
import { muscleGroupLabels } from '../../utils/catalogMuscleGroups';

const destinations = [
  ['Explorar', '/community/discover'], ['Mi círculo', '/community/circle'], ['Solicitudes', '/community/requests'],
] as const;

export default function CommunityFeedScreen() {
  const { theme } = useTheme();
  const { ownProfile, getWorkoutRecaps, createWorkoutRecap, deleteWorkoutRecap, failedAutoRecapSessionIds, clearFailedAutoRecapSession, realtimeRevision } = useSocial();
  const { sessions = [], routines = [], mesocycles = [], ensureRecapPublicationKey, catalogMuscleGroups = [] } = useData();
  const [recaps, setRecaps] = useState<WorkoutRecap[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState(''); const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const load = useCallback(async (nextCursor: string | null = null, append = false) => {
    setLoading(true); setError(null);
    try {
      const page = await getWorkoutRecaps(nextCursor);
      setRecaps((current) => append ? [...current, ...page.recaps.filter((item) => !current.some(({ id }) => id === item.id))] : page.recaps);
      setCursor(page.nextCursor);
    } catch (reason) { if (!append) setRecaps([]); setError(reason instanceof Error ? reason.message : 'No se pudo actualizar el feed.'); }
    finally { setLoading(false); }
  }, [getWorkoutRecaps]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { if (realtimeRevision > 0) void load(); }, [load, realtimeRevision]);
  const publish = async () => {
    const session = sessions.find(({ id }) => id === selectedSessionId); if (!session) return;
    setLoading(true);
    try { const input = recapInputFromSession(session, caption); input.sharePayload = recapSharePayload(session, routines.find(({ id }) => id === session.routineId), session.lineage ? mesocycles.find(({ id }) => id === session.lineage?.mesocycleId) : undefined, routines, ownProfile ?? { shareRoutineTemplate: true, shareMesocycleTemplate: true, sharePerformedSetDetails: true }); await createWorkoutRecap(input, await ensureRecapPublicationKey(session.id)); clearFailedAutoRecapSession(session.id); setCaption(''); setSelectedSessionId(null); await load(); }
    catch (reason) { Alert.alert('No se pudo compartir', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.'); }
    finally { setLoading(false); }
  };
  const remove = async (recap: WorkoutRecap) => { try { await deleteWorkoutRecap(recap.id); await load(); } catch (reason) { Alert.alert('No se pudo eliminar', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.'); } };
  const recapCard = (recap: WorkoutRecap) => <HapticPressable key={recap.id} accessibilityRole="button" accessibilityLabel={`Ver entrenamiento ${recap.routineName}`} onPress={() => router.push({ pathname: '/social/recap/[id]', params: { id: recap.id } })}><GlassCard style={styles.card}><View style={styles.cardHeader}><Text style={[styles.alias, { color: theme.text }]}>{recap.authorAlias}</Text><Text style={[styles.badge, { color: recap.templateAvailable ? theme.primary : theme.textMuted }]}>{recap.templateAvailable ? 'PLANTILLA DISPONIBLE' : 'SOLO RESUMEN'}</Text></View><Text style={[styles.recapTitle, { color: theme.text }]}>{recap.routineName}</Text><View style={styles.stats}><Text style={{ color: theme.textMuted }}>{Math.round(recap.durationSeconds / 60)} min</Text><Text style={{ color: theme.textMuted }}>{recap.exerciseCount} ejercicios</Text>{recap.metrics.volume !== undefined ? <Text style={{ color: theme.textMuted }}>{Math.round(recap.metrics.volume)} kg</Text> : null}</View>{recap.muscleGroupIds.length ? <Text style={{ color: theme.textMuted }}>{muscleGroupLabels(catalogMuscleGroups, recap.muscleGroupIds).join(' · ')}</Text> : null}{recap.caption ? <Text style={[styles.caption, { color: theme.text }]}>{recap.caption}</Text> : null}<GlassButton title="Ver detalle" variant="secondary" onPress={() => router.push({ pathname: '/social/recap/[id]', params: { id: recap.id } })} />{recap.isAuthor ? <GlassButton title="Eliminar" variant="secondary" onPress={() => void remove(recap)} /> : null}</GlassCard></HapticPressable>;
  const sessionOption = (session: WorkoutSession) => <GlassButton key={session.id} title={selectedSessionId === session.id ? `Seleccionado: ${session.routineName}` : `Compartir: ${session.routineName}`} variant="secondary" onPress={() => setSelectedSessionId(session.id)} />;
  const manualSessions = sessions.filter((session) => !ownProfile?.autoShareCompletedWorkouts || failedAutoRecapSessionIds.has(session.id)).slice(0, 5);
  return <ThemeBackground><SafeAreaView style={styles.safe}><ScrollView testID="community-feed" contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={theme.primary} />}><AppScreenHeader title="Comunidad" subtitle="Entrenamientos de tu círculo" />
    <View accessibilityRole="tablist" style={styles.destinations}>{destinations.map(([label, href]) => <HapticPressable key={href} accessibilityRole="tab" accessibilityLabel={`Abrir ${label}`} onPress={() => router.push(href)} style={[styles.destination, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}><Text style={{ color: theme.text, fontWeight: '700' }}>{label}</Text></HapticPressable>)}</View>
    <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Feed</Text>
    {(!ownProfile?.autoShareCompletedWorkouts || failedAutoRecapSessionIds.size) ? <GlassCard><Text style={[styles.recapTitle, { color: theme.text }]}>Comparte un resumen</Text><Text style={{ color: theme.textMuted }}>{ownProfile?.autoShareCompletedWorkouts ? 'Podés reintentar los resúmenes que no se publicaron automáticamente.' : 'Solo se comparte un resumen sin series, notas ni datos locales.'}</Text>{manualSessions.map(sessionOption)}<GlassInput placeholder="Caption opcional" value={caption} onChangeText={setCaption} maxLength={280} style={styles.input} multiline /><GlassButton title="Publicar resumen" disabled={!selectedSessionId || loading} loading={loading} onPress={() => void publish()} /></GlassCard> : null}
    {error ? <GlassCard><Text accessibilityRole="alert" style={{ color: theme.text }}>{error}</Text><GlassButton title="Reintentar" variant="secondary" onPress={() => void load()} /></GlassCard> : null}
    {!loading && !error && !recaps.length ? <GlassCard><Text style={{ color: theme.textMuted }}>Todavía no hay entrenamientos de tus conexiones.</Text></GlassCard> : null}{recaps.map(recapCard)}{cursor ? <GlassButton title={loading ? 'Cargando…' : 'Ver más'} disabled={loading} variant="secondary" onPress={() => void load(cursor, true)} /> : null}
  </ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 12, paddingBottom: 36 }, destinations: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, destination: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 }, title: { fontSize: 20, fontWeight: '800', marginTop: 8 }, card: { gap: 9, paddingVertical: 18 }, cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, badge: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }, alias: { fontSize: 17, fontWeight: '800' }, recapTitle: { fontSize: 21, fontWeight: '900' }, caption: { marginTop: 8 }, input: { marginTop: 10 } });
