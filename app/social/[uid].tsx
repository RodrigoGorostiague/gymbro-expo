import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton } from '../../components/UI';
import { ExperienceProgressCard } from '../../components/ExperienceProgressCard';
import { MuscleDistributionRadar } from '../../components/MuscleDistributionRadar';
import { useSocial } from '../../context/SocialContext';
import { useTheme } from '../../context/ThemeContext';
import type { GraphSummary, PublicProfile, SocialProfileInsights } from '../../services/socialGraph';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { ProfileTitleBadge } from '../../components/ProfileTitleBadge';
import { getShopTheme } from '../../constants/shopThemes';
import type { AppTheme, ProfilePlanLibrary } from '../../types';

function completedAtLabel(value: string | null) {
  if (!value) return 'Todavía no registró entrenamientos.';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `Último entrenamiento: ${date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}` : 'Actividad reciente no disponible.';
}

function InsightStat({ value, label, theme }: { value: number; label: string; theme: AppTheme }) {
  return <View style={[styles.stat, { borderColor: theme.glassBorder }]}><Text style={[styles.statValue, { color: theme.text }]}>{value}</Text><Text style={[styles.statLabel, { color: theme.textMuted }]}>{label}</Text></View>;
}

function PublicProfileSkeleton({ theme }: { theme: AppTheme }) {
  const placeholder = { backgroundColor: theme.glassBorder };
  return <View accessibilityLabel="Cargando perfil" style={styles.skeleton}>
    <GlassCard style={styles.hero}>
      <View style={styles.heroRow}>
        <View style={[styles.skeletonAvatar, placeholder]} />
        <View style={styles.heroCopy}>
          <View style={[styles.skeletonAlias, placeholder]} />
          <View style={[styles.skeletonSubtitle, placeholder]} />
        </View>
      </View>
    </GlassCard>
    <GlassCard style={styles.skeletonCard}>
      <View style={[styles.skeletonSectionTitle, placeholder]} />
      <View style={[styles.skeletonRow, placeholder]} />
      <View style={[styles.skeletonRow, styles.skeletonRowShort, placeholder]} />
    </GlassCard>
    <GlassCard style={styles.skeletonCard}>
      <View style={[styles.skeletonSectionTitle, placeholder]} />
      <View style={styles.skeletonStats}>
        <View style={[styles.skeletonStat, placeholder]} />
        <View style={[styles.skeletonStat, placeholder]} />
      </View>
    </GlassCard>
  </View>;
}

