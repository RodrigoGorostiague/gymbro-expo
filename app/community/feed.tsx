import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { HapticPressable } from '../../components/HapticPressable';
import { GlassButton } from '../../components/UI';
import { useData } from '../../context/DataContext';
import { useSocial } from '../../context/SocialContext';
import { useTheme } from '../../context/ThemeContext';
import { WorkoutRecap } from '../../types';
import { getShopTheme } from '../../constants/shopThemes';
import { THEMES } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { muscleGroupLabels } from '../../utils/catalogMuscleGroups';
import { listJointWorkoutPosts } from '../../services/jointWorkouts';

const destinations = [
  ['Explorar', '/community/discover'], ['Mi círculo', '/community/circle'], ['Entrenar juntos', '/community/joint-workout'], ['Solicitudes', '/community/requests'], ['Planes recibidos', '/community/plan-inbox'], ['Notificaciones', '/community/notifications'],
] as const;

export default function CommunityFeedScreen() {
  const { theme } = useTheme();
  const { getWorkoutRecaps, deleteWorkoutRecap, realtimeRevision } = useSocial();
  const { catalogMuscleGroups = [] } = useData();
  const [recaps, setRecaps] = useState<WorkoutRecap[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [jointPosts, setJointPosts] = useState<Array<{ id: string; createdAt: string; participants: Array<{ id: string; alias: string; avatarId: string }> }>>([]);
  const load = useCallback(async (nextCursor: string | null = null, append = false) => {
    setLoading(true); setError(null);
    try {
      const [page, posts] = await Promise.all([getWorkoutRecaps(nextCursor), nextCursor ? Promise.resolve(null) : listJointWorkoutPosts()]);
      setRecaps((current) => append ? [...current, ...page.recaps.filter((item) => !current.some(({ id }) => id === item.id))] : page.recaps);
      if (posts) setJointPosts(posts);
      setCursor(page.nextCursor);
    } catch (reason) { if (!append) setRecaps([]); setError(reason instanceof Error ? reason.message : 'No se pudo actualizar el feed.'); }
    finally { setLoading(false); }
  }, [getWorkoutRecaps]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { if (realtimeRevision > 0) void load(); }, [load, realtimeRevision]);
  const remove = async (recap: WorkoutRecap) => { try { await deleteWorkoutRecap(recap.id); await load(); } catch (reason) { Alert.alert('No se pudo eliminar', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.'); } };
  const recapCard = (recap: WorkoutRecap) => {
    const authorTheme = getShopTheme(recap.authorThemeId ?? '') ?? (recap.authorAlias.toLocaleLowerCase() === 'brisas' ? THEMES.brisas : THEMES.rodaja);
    return <HapticPressable key={recap.id} accessibilityRole="button" accessibilityLabel={`Ver entrenamiento ${recap.routineName}`} onPress={() => router.push({ pathname: '/social/recap/[id]', params: { id: recap.id } })}><GlassCard style={styles.card}><LinearGradient colors={[authorTheme.primary, authorTheme.accent, authorTheme.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.authorBanner}><ProfileAvatar avatarId={recap.authorAvatarId} size={48} borderColor="rgba(255,255,255,0.7)" /><View style={styles.authorCopy}><Text style={styles.alias}>{recap.authorAlias}</Text><Text style={styles.authorAction}>Completó un entrenamiento</Text></View><Text style={styles.badge}>{recap.mesocycleAvailable ? 'MESOCICLO' : 'RUTINA'}</Text></LinearGradient><Text style={[styles.recapTitle, { color: theme.text }]}>{recap.routineName}</Text><View style={styles.metrics}><View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{Math.round(recap.durationSeconds / 60)}m</Text><Text style={{ color: theme.textMuted }}>duración</Text></View><View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{recap.exerciseCount}</Text><Text style={{ color: theme.textMuted }}>ejercicios</Text></View>{recap.metrics.volume !== undefined ? <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{Math.round(recap.metrics.volume)}</Text><Text style={{ color: theme.textMuted }}>kg movidos</Text></View> : null}</View>{recap.muscleGroupIds.length ? <Text style={[styles.muscles, { color: authorTheme.primary }]}>{muscleGroupLabels(catalogMuscleGroups, recap.muscleGroupIds).join(' · ')}</Text> : null}{recap.caption ? <Text style={[styles.caption, { color: theme.text }]}>{recap.caption}</Text> : null}<Text style={[styles.detailLink, { color: authorTheme.primary }]}>Ver entrenamiento completo</Text>{recap.isAuthor ? <GlassButton title="Eliminar publicación" variant="secondary" onPress={() => void remove(recap)} /> : null}</GlassCard></HapticPressable>;
  };
  return <ThemeBackground><SafeAreaView style={styles.safe}><ScrollView testID="community-feed" contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={theme.primary} />}><AppScreenHeader title="Comunidad" subtitle="Entrenamientos de tu círculo" />
    <View accessibilityRole="tablist" style={styles.destinations}>{destinations.map(([label, href]) => <HapticPressable key={href} accessibilityRole="tab" accessibilityLabel={`Abrir ${label}`} onPress={() => router.push(href)} style={[styles.destination, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}><Text style={{ color: theme.text, fontWeight: '700' }}>{label}</Text></HapticPressable>)}</View>
    <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Feed</Text>
    {error ? <GlassCard><Text accessibilityRole="alert" style={{ color: theme.text }}>{error}</Text><GlassButton title="Reintentar" variant="secondary" onPress={() => void load()} /></GlassCard> : null}
    {!loading && !error && !recaps.length && !jointPosts.length ? <GlassCard><Text style={{ color: theme.textMuted }}>Todavía no hay entrenamientos de tus conexiones.</Text></GlassCard> : null}{jointPosts.map((post) => <HapticPressable key={`joint-${post.id}`} accessibilityRole="button" accessibilityLabel="Ver entrenamiento conjunto" onPress={() => router.push({ pathname: '/community/joint/[id]', params: { id: post.id } })}><GlassCard style={styles.card}><Text style={[styles.recapTitle, { color: theme.text }]}>Entrenamiento conjunto</Text><View style={styles.jointPeople}>{post.participants.map((participant) => <View key={participant.id} style={styles.jointPerson}><ProfileAvatar avatarId={participant.avatarId} size={34} borderColor={theme.primary} /><Text style={{ color: theme.text }}>{participant.alias}</Text></View>)}</View><Text style={[styles.detailLink, { color: theme.primary }]}>Ver participantes</Text></GlassCard></HapticPressable>)}{recaps.map(recapCard)}{cursor ? <GlassButton title={loading ? 'Cargando…' : 'Ver más'} disabled={loading} variant="secondary" onPress={() => void load(cursor, true)} /> : null}
  </ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 12, paddingBottom: 36 }, destinations: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, destination: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 }, title: { fontSize: 20, fontWeight: '800', marginTop: 8 }, card: { gap: 12, paddingVertical: 18 }, authorBanner: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 15, padding: 12 }, authorCopy: { flex: 1, gap: 2 }, authorAction: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '600' }, metrics: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, gap: 2 }, metricValue: { fontSize: 18, fontWeight: '900' }, badge: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }, alias: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', letterSpacing: 0.1 }, recapTitle: { fontSize: 22, fontWeight: '900' }, muscles: { fontSize: 12, fontWeight: '800' }, caption: { marginTop: 2 }, detailLink: { fontSize: 14, fontWeight: '900' }, jointPeople: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, jointPerson: { flexDirection: 'row', alignItems: 'center', gap: 6 } });
