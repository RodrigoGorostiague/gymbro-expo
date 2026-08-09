import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { HapticPressable } from '../../components/HapticPressable';
import { GlassButton } from '../../components/UI';
import { JointWorkoutFeedCard } from '../../components/JointWorkoutFeedCard';
import { useSocial } from '../../context/SocialContext';
import { useTheme } from '../../context/ThemeContext';
import { CommunityActivity, WorkoutRecap } from '../../types';
import { WorkoutPublicationCard } from '../../components/WorkoutPublicationCard';
import { CommunityMilestoneCard } from '../../components/CommunityMilestoneCard';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { listJointWorkoutPosts } from '../../services/jointWorkouts';
import { CommunityBadgeCounts, getCommunityBadgeCounts } from '../../services/communityBadge';
import { listWorkoutStartActivities, WorkoutStartActivity } from '../../services/workoutStartActivity';
import { setWorkoutRecapReaction } from '../../services/workoutRecapFeed';
import { feedDayKey, formatFeedDay, formatRelativeTime } from '../../utils/feedTimeline';

const primaryDestinations: ReadonlyArray<{ label: string; href: string; badgeKey?: keyof Omit<CommunityBadgeCounts, 'total'> }> = [
  { label: 'Explorar', href: '/community/discover' },
  { label: 'Mi círculo', href: '/community/circle' },
  { label: 'Entrenar juntos', href: '/community/joint-workout', badgeKey: 'jointInvitations' },
] as const;

const pendingDestinations: ReadonlyArray<readonly [string, string, keyof Omit<CommunityBadgeCounts, 'total'>]> = [
  ['Solicitudes', '/community/requests', 'incomingRequests'],
  ['Planes', '/community/plan-inbox', 'planShareRequests'],
  ['Notificaciones', '/community/notifications', 'unreadNotifications'],
];

function badgeLabel(count: number): string | null {
  return count > 99 ? '99+' : count > 0 ? String(count) : null;
}

type JointPost = { id: string; createdAt: string; participants: Array<{ id: string; alias: string; avatarId: string; status: 'invited' | 'active' | 'completed' | 'declined' }> };
type FeedItem =
  | { kind: 'recap'; id: string; publishedAt: string; recap: WorkoutRecap }
  | { kind: 'joint'; id: string; publishedAt: string; post: JointPost }
  | { kind: 'milestone'; id: string; publishedAt: string; activity: CommunityActivity }
  | { kind: 'start'; id: string; publishedAt: string; activity: WorkoutStartActivity };

function timestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export default function CommunityFeedScreen() {
  const { theme } = useTheme();
  const { getWorkoutRecaps, getCommunityActivities, deleteWorkoutRecap, realtimeRevision } = useSocial();
  const [recaps, setRecaps] = useState<WorkoutRecap[]>([]);
  const [recapCursor, setRecapCursor] = useState<string | null>(null);
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jointPosts, setJointPosts] = useState<JointPost[]>([]);
  const [activities, setActivities] = useState<readonly CommunityActivity[]>([]);
  const [startActivities, setStartActivities] = useState<WorkoutStartActivity[]>([]);
  const [badges, setBadges] = useState<CommunityBadgeCounts | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (nextRecapCursor: string | null = null, nextActivityCursor: string | null = null, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const [page, posts, activities, starts, nextBadges] = await Promise.all([
        getWorkoutRecaps(nextRecapCursor),
        nextRecapCursor ? Promise.resolve(null) : listJointWorkoutPosts(),
        getCommunityActivities(nextActivityCursor),
        nextRecapCursor || nextActivityCursor ? Promise.resolve(null) : listWorkoutStartActivities().catch(() => null),
        nextRecapCursor || nextActivityCursor ? Promise.resolve(null) : getCommunityBadgeCounts().catch(() => null),
      ]);
      setRecaps((current) => append ? [...current, ...page.recaps.filter((item) => !current.some(({ id }) => id === item.id))] : page.recaps);
      if (posts) setJointPosts(posts);
       setActivities((current) => append ? [...current, ...activities.activities.filter((item) => !current.some(({ id }) => id === item.id))] : activities.activities);
      if (starts) setStartActivities(starts);
      if (nextBadges) setBadges(nextBadges);
       setRecapCursor(page.nextCursor);
       setActivityCursor(activities.nextCursor);
    } catch (reason) {
      if (!append) setRecaps([]);
      setError(reason instanceof Error ? reason.message : 'No se pudo actualizar el feed.');
    } finally {
      setLoading(false);
    }
  }, [getCommunityActivities, getWorkoutRecaps]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { if (realtimeRevision > 0) void load(); }, [load, realtimeRevision]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const remove = async (recap: WorkoutRecap) => {
    try {
      await deleteWorkoutRecap(recap.id);
      await load();
    } catch (reason) {
      Alert.alert('No se pudo eliminar', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.');
    }
  };
  const toggleReaction = async (recap: WorkoutRecap) => {
    const reacted = !recap.viewerHasReacted;
    setRecaps((current) => current.map((item) => item.id === recap.id ? { ...item, viewerHasReacted: reacted, reactionCount: Math.max(0, (item.reactionCount ?? 0) + (reacted ? 1 : -1)) } : item));
    try {
      const state = await setWorkoutRecapReaction(recap.id, reacted);
      setRecaps((current) => current.map((item) => item.id === recap.id ? { ...item, viewerHasReacted: state.reacted, reactionCount: state.reactionCount } : item));
    } catch (reason) {
      setRecaps((current) => current.map((item) => item.id === recap.id ? recap : item));
      Alert.alert('No se pudo actualizar la estrella', reason instanceof Error ? reason.message : 'Intentá nuevamente.');
    }
  };

  const recapCard = (recap: WorkoutRecap) => <View>
    <WorkoutPublicationCard recap={recap} now={now} onPress={() => router.push({ pathname: '/social/recap/[id]', params: { id: recap.id } })} onProfilePress={recap.authorId && !recap.isAuthor ? () => router.push({ pathname: '/social/[uid]', params: { uid: recap.authorId! } }) : undefined} onToggleReaction={!recap.isAuthor ? () => void toggleReaction(recap) : undefined} />
    {recap.isAuthor ? <GlassButton title="Eliminar publicación" variant="secondary" onPress={() => void remove(recap)} /> : null}
  </View>;

  const feed: FeedItem[] = [
    ...recaps.map((recap) => ({ kind: 'recap' as const, id: recap.id, publishedAt: recap.createdAt, recap })),
    ...jointPosts.map((post) => ({ kind: 'joint' as const, id: post.id, publishedAt: post.createdAt, post })),
    ...activities.map((activity) => ({ kind: 'milestone' as const, id: activity.id, publishedAt: activity.createdAt, activity })),
    ...startActivities.map((activity) => ({ kind: 'start' as const, id: activity.id, publishedAt: activity.startedAt, activity })),
  ].sort((left, right) => timestamp(right.publishedAt) - timestamp(left.publishedAt) || right.id.localeCompare(left.id));

  const feedCard = (item: FeedItem) => {
    if (item.kind === 'recap') return recapCard(item.recap);
    if (item.kind === 'joint') return <JointWorkoutFeedCard workoutId={item.post.id} participants={item.post.participants} publishedAt={item.publishedAt} now={now} />;
    if (item.kind === 'milestone') return <CommunityMilestoneCard activity={item.activity} now={now} />;
    const activity = item.activity;
    return <GlassCard style={styles.startCard}><View style={[styles.liveDot, { backgroundColor: theme.primary }]} /><ProfileAvatar avatarId={activity.authorAvatarId} size={38} borderColor={theme.primary} /><View style={styles.startCopy}><Text style={[styles.startTitle, { color: theme.text }]}>{activity.isAuthor ? 'Comenzaste' : `${activity.authorAlias} comenzó`} {activity.jointWorkoutId ? 'a entrenar juntos' : 'un entrenamiento'}</Text><Text style={{ color: theme.textMuted }}>{activity.routineName} · En vivo para tu círculo</Text></View><Text style={[styles.startTime, { color: theme.textMuted }]}>{formatRelativeTime(activity.startedAt, now)}</Text></GlassCard>;
  };

  return <ThemeBackground><SafeAreaView style={styles.safe}><ScrollView testID="community-feed" contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={theme.primary} />}>
    <AppScreenHeader title="Comunidad" subtitle="Tu círculo se entrena con vos" />
    <View accessibilityRole="tablist" style={styles.destinations}>{primaryDestinations.map(({ label, href, badgeKey }) => {
      const count = badgeKey ? badges?.[badgeKey] ?? 0 : 0;
      return <HapticPressable key={href} accessibilityRole="tab" accessibilityLabel={`Abrir ${label}${count ? `, ${count} pendientes` : ''}`} onPress={() => router.push(href)} style={[styles.destination, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}><Text style={{ color: theme.text, fontWeight: '700' }}>{label}</Text>{badgeLabel(count) ? <View style={[styles.count, { backgroundColor: theme.primary }]}><Text style={styles.countText}>{badgeLabel(count)}</Text></View> : null}</HapticPressable>;
    })}</View>
    <View style={[styles.pending, { borderColor: theme.glassBorder }]}><Text style={[styles.pendingTitle, { color: theme.textMuted }]}>PENDIENTES</Text><View style={styles.pendingActions}>{pendingDestinations.map(([label, href, key]) => {
      const count = badges?.[key] ?? 0;
      return <HapticPressable key={`${href}-${key}`} accessibilityRole="button" accessibilityLabel={`${label}${count ? `, ${count} nuevos` : ''}`} onPress={() => router.push(href)} style={styles.pendingAction}><Text style={{ color: theme.text }}>{label}</Text>{badgeLabel(count) ? <View style={[styles.count, { backgroundColor: theme.primary }]}><Text style={styles.countText}>{badgeLabel(count)}</Text></View> : null}</HapticPressable>;
    })}</View></View>
    <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Feed</Text>
    {error ? <GlassCard><Text accessibilityRole="alert" style={{ color: theme.text }}>{error}</Text><GlassButton title="Reintentar" variant="secondary" onPress={() => void load()} /></GlassCard> : null}
    {!loading && !error && !feed.length ? <GlassCard><Text style={{ color: theme.textMuted }}>Todavía no hay actividad de tus conexiones. Cuando alguien entrene, aparecerá acá.</Text></GlassCard> : null}
    {feed.map((item, index) => <React.Fragment key={`${item.kind}-${item.id}`}>
      {index === 0 || feedDayKey(feed[index - 1].publishedAt) !== feedDayKey(item.publishedAt) ? <View accessibilityRole="header" style={[styles.dateDivider, { borderColor: theme.glassBorder }]}><Text style={[styles.dateLabel, { color: theme.textMuted }]}>{formatFeedDay(item.publishedAt, now)}</Text></View> : null}
      {feedCard(item)}
    </React.Fragment>)}
    {recapCursor || activityCursor ? <GlassButton title={loading ? 'Cargando…' : 'Ver más'} disabled={loading} variant="secondary" onPress={() => void load(recapCursor, activityCursor, true)} /> : null}
  </ScrollView></SafeAreaView></ThemeBackground>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 20, gap: 12, paddingBottom: 36 },
  destinations: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  destination: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  pending: { borderTopWidth: StyleSheet.hairlineWidth, gap: 8, paddingTop: 12 },
  pendingTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  pendingActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pendingAction: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  count: { alignItems: 'center', borderRadius: 999, justifyContent: 'center', minWidth: 18, paddingHorizontal: 5, paddingVertical: 2 },
  countText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  title: { fontSize: 20, fontWeight: '800', marginTop: 8 },
  dateDivider: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 12 },
  dateLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  startCard: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 14 },
  liveDot: { borderRadius: 5, height: 10, width: 10 },
  startCopy: { flex: 1, gap: 3 },
  startTitle: { fontSize: 16, fontWeight: '900' },
  startTime: { fontSize: 11, fontWeight: '700' },
});
