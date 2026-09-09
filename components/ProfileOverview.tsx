import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { useAnimationActivity } from '../hooks/useAnimationActivity';
import { ProfileAvatar } from './ProfileAvatar';
import { ProfileTitleBadge } from './ProfileTitleBadge';
import { HapticPressable } from './HapticPressable';
import type { AvatarId } from '../constants/avatars';
import type { ProfileFrameId, ProfileTitleId } from '../constants/profileFrames';
import type { ExperienceProgress } from '../types';
import { experienceProgressPercent } from '../utils/experience';
import type { summarizeProfileHistory } from '../utils/profileOverview';

export function ProfileOverview({ alias, about, avatarId, frameId, titleId, progress, draft, onEdit, onAppearance }: {
  alias: string; about: string; avatarId: AvatarId; frameId: ProfileFrameId; titleId: ProfileTitleId | null;
  progress: ExperienceProgress | null; draft: boolean; onEdit: () => void; onAppearance: () => void;
}) {
  const { theme } = useTheme();
  const active = useAnimationActivity();
  const fill = useSharedValue(0);
  const percent = progress ? experienceProgressPercent(progress) : 0;
  useEffect(() => {
    cancelAnimation(fill);
    fill.value = active ? withTiming(percent, { duration: 550 }) : percent;
    return () => cancelAnimation(fill);
  }, [active, percent, fill]);
  const animatedFill = useAnimatedStyle(() => ({ width: `${fill.value}%` }));
  return <View style={[styles.hero, { borderColor: theme.glassBorder, backgroundColor: theme.glass }]}>
    <LinearGradient colors={[theme.primary, theme.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cover}>
      <Text style={[styles.eyebrow, { color: theme.onPrimary }]}>TU IDENTIDAD · TU RECORRIDO</Text>
      <Ionicons name="fitness" size={32} color={theme.onPrimary} />
    </LinearGradient>
    <View style={styles.heroBody}>
      <View style={styles.identity}>
        <ProfileAvatar avatarId={avatarId} frameId={frameId} level={progress?.level} size={88} borderColor={theme.primary} />
        <View style={styles.copy}>
          <Text accessibilityRole="header" style={[styles.alias, { color: theme.text }]}>{alias || 'Tu historia empieza aquí'}</Text>
          <ProfileTitleBadge titleId={titleId} />
          <Text style={[styles.caption, { color: theme.textMuted }]}>{draft ? 'Vista previa · cambios sin guardar' : 'Tu espacio de atleta'}</Text>
        </View>
      </View>
      <Text style={[styles.bio, { color: about ? theme.text : theme.textMuted }]}>{about || 'Cada sesión construye tu historia. Dale una voz a tu perfil.'}</Text>
      <View style={styles.actions}>
        <ProfileAction icon="create-outline" label="Editar identidad" onPress={onEdit} />
        <ProfileAction icon="sparkles-outline" label="Personalizar" onPress={onAppearance} />
      </View>
      {progress ? <View style={[styles.progress, { borderColor: theme.glassBorder }]}>
        <View style={styles.progressHeading}><Text style={[styles.rank, { color: theme.text }]}>Nivel {progress.level} · {progress.rank}</Text><Text style={[styles.caption, { color: theme.primary }]}>{progress.totalXp} XP</Text></View>
        <View accessibilityRole="progressbar" accessibilityLabel="Progreso al siguiente nivel" accessibilityValue={{ min: 0, max: 100, now: Math.round(percent), text: `${progress.xpIntoLevel} de ${progress.xpForNextLevel} XP para el nivel ${progress.level + 1}` }} style={[styles.track, { backgroundColor: theme.glassBorder }]}>
          <Animated.View style={[styles.fill, { backgroundColor: theme.primary }, animatedFill]} />
        </View>
        <Text style={[styles.caption, { color: theme.textMuted }]}>{Math.max(0, progress.xpForNextLevel - progress.xpIntoLevel)} XP para el nivel {progress.level + 1}</Text>
      </View> : <Text style={[styles.caption, { color: theme.textMuted }]}>Tu nivel aparecerá cuando esté disponible tu progreso.</Text>}
    </View>
  </View>;
}

export function ProfileAction({ icon, label, hint, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; hint?: string; onPress: () => void }) {
  const { theme } = useTheme();
  return <HapticPressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.action, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
    <Ionicons name={icon} color={theme.primary} size={21} />
    <View style={styles.copy}><Text style={[styles.actionLabel, { color: theme.text }]}>{label}</Text>{hint ? <Text style={[styles.caption, { color: theme.textMuted }]}>{hint}</Text> : null}</View>
    <Ionicons name="chevron-forward" color={theme.textMuted} size={14} />
  </HapticPressable>;
}

export function ProfileHistorySummary({ summary, onHistory, onTrain }: { summary: ReturnType<typeof summarizeProfileHistory>; onHistory: () => void; onTrain: () => void }) {
  const { theme } = useTheme();
  return <View style={styles.history}>
    <View style={styles.progressHeading}><Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>Tu trabajo cuenta</Text><Ionicons name="barbell-outline" size={24} color={theme.primary} /></View>
    <Text style={[styles.caption, { color: theme.textMuted }]}>Resumen privado de tu historial disponible</Text>
    <View style={styles.metrics}>{[[summary.completedCount, 'sesiones'], [summary.recentCount, 'últimos 30 días'], [summary.minutes, 'minutos totales']].map(([value, label]) => <View key={label} style={[styles.metric, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}><Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text><Text style={[styles.caption, { color: theme.textMuted }]}>{label}</Text></View>)}</View>
    {summary.latest ? <ProfileAction icon="time-outline" label={summary.latest.routineName || 'Última sesión'} hint={`Última sesión · ${new Date(summary.latest.completedAt).toLocaleDateString('es')}`} onPress={onHistory} /> : <ProfileAction icon="play-outline" label="Empieza tu próxima historia" hint="Completa una sesión y encuentra aquí tu recorrido." onPress={onTrain} />}
  </View>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 28, borderWidth: 1, overflow: 'hidden' },
  cover: { minHeight: 82, padding: 20, gap: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: '900', flexShrink: 1 },
  heroBody: { padding: 20, gap: 18 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  copy: { flex: 1, minWidth: 90, gap: 5 }, alias: { fontSize: 27, fontWeight: '900', letterSpacing: -0.8 }, bio: { fontSize: 14, lineHeight: 22 },
  caption: { fontSize: 12, lineHeight: 18 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 17, borderWidth: 1, minHeight: 54, flexGrow: 1 },
  actionLabel: { fontSize: 13, fontWeight: '800' }, progress: { borderTopWidth: 1, paddingTop: 16, gap: 10 },
  progressHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, rank: { fontSize: 16, fontWeight: '800' },
  track: { height: 8, borderRadius: 8, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 8 },
  history: { gap: 12 }, sectionTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flex: 1, minWidth: 86, padding: 13, borderRadius: 18, borderWidth: 1, gap: 4 }, metricValue: { fontSize: 25, fontWeight: '900' },
});
