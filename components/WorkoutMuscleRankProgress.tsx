import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { getWorkoutMuscleRankProgress, type MuscleRankProgress } from '../services/muscleRank';
import { MUSCLE_RANKS, muscleRankIndex } from '../constants/muscleRanks';
import { MUSCLE_VOLUME_AXES } from '../utils/muscleVolume';
import { MuscleRankInfo } from './MuscleRankInfo';
import { withTimeout } from '../utils/withTimeout';

export function WorkoutMuscleRankProgress({ attemptId, subjectId, confirmed }: { attemptId: string; subjectId: string | null; confirmed: boolean }) {
  const { theme } = useTheme();
  const [progress, setProgress] = useState<MuscleRankProgress | null>(null);
  const [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setProgress(null); setError(false);
    if (!subjectId) return;
    void withTimeout(getWorkoutMuscleRankProgress(attemptId, subjectId), 12000, 'Consultar progreso muscular').then(value => {
      if (active) setProgress(value);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attemptId, subjectId, confirmed, retry]);
  const current = progress?.attemptId === attemptId && progress.after.subjectId === subjectId ? progress : null;
  const changes = current?.after.axes.flatMap((after, i) => {
    const before = current.before.axes[i];
    const gained = Math.max(0, after.xp - before.xp);
    const gems = current.rewards.filter(r => r.muscleId === after.id).reduce((n, r) => n + r.amount, 0);
    return gained > 0 || after.lastActivity !== before.lastActivity || gems > 0 ? [{ before, after, gained, gems }] : [];
  }) ?? [];
  const totalGems = current?.rewards.reduce((sum, reward) => sum + reward.amount, 0) ?? 0;
  return <View style={[styles.card, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
    <View style={styles.row}><Text accessibilityRole="header" style={[styles.title, { color: theme.text, flex: 1 }]}>Tu progreso muscular</Text><MuscleRankInfo /></View>
    {current ? <>
      {totalGems > 0 ? <Text accessibilityLiveRegion="polite" style={{ color: theme.secondary, fontWeight: '900' }}>+{totalGems} gemas por rangos musculares · incluidas en la recompensa total</Text> : null}
      {current.after.paused ? <Text style={{ color: theme.textMuted }}>Pausa de recuperación: esta sesión no suma XP muscular.</Text> : !changes.length ? <Text style={{ color: theme.textMuted }}>Sin XP muscular adicional en esta sesión. Los límites diarios y semanales y las series válidas determinan la progresión.</Text> : null}
      {changes.map(({ before, after, gained, gems }) => {
        const beforeIndex = muscleRankIndex(before.xp), index = muscleRankIndex(after.xp);
        const rank = MUSCLE_RANKS[index], next = MUSCLE_RANKS[index + 1];
        const up = index > beforeIndex;
        const label = MUSCLE_VOLUME_AXES.find(a => a.id === after.id)!.label;
        return <View key={after.id} style={[styles.muscle, { borderColor: up ? rank.color : theme.glassBorder }]}>
          <View style={styles.row}><View style={[styles.dot, { backgroundColor: rank.color }]} /><Text style={{ color: theme.text, fontWeight: '800', flex: 1 }}>{label}</Text><Text style={{ color: theme.text, fontWeight: '800' }}>+{gained} XP</Text></View>
          <Text style={{ color: theme.text }}>{up ? `¡Subiste ${index - beforeIndex === 1 ? 'de rango' : `${index - beforeIndex} rangos`}! ${MUSCLE_RANKS[beforeIndex].name} → ${rank.name}` : rank.name}</Text>
          {gems > 0 ? <Text style={{ color: theme.secondary, fontWeight: '800' }}>+{gems} gemas · {gems / 25} {gems === 25 ? 'rango nuevo' : 'rangos nuevos'}</Text> : up ? <Text style={{ color: theme.textMuted }}>{before.peakXp >= rank.xp ? 'Rango recuperado · sin repetir el premio' : 'Sin premio registrado para esta sesión'}</Text> : null}
          <View accessibilityRole="progressbar" accessibilityLabel={`Progreso muscular de ${label}`} accessibilityValue={{ min: 0, max: next ? next.xp - rank.xp : 1000, now: after.xp - rank.xp, text: `${after.xp} XP · ${rank.name}` }} style={[styles.track, { backgroundColor: theme.glassBorder }]}><View style={{ height: 8, backgroundColor: rank.color, width: `${next ? Math.min(100, (after.xp - rank.xp) / (next.xp - rank.xp) * 100) : 100}%` }} /></View>
          <Text style={{ color: theme.textMuted }}>{before.xp} → {after.xp} XP{next ? ` · siguiente: ${next.name} (${next.xp} XP)` : ' · rango máximo'}</Text>
        </View>;
      })}
    </> : <><Text style={{ color: theme.textMuted }}>{error ? 'La progresión muscular está pendiente de consulta o sincronización. Tus gemas solo se confirman en el servidor.' : 'Consultando tu progresión muscular…'}</Text>{error ? <Pressable accessibilityRole="button" accessibilityLabel="Reintentar progreso muscular" onPress={() => setRetry(r => r + 1)} style={styles.button}><Text style={{ color: theme.primary }}>Reintentar progreso muscular</Text></Pressable> : null}</>}
  </View>;
}
const styles = StyleSheet.create({ card: { padding: 18, borderWidth: 1, borderRadius: 24, gap: 14 }, title: { fontSize: 22, fontWeight: '900' }, row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, muscle: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 }, dot: { width: 12, height: 12, borderRadius: 4 }, track: { height: 8, borderRadius: 4, overflow: 'hidden' }, button: { minHeight: 44, justifyContent: 'center' } });
