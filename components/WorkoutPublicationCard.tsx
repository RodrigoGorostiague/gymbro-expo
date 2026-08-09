import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WorkoutRecap } from '../types';
import { getShopTheme } from '../constants/shopThemes';
import { THEMES } from '../constants/theme';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { muscleGroupLabels } from '../utils/catalogMuscleGroups';
import { GlassCard } from './GlassCard';
import { ProfileAvatar } from './ProfileAvatar';
import { formatRelativeTime } from '../utils/feedTimeline';
import { MiniMuscleDistributionRadar } from './MiniMuscleDistributionRadar';
import { HapticPressable } from './HapticPressable';
import { ProfileTitleBadge } from './ProfileTitleBadge';

/** Shared feed surface for one athlete's recap; joint posts compose participant cards separately. */
export function WorkoutPublicationCard({ recap, now = Date.now(), onPress, onProfilePress, onToggleReaction }: { recap: WorkoutRecap; now?: number; onPress?: () => void; onProfilePress?: () => void; onToggleReaction?: () => void }) {
  const { theme } = useTheme();
  const { catalogMuscleGroups = [] } = useData();
  const authorTheme = getShopTheme(recap.authorThemeId ?? '') ?? (recap.authorAlias.toLocaleLowerCase() === 'brisas' ? THEMES.brisas : THEMES.rodaja);
  const muscleDistribution = (recap.muscleDistribution ?? []).map(({ id, value }) => ({ id, label: muscleGroupLabels(catalogMuscleGroups, [id])[0] ?? id, value }));
  const header = <LinearGradient colors={[authorTheme.primary, authorTheme.accent, authorTheme.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.authorBanner}>
      <ProfileAvatar avatarId={recap.authorAvatarId} frameId={recap.authorFrameId} size={48} borderColor="rgba(255,255,255,0.7)" />
      <View style={styles.authorCopy}><Text style={styles.alias}>{recap.authorAlias}</Text>{recap.authorTitleId ? <ProfileTitleBadge titleId={recap.authorTitleId} /> : <Text style={styles.authorAction}>Completó un entrenamiento</Text>}</View>
      <View style={styles.bannerMeta}><Text style={styles.badge}>{recap.mesocycleAvailable ? 'MESOCICLO' : 'RUTINA'}</Text><Text style={styles.publishedAt}>{formatRelativeTime(recap.createdAt, now)}</Text></View>
    </LinearGradient>;
  const commentCount = recap.commentCount ?? 0;
  const summary = <View style={styles.summary}>
    <Text style={[styles.recapTitle, { color: theme.text }]}>{recap.routineName}</Text>
    <View style={styles.metrics}><Metric value={`${Math.round(recap.durationSeconds / 60)}m`} label="duración" color={theme.text} /><Metric value={String(recap.exerciseCount)} label="ejercicios" color={theme.text} />{recap.metrics.volume !== undefined ? <Metric value={String(Math.round(recap.metrics.volume))} label="kg movidos" color={theme.text} /> : null}</View>
    {muscleDistribution.length ? <View style={styles.muscleFocus}><Text style={[styles.muscles, { color: authorTheme.primary }]}>{muscleDistribution.map(({ label }) => label).join(' · ')}</Text><MiniMuscleDistributionRadar data={muscleDistribution} color={authorTheme.primary} fill={authorTheme.accent} /></View> : recap.muscleGroupIds.length ? <Text style={[styles.muscles, { color: authorTheme.primary }]}>{muscleGroupLabels(catalogMuscleGroups, recap.muscleGroupIds).join(' · ')}</Text> : null}
    {recap.caption ? <Text style={[styles.caption, { color: theme.text }]}>{recap.caption}</Text> : null}
    <View style={styles.footer}>{onPress ? <Text style={[styles.detailLink, { color: authorTheme.primary }]}>Ver entrenamiento completo</Text> : <View />}
      <View style={styles.socialCounts}>
        <Text style={[styles.commentText, { color: theme.textMuted }]}>💬 {commentCount}</Text>
        {onToggleReaction ? <HapticPressable accessibilityRole="button" accessibilityLabel={recap.viewerHasReacted ? 'Quitar estrella' : 'Dar estrella'} onPress={onToggleReaction} style={styles.reaction}><Text style={[styles.reactionText, { color: recap.viewerHasReacted ? authorTheme.primary : theme.textMuted }]}>★ {recap.reactionCount ?? 0}</Text></HapticPressable> : <Text style={[styles.reactionText, { color: theme.textMuted }]}>★ {recap.reactionCount ?? 0}</Text>}
      </View>
    </View>
  </View>;
  return <GlassCard style={styles.card}>
    {onProfilePress ? <HapticPressable accessibilityRole="button" accessibilityLabel={`Ver perfil de ${recap.authorAlias}`} accessibilityHint="Abre el perfil del atleta" onPress={onProfilePress}>{header}</HapticPressable> : header}
    {onPress ? <HapticPressable accessibilityRole="button" accessibilityLabel={`Ver entrenamiento ${recap.routineName}`} onPress={onPress}>{summary}</HapticPressable> : summary}
  </GlassCard>;
}

function Metric({ value, label, color }: { value: string; label: string; color: string }) { return <View style={styles.metric}><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  card: { gap: 12, paddingVertical: 18 }, summary: { gap: 12 }, authorBanner: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 15, padding: 12 }, authorCopy: { flex: 1, gap: 2 }, authorAction: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '600' }, bannerMeta: { alignItems: 'flex-end', gap: 3 }, badge: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }, publishedAt: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '700' }, alias: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', letterSpacing: 0.1 }, recapTitle: { fontSize: 22, fontWeight: '900' }, metrics: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, gap: 2 }, metricValue: { fontSize: 18, fontWeight: '900' }, metricLabel: { color: '#9CA3AF', fontSize: 12 }, muscleFocus: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, muscles: { flex: 1, fontSize: 12, fontWeight: '800' }, caption: { marginTop: 2 }, footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, socialCounts: { alignItems: 'center', flexDirection: 'row', gap: 8 }, detailLink: { fontSize: 14, fontWeight: '900' }, commentText: { fontSize: 14, fontWeight: '800' }, reaction: { paddingHorizontal: 4, paddingVertical: 2 }, reactionText: { fontSize: 15, fontWeight: '900' },
});
