import { personalRecordPresentation } from '../utils/personalRecordPresentation';
import { ThemeFamilyTexture } from './ThemeFamilyTexture';
import { familyForTheme } from '../constants/themeFamilies';
import { GlassButton } from './UI';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getShopTheme } from '../constants/shopThemes';
import { THEMES } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import type { CommunityActivity, CommunityMilestoneActivity } from '../types';
import { formatRelativeTime } from '../utils/feedTimeline';
import { GlassCard } from './GlassCard';
import { ProfileAvatar } from './ProfileAvatar';
import { ProfileTitleBadge } from './ProfileTitleBadge';

function milestoneCopy(activity: CommunityMilestoneActivity): { label: string; title: string; detail: string } {
  const payload = activity.payload;
  switch (activity.kind) {
    case 'personal_record': {
      const record = personalRecordPresentation(activity);
      return { label: record.label.toLocaleUpperCase(), title: `${record.exercise}${record.previous ? `\nAntes: ${record.previous}` : ''}`, detail: record.value };
    }
    case 'mesocycle_completed': return { label: 'MESOCICLO', title: 'Finalizó su mesociclo', detail: 'Constancia completada.' };
    case 'mesocycle_perfect_week': return { label: 'SEMANA PERFECTA', title: 'Completó cada sesión planificada', detail: `Semana ${payload.week_number ?? ''}`.trim() };
    case 'weekly_goal': return { label: 'OBJETIVO SEMANAL', title: 'Cumplió su objetivo semanal', detail: `${payload.target_workouts ?? ''} entrenamientos` };
    case 'weekly_streak': return { label: 'RACHA', title: 'Sostiene su racha semanal', detail: `${payload.weeks ?? ''} semanas consecutivas` };
    case 'first_joint_workout': return { label: 'ENTRENAR JUNTOS', title: 'Completó su primer entrenamiento en equipo', detail: 'El círculo se fortalece.' };
    case 'joint_workout_completed': return { label: 'ENTRENAR JUNTOS', title: 'Finalizó un entrenamiento en equipo', detail: 'Trabajo compartido, progreso compartido.' };
    case 'weekly_volume_record': return { label: 'VOLUMEN SEMANAL', title: 'Logró su mejor semana de volumen', detail: 'Volumen registrado en este período' };
    case 'monthly_volume_record': return { label: 'VOLUMEN MENSUAL', title: 'Logró su mejor mes de volumen', detail: 'Volumen registrado en este período' };
    case 'monthly_consistency': return { label: 'CONSISTENCIA', title: 'Entrenó con constancia todo el mes', detail: `${payload.active_weeks ?? ''} semanas activas` };
    case 'muscle_balance_improved': return { label: 'BALANCE MUSCULAR', title: 'Amplió su balance muscular', detail: `${payload.covered_muscle_groups ?? ''} grupos principales trabajados` };
  }
}