export default function PublicProfileScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { theme } = useTheme();
  const { ownProfile, getProfile, getSummary, getProfileInsights, getProfilePlanLibrary, command, realtimeRevision } = useSocial();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [summary, setSummary] = useState<GraphSummary | null>(null);
  const [insights, setInsights] = useState<SocialProfileInsights | null>(null);
  const [planLibrary, setPlanLibrary] = useState<ProfilePlanLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    if (ownProfile?.uid === uid) {
      router.replace('/profile');
      return;
    }
    setLoading(true);
    try {
      const [nextProfile, nextSummary] = await Promise.all([getProfile(uid), getSummary(uid)]);
      setProfile(nextProfile);
      setSummary(nextSummary);
      if (nextSummary.relationshipKind) {
        const [nextInsights, nextPlans] = await Promise.all([getProfileInsights(uid), getProfilePlanLibrary(uid)]);
        setInsights(nextInsights);
        setPlanLibrary(nextPlans);
      } else {
        setInsights(null);
        setPlanLibrary(null);
      }
    } catch (error) {
      setInsights(null);
      setPlanLibrary(null);
      Alert.alert('Perfil no disponible', error instanceof Error ? error.message : 'Este perfil ya no está disponible.');
    } finally {
      setLoading(false);
    }
  }, [getProfile, getProfileInsights, getProfilePlanLibrary, getSummary, ownProfile?.uid, uid]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { if (realtimeRevision > 0) void load(); }, [load, realtimeRevision]);
  useEffect(() => {
    if (!summary?.outgoingRequest || !uid) return undefined;
    const timer = setInterval(() => { void getSummary(uid).then(setSummary).catch(() => undefined); }, 10_000);
    return () => clearInterval(timer);
  }, [getSummary, summary?.outgoingRequest, uid]);

  const act = async (input: Parameters<typeof command>[0]) => {
    setActing(true);
    try {
      setSummary(await command(input));
    } catch (error) {
      Alert.alert('Acción no disponible', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setActing(false);
    }
  };
  const requestKindLabel = summary?.requestKind === 'partner' ? 'GymCrush' : 'Bro';
  const downgrade = () => Alert.alert('Bajar a Bro', 'Esta acción conserva la conexión y la cambia de GymCrush a Bro.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Bajar a Bro', style: 'destructive', onPress: () => void act({ command: 'downgradePartner', targetId: uid }) },
  ]);
  const connected = Boolean(summary?.relationshipKind);
  const profileTheme = connected ? getShopTheme(profile?.presentationThemeId ?? '') : undefined;
  const palette = profileTheme ?? theme;

  return <ThemeBackground theme={profileTheme}><SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.scroll}><AppNavBar onBack={() => router.back()} />
    {loading ? <PublicProfileSkeleton theme={theme} /> : !profile ? <Text style={{ color: theme.text }}>Este perfil no está disponible.</Text> : <>
      <GlassCard theme={profileTheme} style={[styles.hero, connected && { backgroundColor: palette.primary, borderColor: palette.accent }]}>
        <View style={styles.heroRow}>
          <View style={[styles.heroAvatarShell, { borderColor: connected ? `${palette.onPrimary}4D` : theme.primary, backgroundColor: connected ? 'rgba(255,255,255,0.14)' : theme.glass }]}>
            <ProfileAvatar avatarId={profile.avatarId} frameId={profile.frameId} level={insights?.progress?.level} size={92} borderColor={connected ? palette.onPrimary : theme.primary} />
          </View>
          <View style={styles.heroCopy}>
            <View style={styles.heroMetaRow}>
              <Text accessibilityRole="header" style={[styles.alias, { color: connected ? palette.onPrimary : theme.text }]}>{profile.alias}</Text>
              <View style={[styles.heroBadge, { backgroundColor: connected ? 'rgba(0,0,0,0.22)' : theme.glass, borderColor: connected ? 'rgba(255,255,255,0.22)' : theme.glassBorder }]}>
                <Text style={[styles.heroBadgeText, { color: connected ? palette.onPrimary : theme.textMuted }]}>{connected ? summary?.relationshipKind === 'partner' ? 'GymCrush' : 'Bro' : 'Comunidad'}</Text>
              </View>
            </View>
            <ProfileTitleBadge titleId={profile.titleId} />
            <Text style={[styles.heroSubtitle, { color: connected ? 'rgba(255,255,255,0.82)' : theme.textMuted }]}>
              {connected ? completedAtLabel(insights?.activity?.lastCompletedAt ?? null) : 'Perfil publico de la comunidad de GymBro.'}
            </Text>
          </View>
        </View>
      </GlassCard>
      {Object.entries(profile.categories).filter(([key]) => key !== 'trainingStyle').length ? <GlassCard theme={profileTheme}>{Object.entries(profile.categories).filter(([key]) => key !== 'trainingStyle').map(([key, value]) => <View key={key} style={styles.category}><Text style={{ color: palette.textMuted }}>{key}</Text><Text style={{ color: palette.text }}>{value}</Text></View>)}</GlassCard> : null}
      {connected && insights?.progress ? <GlassCard theme={profileTheme} style={{ borderColor: palette.accent }}><ExperienceProgressCard progress={{ level: insights.progress.level, rank: insights.progress.rank as any, xpIntoLevel: 0, xpForNextLevel: 1, totalXp: 0 }} frameId={profile.frameId} theme={palette} title="Rango de entrenamiento" /></GlassCard> : null}
      {connected && insights?.muscleDistribution ? <GlassCard theme={profileTheme} style={{ borderColor: palette.accent }}><Text accessibilityRole="header" style={[styles.sectionTitle, { color: palette.primary }]}>Distribución muscular</Text><Text style={[styles.sectionSubtitle, { color: palette.textMuted }]}>Ejercicios completados en los últimos 90 días.</Text><MuscleDistributionRadar data={insights.muscleDistribution} palette={palette} /></GlassCard> : null}
      {connected && (insights?.activity || insights?.consistency || insights?.statistics) ? <GlassCard theme={profileTheme}><Text accessibilityRole="header" style={[styles.sectionTitle, { color: palette.text }]}>Estado de entrenamiento</Text>{insights.activity ? <Text style={[styles.activity, { color: palette.textMuted }]}>{completedAtLabel(insights.activity.lastCompletedAt)}</Text> : null}<View style={styles.stats}>{insights.consistency ? <><InsightStat theme={palette} value={insights.consistency.workoutsLast28Days} label="sesiones / 28 días" /><InsightStat theme={palette} value={insights.consistency.activeWeeksLast90Days} label="semanas activas" /></> : null}{insights.statistics ? <><InsightStat theme={palette} value={insights.statistics.workoutsLast90Days} label="sesiones / 90 días" /><InsightStat theme={palette} value={insights.statistics.completedExercisesLast90Days} label="ejercicios" /></> : null}</View></GlassCard> : null}
      {connected && planLibrary ? <GlassCard theme={profileTheme}><Text accessibilityRole="header" style={[styles.sectionTitle, { color: palette.text }]}>Planificación</Text>{planLibrary.routines.map((routine) => <View key={routine.id} style={[styles.planItem, { borderTopColor: palette.glassBorder }]}><Text style={[styles.planKind, { color: palette.primary }]}>Rutina</Text><Text style={{ color: palette.text }}>{routine.name}</Text></View>)}{planLibrary.mesocycles.map((mesocycle) => <View key={mesocycle.id} style={[styles.planItem, { borderTopColor: palette.glassBorder }]}><Text style={[styles.planKind, { color: palette.primary }]}>Mesociclo</Text><Text style={{ color: palette.text }}>{mesocycle.name}</Text></View>)}{!planLibrary.routines.length && !planLibrary.mesocycles.length ? <Text style={{ color: palette.textMuted }}>No hay planes compartidos.</Text> : null}</GlassCard> : null}
      {summary?.incomingRequest ? <Text style={[styles.request, { color: palette.text }]}>Solicitud para ser {requestKindLabel}</Text> : null}
      {summary?.blocked ? <GlassButton theme={profileTheme} title="Desbloquear" onPress={() => void act({ command: 'unblock', targetId: uid })} loading={acting} /> : summary?.incomingRequest ? <><GlassButton theme={profileTheme} title={`Aceptar solicitud de ${requestKindLabel}`} onPress={() => void act({ command: 'respondRequest', targetId: uid, accepted: true })} loading={acting} /><GlassButton theme={profileTheme} title="Rechazar solicitud" variant="secondary" onPress={() => void act({ command: 'respondRequest', targetId: uid, accepted: false })} disabled={acting} /></> : summary?.outgoingRequest ? <GlassButton theme={profileTheme} title="Cancelar solicitud" onPress={() => void act({ command: 'cancelRequest', targetId: uid })} loading={acting} /> : summary?.relationshipKind === 'bro' ? <GlassButton theme={profileTheme} title="Solicitar GymCrush" onPress={() => void act({ command: 'sendRequest', targetId: uid, relationshipKind: 'partner' })} loading={acting} /> : summary?.relationshipKind === 'partner' ? <GlassButton theme={profileTheme} title="Bajar a Bro" variant="secondary" onPress={downgrade} disabled={acting} /> : <><GlassButton theme={profileTheme} title="Invitar como Bro" onPress={() => void act({ command: 'sendRequest', targetId: uid, relationshipKind: 'bro' })} loading={acting} /><GlassButton theme={profileTheme} title="Invitar como GymCrush" variant="secondary" onPress={() => void act({ command: 'sendRequest', targetId: uid, relationshipKind: 'partner' })} disabled={acting} /></>}
    </>}
  </ScrollView></SafeAreaView></ThemeBackground>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { gap: 14, padding: 20, paddingBottom: 36 }, hero: { alignSelf: 'stretch' }, heroRow: { alignItems: 'center', flexDirection: 'row', gap: 16 }, heroAvatarShell: { borderRadius: 999, borderWidth: 1, padding: 6 }, heroCopy: { flex: 1, gap: 8 }, heroMetaRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, heroBadge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 }, heroBadgeText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }, heroSubtitle: { fontSize: 13, lineHeight: 18 }, alias: { fontSize: 29, fontWeight: '900', flexShrink: 1 }, relationship: { fontSize: 13, fontWeight: '900', textTransform: 'uppercase' }, category: { gap: 3, marginBottom: 12 }, sectionTitle: { fontSize: 20, fontWeight: '900' }, sectionSubtitle: { fontSize: 13, marginTop: 3 }, activity: { fontSize: 13, marginTop: 12 }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }, stat: { borderRadius: 12, borderWidth: 1, flexGrow: 1, minWidth: '45%', padding: 10 }, statValue: { fontSize: 21, fontWeight: '900' }, statLabel: { fontSize: 11, marginTop: 2 }, planKind: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }, planItem: { borderTopWidth: StyleSheet.hairlineWidth, gap: 3, paddingVertical: 9 }, request: { fontWeight: '800' }, skeleton: { gap: 14 }, skeletonAvatar: { borderRadius: 52, height: 104, width: 104 }, skeletonAlias: { borderRadius: 7, height: 29, maxWidth: 190, width: '78%' }, skeletonSubtitle: { borderRadius: 5, height: 15, maxWidth: 240, width: '100%' }, skeletonCard: { gap: 12 }, skeletonSectionTitle: { borderRadius: 6, height: 20, width: '48%' }, skeletonRow: { borderRadius: 5, height: 14, width: '100%' }, skeletonRowShort: { width: '66%' }, skeletonStats: { flexDirection: 'row', gap: 8 }, skeletonStat: { borderRadius: 12, flex: 1, height: 72 } });
