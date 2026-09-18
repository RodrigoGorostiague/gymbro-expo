import { SharedBodyMap } from './TrainingBodyMap';
import { actualEffortSummary } from '../utils/actualEffort';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WorkoutRecap } from '../types';
import { getShopTheme } from '../constants/shopThemes';
import { familyForTheme } from '../constants/themeFamilies';
import { THEMES } from '../constants/theme';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { muscleGroupLabels } from '../utils/catalogMuscleGroups';
import { GlassCard } from './GlassCard';
import { ProfileAvatar } from './ProfileAvatar';
import { formatRelativeTime } from '../utils/feedTimeline';
import { HapticPressable } from './HapticPressable';
import { ProfileTitleBadge } from './ProfileTitleBadge';
import { ThemeFamilyTexture } from './ThemeFamilyTexture';
import { PublicationReaction } from './PublicationReaction';
/** Only sanitized public recap fields enter this composition, never the owner's raw session. */
export function WorkoutPublicationCard({ recap, now = Date.now(), onPress, onProfilePress, onToggleReaction, preview = false }: {
    recap: WorkoutRecap;
    preview?: boolean;
    now?: number;
    onPress?: () => void;
    onProfilePress?: () => void;
    onToggleReaction?: () => void;
}) {
    const { theme } = useTheme();
    const { catalogMuscleGroups = [] } = useData();
    const [expanded, setExpanded] = useState(false);
    const authorTheme = getShopTheme(recap.authorThemeId ?? '') ?? (recap.authorAlias.toLocaleLowerCase() === 'brisas' ? THEMES.brisas : THEMES.rodaja);
    const family = familyForTheme(authorTheme);
    const effortSummary = actualEffortSummary(recap.metrics);
    const muscleDistribution = (recap.muscleDistribution ?? []).map(({ id, value }) => ({
        id, label: muscleGroupLabels(catalogMuscleGroups, [id])[0] ?? id, value
    }));
    const identity = <View style={styles.identity}>
    <ProfileAvatar avatarId={recap.authorAvatarId} frameId={recap.authorFrameId} size={46} borderColor={authorTheme.primary}/>
    <View style={styles.grow}><Text style={[styles.alias, { color: theme.text }]}>{recap.authorAlias}</Text>{recap.authorTitleId ? <ProfileTitleBadge titleId={recap.authorTitleId}/> : <Text style={{ color: theme.textMuted }}>Completó un entrenamiento</Text>}</View>
    <Text style={[styles.time, { color: theme.textMuted }]}>{formatRelativeTime(recap.createdAt, now)}</Text>
  </View>;
    const hero = <LinearGradient colors={[authorTheme.primary, authorTheme.accent, authorTheme.secondary]} style={[styles.hero, { borderRadius: family.radius }]}>      <ThemeFamilyTexture family={family.texture} color={authorTheme.onPrimary} opacity={0.14}/>
      <Text style={[styles.eyebrow, { color: authorTheme.onPrimary }]}>{recap.mesocycleAvailable ? 'MESOCICLO' : 'RUTINA'} · TRABAJO REGISTRADO</Text>
      <Text accessibilityRole="header" style={[styles.title, { color: authorTheme.onPrimary }]}>{recap.routineName}</Text>
      <View style={styles.heroMetric}><Text style={[styles.heroValue, { color: authorTheme.onPrimary }]}>{Math.round(recap.durationSeconds / 60)}</Text><Text style={[styles.heroUnit, { color: authorTheme.onPrimary }]}>min de entrenamiento</Text></View>
      <Text style={[styles.supporting, { color: authorTheme.onPrimary }]}>{recap.exerciseCount} ejercicios en esta sesión</Text>
    </LinearGradient>;
    return <GlassCard style={styles.card}>
    {onProfilePress ? <HapticPressable accessibilityLabel={`Ver perfil de ${recap.authorAlias}`} onPress={onProfilePress}>{identity}</HapticPressable> : identity}
    {onPress ? <HapticPressable accessibilityLabel={`Abrir ejecución de ${recap.routineName}`} onPress={onPress}>{hero}</HapticPressable> : hero}
    <View style={styles.effortSummary}>
      <Text style={[styles.eyebrow, { color: theme.textMuted }]}>ESFUERZO REALIZADO</Text>
      {effortSummary.length ? <View style={styles.effortBadges}>{effortSummary.map(({ kind, min, max, count }) => <View key={kind} style={[styles.effortBadge, { backgroundColor: `${authorTheme.primary}20`, borderColor: authorTheme.primary }]}><Text style={[styles.detailLink, { color: theme.text }]}>{kind.toUpperCase()} {min === max ? min : `${min}–${max}`}</Text><Text style={{ color: theme.textMuted }}>{count} {count === 1 ? 'serie registrada' : 'series registradas'}</Text></View>)}</View> : <Text style={{ color: theme.textMuted }}>Sin esfuerzo registrado</Text>}
    </View>
    {muscleDistribution.length ? <View style={styles.distribution}><View style={styles.grow}><Text style={[styles.eyebrow, { color: theme.textMuted }]}>FOCO COMPARTIDO</Text><Text style={{ color: theme.text }}>{muscleDistribution.map(({ label }) => label).join(' · ')}</Text></View></View> : recap.muscleGroupIds.length ? <Text style={{ color: theme.textMuted }}>{muscleGroupLabels(catalogMuscleGroups, recap.muscleGroupIds).join(' · ')}</Text> : null}
    {(recap.muscleDistribution?.length || recap.muscleGroupIds.length) ? <SharedBodyMap distribution={recap.muscleDistribution} muscleGroupIds={recap.muscleGroupIds} compact={false} palette={authorTheme} /> : null}
    {recap.caption ? <Text style={[styles.caption, { color: theme.text }]}>{recap.caption}</Text> : null}
    {!preview ? <HapticPressable accessibilityLabel="Detalles del resumen compartido" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.detailToggle}><Text style={{ color: theme.textMuted }}>{expanded ? 'Ocultar alcance del resumen −' : 'Qué incluye este resumen +'}</Text></HapticPressable> : null}
    {expanded ? <Text style={{ color: theme.textMuted }}>Este resumen usa solo los datos compartidos por el atleta. {recap.templateAvailable ? 'Incluye una plantilla de rutina.' : 'No incluye una plantilla de rutina.'} {recap.mesocycleAvailable ? 'Incluye un mesociclo.' : ''} Las cargas y comparaciones requieren unidades verificables en el detalle.</Text> : null}
    {!preview ? <View style={styles.footer}>
      {onPress ? <HapticPressable accessibilityLabel={`Ver entrenamiento ${recap.routineName}`} onPress={onPress} style={styles.detailTarget}><Text style={[styles.detailLink, { color: theme.text }]}>Ver entrenamiento completo</Text></HapticPressable> : <View style={styles.grow}/>}
      <Text accessibilityLabel={`${recap.commentCount ?? 0} comentarios`} style={{ color: theme.textMuted }}>💬 {recap.commentCount ?? 0}</Text>
      {onToggleReaction ? <PublicationReaction count={recap.reactionCount ?? 0} selected={!!recap.viewerHasReacted} color={authorTheme.primary} muted={theme.textMuted} onPress={onToggleReaction}/> : <Text style={{ color: theme.textMuted }}>★ {recap.reactionCount ?? 0}</Text>}
    </View> : null}
  </GlassCard>;
}
const styles = StyleSheet.create({
    effortSummary: { gap: 8 }, effortBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, effortBadge: { flexGrow: 1, borderWidth: 1, borderRadius: 16, padding: 12, gap: 4 },
    card: { gap: 16 }, identity: {
        flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48
    }, grow: { flex: 1, gap: 5 }, alias: { fontSize: 18, fontWeight: '800' }, time: { fontSize: 11 }, hero: {
        padding: 22, gap: 12, overflow: 'hidden'
    }, eyebrow: {
        fontSize: 11, fontWeight: '900', letterSpacing: 1.2
    }, title: {
        fontSize: 28, fontWeight: '900', letterSpacing: -0.5
    }, heroMetric: {
        flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10
    }, heroValue: {
        fontSize: 64, fontWeight: '900', letterSpacing: -2
    }, heroUnit: { fontSize: 16, fontWeight: '600' }, supporting: { fontSize: 15, fontWeight: '700' }, distribution: {
        flexDirection: 'row', alignItems: 'center', gap: 12
    }, caption: { fontSize: 16, lineHeight: 23 }, footer: {
        flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10
    }, detailTarget: {
        flex: 1, minHeight: 48, justifyContent: 'center'
    }, detailLink: { fontSize: 14, fontWeight: '800' }, detailToggle: { minHeight: 48, justifyContent: 'center' }
});