export function CommunityMilestoneCard({ activity, now, preview = false }: { activity: CommunityActivity; now: number; preview?: boolean }) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const authorTheme = getShopTheme(activity.authorThemeId ?? '') ?? THEMES.rodaja;
  if (activity.kind === 'rank_up') {
    const unlockedFrameId = activity.unlockedFrameId ?? activity.authorFrameId;
    const unlockedTitleId = activity.unlockedTitleId ?? activity.authorTitleId;
    return <GlassCard style={styles.rankCard}>
      <LinearGradient colors={[authorTheme.primary, authorTheme.accent, authorTheme.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rankBanner}>
        <ThemeFamilyTexture family={familyForTheme(authorTheme).texture} color={authorTheme.onPrimary} opacity={0.14} />
        <Text style={styles.congratulations}>NUEVO RANGO DESBLOQUEADO</Text>
        <Text style={{ fontSize: 76, fontWeight: '900', color: authorTheme.onPrimary }}>{activity.level}</Text>
        <ProfileAvatar avatarId={activity.authorAvatarId} frameId={unlockedFrameId} level={activity.level} size={82} borderColor="rgba(255,255,255,0.7)" />
        <Text style={styles.rankAlias}>{activity.authorAlias}</Text>
        <Text style={styles.rankCopy}>Desbloqueó un nuevo rango</Text>
        <Text style={styles.time}>{preview ? 'Vista previa' : formatRelativeTime(activity.createdAt, now)}</Text>
      </LinearGradient>
      <Text style={[styles.rankTitle, { color: theme.text }]}>Nivel {activity.level} · {activity.rank}</Text>
      {unlockedTitleId ? <ProfileTitleBadge titleId={unlockedTitleId} size={140} /> : null}
      {!preview ? <GlassButton title={expanded ? 'Ocultar contexto del hito' : 'Ver contexto del hito'} variant="secondary" onPress={() => setExpanded((value) => !value)} /> : null}
      {expanded ? <Text style={{ color: theme.textMuted }}>Registrado el {new Date(activity.createdAt).toLocaleDateString('es')}. Este hito muestra solo la información que el atleta compartió.</Text> : null}
    </GlassCard>;
  }
  const copy = milestoneCopy(activity);
  return <GlassCard style={styles.card}>
    <LinearGradient colors={[authorTheme.primary, authorTheme.accent, authorTheme.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
      <ProfileAvatar avatarId={activity.authorAvatarId} frameId={activity.authorFrameId} size={48} borderColor="rgba(255,255,255,0.7)" />
      <View style={styles.copy}><Text style={styles.alias}>{activity.authorAlias}</Text><ProfileTitleBadge titleId={activity.authorTitleId} /><Text style={styles.action}>{copy.label}</Text></View>
      <Text style={styles.time}>{preview ? 'Vista previa' : formatRelativeTime(activity.createdAt, now)}</Text>
    </LinearGradient>
    <View style={[styles.achievement, { backgroundColor: authorTheme.background[0], borderColor: authorTheme.primary }]}>
      <ThemeFamilyTexture family={familyForTheme(authorTheme).texture} color={authorTheme.accent} opacity={0.16} />
      <Text style={[styles.achievementLabel, { color: authorTheme.primary }]}>{copy.label}</Text>
      <Text accessibilityRole="header" style={[styles.achievementValue, { color: authorTheme.text }]}>{copy.detail}</Text>
      <Text style={[styles.title, { color: authorTheme.text }]}>{copy.title}</Text>
    </View>
    {!preview ? <GlassButton title={expanded ? 'Ocultar contexto del hito' : 'Ver contexto del hito'} variant="secondary" onPress={() => setExpanded((value) => !value)} /> : null}
      {expanded ? <Text style={{ color: theme.textMuted }}>Registrado el {new Date(activity.createdAt).toLocaleDateString('es')}. Este hito muestra solo la información que el atleta compartió.</Text> : null}
  </GlassCard>;
}

const styles = StyleSheet.create({
  card: { gap: 16, paddingVertical: 18 },
  achievement: { borderRadius: 28, borderTopRightRadius: 6, borderWidth: 1, padding: 24, gap: 16, overflow: 'hidden' },
  achievementLabel: { fontSize: 11, letterSpacing: 1.3, fontWeight: '900' },
  achievementValue: { fontSize: 36, lineHeight: 42, fontWeight: '900' },
  rankCard: { alignItems: 'center', gap: 12, paddingVertical: 18 },
  rankBanner: { alignItems: 'center', borderRadius: 15, gap: 5, padding: 18, width: '100%', overflow: 'hidden' },
  congratulations: { color: 'rgba(255,255,255,0.88)', fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  rankAlias: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  rankCopy: { color: 'rgba(255,255,255,0.86)', fontSize: 14, fontWeight: '700' },
  rankTitle: { fontSize: 21, fontWeight: '900', textAlign: 'center' },
  banner: { alignItems: 'center', borderRadius: 15, flexDirection: 'row', gap: 11, padding: 12 },
  copy: { flex: 1, gap: 2 },
  alias: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  action: { color: 'rgba(255,255,255,0.82)', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  time: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '700' },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  detail: { fontSize: 14, fontWeight: '900' },
});
