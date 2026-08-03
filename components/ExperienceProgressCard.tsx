import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ExperienceProgress } from '../types';
import { experienceProgressPercent } from '../utils/experience';

type Theme = { primary: string; secondary: string; text: string; textMuted: string; glassBorder: string };

export function ExperienceProgressCard({ progress, theme, title = 'Progreso de entrenamiento' }: {
  progress: ExperienceProgress | null;
  theme: Theme;
  title?: string;
}) {
  if (!progress) return null;
  const percent = experienceProgressPercent(progress);
  return <View style={[styles.card, { borderColor: theme.glassBorder }]}>
    <View style={[styles.badge, { borderColor: theme.secondary }]}><Text style={[styles.badgeLevel, { color: theme.text }]}>{progress.level}</Text><Text style={[styles.badgeLabel, { color: theme.textMuted }]}>NIVEL</Text></View>
    <View style={styles.copy}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.rank, { color: theme.secondary }]}>Nivel {progress.level} · {progress.rank}</Text>
      <Text style={[styles.total, { color: theme.textMuted }]}>{progress.totalXp} XP total</Text>
      <View style={[styles.track, { backgroundColor: theme.glassBorder }]}><View style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.secondary }]} /></View>
      <Text style={[styles.next, { color: theme.textMuted }]}>{progress.xpIntoLevel}/{progress.xpForNextLevel} XP para nivel {progress.level + 1}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 14, padding: 14 },
  badge: { alignItems: 'center', borderRadius: 999, borderWidth: 4, height: 72, justifyContent: 'center', width: 72 },
  badgeLevel: { fontSize: 25, fontWeight: '900', lineHeight: 28 },
  badgeLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  copy: { flex: 1, gap: 3 },
  title: { fontSize: 15, fontWeight: '800' },
  rank: { fontSize: 16, fontWeight: '900' },
  total: { fontSize: 12 },
  track: { borderRadius: 999, height: 7, marginTop: 4, overflow: 'hidden' },
  fill: { borderRadius: 999, height: '100%' },
  next: { fontSize: 11 },
});
