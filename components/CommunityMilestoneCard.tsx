import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getShopTheme } from '../constants/shopThemes';
import { THEMES } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import type { CommunityActivity, CommunityMilestoneActivity } from '../types';
import { formatRelativeTime } from '../utils/feedTimeline';
import { GlassCard } from './GlassCard';
import { ProfileAvatar } from './ProfileAvatar';

function milestoneCopy(activity: CommunityMilestoneActivity): { label: string; title: string; detail: string } {
  const payload = activity.payload;
  switch (activity.kind) {
    case 'personal_record': return { label: 'RÉCORD PERSONAL', title: 'Superó su mejor marca', detail: `${payload.exercise_name ?? 'Ejercicio'} · ${payload.best_score ?? ''} ${payload.score_unit ?? ''}`.trim() };
    case 'mesocycle_completed': return { label: 'MESOCICLO', title: 'Finalizó su mesociclo', detail: 'Constancia completada.' };
    case 'mesocycle_perfect_week': return { label: 'SEMANA PERFECTA', title: 'Completó cada sesión planificada', detail: `Semana ${payload.week_number ?? ''}`.trim() };
    case 'weekly_goal': return { label: 'OBJETIVO SEMANAL', title: 'Cumplió su objetivo semanal', detail: `${payload.target_workouts ?? ''} entrenamientos` };
    case 'weekly_streak': return { label: 'RACHA', title: 'Sostiene su racha semanal', detail: `${payload.weeks ?? ''} semanas consecutivas` };
    case 'first_joint_workout': return { label: 'ENTRENAR JUNTOS', title: 'Completó su primer entrenamiento en equipo', detail: 'El círculo se fortalece.' };
    case 'joint_workout_completed': return { label: 'ENTRENAR JUNTOS', title: 'Finalizó un entrenamiento en equipo', detail: 'Trabajo compartido, progreso compartido.' };
    case 'weekly_volume_record': return { label: 'VOLUMEN SEMANAL', title: 'Logró su mejor semana de volumen', detail: `${payload.volume ?? ''} kg de volumen` };
    case 'monthly_volume_record': return { label: 'VOLUMEN MENSUAL', title: 'Logró su mejor mes de volumen', detail: `${payload.volume ?? ''} kg de volumen` };
    case 'monthly_consistency': return { label: 'CONSISTENCIA', title: 'Entrenó con constancia todo el mes', detail: `${payload.active_weeks ?? ''} semanas activas` };
    case 'muscle_balance_improved': return { label: 'BALANCE MUSCULAR', title: 'Amplió su balance muscular', detail: `${payload.covered_muscle_groups ?? ''} grupos principales trabajados` };
  }
}

export function CommunityMilestoneCard({ activity, now }: { activity: CommunityActivity; now: number }) {
  const { theme } = useTheme();
  const authorTheme = getShopTheme(activity.authorThemeId ?? '') ?? THEMES.rodaja;
  const copy = activity.kind === 'rank_up'
    ? { label: 'RANGO', title: `Nivel ${activity.level} · ${activity.rank}`, detail: 'El entrenamiento constante da resultados.' }
    : milestoneCopy(activity);
  return <GlassCard style={styles.card}>
    <LinearGradient colors={[authorTheme.primary, authorTheme.accent, authorTheme.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
      <ProfileAvatar avatarId={activity.authorAvatarId} size={48} borderColor="rgba(255,255,255,0.7)" />
      <View style={styles.copy}><Text style={styles.alias}>{activity.authorAlias}</Text><Text style={styles.action}>{copy.label}</Text></View>
      <Text style={styles.time}>{formatRelativeTime(activity.createdAt, now)}</Text>
    </LinearGradient>
    <Text style={[styles.title, { color: theme.text }]}>{copy.title}</Text>
    <Text style={[styles.detail, { color: authorTheme.primary }]}>{copy.detail}</Text>
  </GlassCard>;
}

const styles = StyleSheet.create({
  card: { gap: 12, paddingVertical: 18 },
  banner: { alignItems: 'center', borderRadius: 15, flexDirection: 'row', gap: 11, padding: 12 },
  copy: { flex: 1, gap: 2 },
  alias: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  action: { color: 'rgba(255,255,255,0.82)', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  time: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '700' },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  detail: { fontSize: 14, fontWeight: '900' },
});
