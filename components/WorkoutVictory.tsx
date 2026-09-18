import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { WorkoutSession, ExperienceReceipt, RewardReceipt } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useAnimationActivity } from '../hooks/useAnimationActivity';
import { workoutFacts } from '../utils/workoutExperience';
import { celebrationFrame, celebrationRankChanged, celebrationSteps, rewardLabel } from '../utils/workoutCelebration';
import { trainingRank } from '../utils/experience';
import { HapticPressable } from './HapticPressable';

type Props = { session: WorkoutSession; experience?: ExperienceReceipt | null; rewards?: RewardReceipt | null; onDetails?: () => void; celebrate?: boolean };
const DURATION = 2400;

export function WorkoutVictory({ session, experience, rewards, onDetails, celebrate = false }: Props) {
  const { theme } = useTheme();
  const animate = useAnimationActivity(celebrate);
  const facts = workoutFacts(session);
  const steps = useMemo(() => experience ? celebrationSteps(experience) : null, [experience]);
  const gemTotal = rewards?.entries.reduce((sum, entry) => sum + entry.amount, 0) ?? 0;
  const progress = useSharedValue(1);
  const [clock, setClock] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const played = useRef(false);
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    if (!animate || !experience || !rewards) {
      cancelAnimation(progress); progress.value = 1; setClock(1);
      return;
    }
    if (played.current || Date.now() - mountedAt.current > 3000) { progress.value = 1; setClock(1); return; }
    played.current = true;
    const start = Date.now();
    progress.value = 0; setClock(0);
    progress.value = withTiming(1, { duration: DURATION, easing: Easing.linear });
    const timer = setInterval(() => {
      const next = Math.min(1, (Date.now() - start) / DURATION);
      setClock(next);
      if (next === 1) clearInterval(timer);
    }, 40);
    return () => { clearInterval(timer); cancelAnimation(progress); };
  }, [animate, experience, rewards, progress]);

  const levelTime = Math.min(1, Math.max(0, (clock - 0.1) / 0.62));
  const frame = steps ? celebrationFrame(steps, levelTime) : null;
  const leveledUp = !!steps && !!frame && frame.level > steps[0].level;
  const gemsShown = Math.round(gemTotal * Math.min(1, Math.max(0, (clock - 0.72) / 0.28)));
  const fillStyle = useAnimatedStyle(() => ({ width: `${steps ? celebrationFrame(steps, (progress.value - 0.1) / 0.62).percent : 0}%` }));
  const numberStyle = useAnimatedStyle(() => {
    const current = steps ? celebrationFrame(steps, (progress.value - 0.1) / 0.62) : null;
    const pulse = current && steps && current.level > steps[0].level ? Math.max(0, 1 - current.fraction * 4) : 0;
    return { transform: [{ scale: 1 + pulse * 0.18 }, { translateY: -pulse * 8 }] };
  });
  const gemStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + Math.sin(Math.min(1, Math.max(0, (progress.value - 0.72) / 0.28)) * Math.PI) * 0.12 }] }));

  return <View style={styles.content}>
    <View style={styles.header}>
      <View style={[styles.check, { backgroundColor: `${theme.primary}22` }]}><Ionicons name="checkmark" size={26} color={theme.primary} /></View>
      <View style={styles.flex}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{facts.full ? '¡Entrenamiento finalizado!' : '¡Tu esfuerzo cuenta!'}</Text>
        <Text style={[styles.body, { color: theme.textMuted }]}>{session.routineName}</Text>
      </View>
    </View>
    <Text style={[styles.meta, { color: theme.textMuted }]}>{Math.floor(session.durationSeconds / 60)} min · {facts.completedSets}/{facts.totalSets} series realizadas</Text>
    {experience && steps && frame ? <LinearGradient colors={[`${theme.primary}35`, `${theme.secondary}12`]} style={[styles.levelCard, { borderColor: `${theme.primary}70` }]}>
      <View style={styles.row}><Text style={[styles.eyebrow, { color: theme.primary }]}>{leveledUp ? '¡SUBISTE DE NIVEL!' : 'TU PROGRESO'}</Text><Text style={[styles.xp, { color: theme.primary }]}>+{experience.earnedXp} XP</Text></View>
      <View style={styles.levelRow} accessible accessibilityLabel={`Nivel ${experience.progress.level}, ${experience.progress.rank}`}>
        <Animated.View style={numberStyle}><Text style={[styles.level, { color: theme.text }]}>{frame.level}</Text></Animated.View>
        <View style={styles.flex}><Text style={[styles.eyebrow, { color: theme.textMuted }]}>NIVEL</Text><Text style={[styles.rank, { color: theme.text }]}>{trainingRank(frame.level)}</Text></View>
        {leveledUp ? <Ionicons name="sparkles" size={34} color={theme.secondary} /> : null}
      </View>
      <View accessibilityRole="progressbar" accessibilityLabel="Progreso de nivel" accessibilityValue={{ min: 0, max: experience.progress.xpForNextLevel, now: experience.progress.xpIntoLevel }} style={[styles.track, { backgroundColor: theme.glassBorder }]}>
        <Animated.View style={[styles.fill, fillStyle]}><LinearGradient colors={[theme.primary, theme.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} /></Animated.View>
      </View>
      <View style={styles.row}><Text style={[styles.body, { color: theme.textMuted }]}>{frame.xp} / {frame.capacity} XP</Text><Text style={[styles.body, { color: theme.textMuted }]}>Nivel {frame.level + 1}</Text></View>
      {leveledUp && celebrationRankChanged(steps) ? <Text accessibilityLiveRegion="polite" style={[styles.rank, { color: theme.secondary }]}>Nuevo rango: {experience.progress.rank}</Text> : null}
    </LinearGradient> : celebrate ? <View style={[styles.pending, { backgroundColor: theme.glass }]}><Text style={{ color: theme.textMuted }}>Tu progreso se confirmará al sincronizar.</Text></View> : null}
    {rewards ? <View style={[styles.gemsCard, { backgroundColor: `${theme.secondary}14`, borderColor: `${theme.secondary}55` }]}>
      <View style={styles.gemRow} accessible accessibilityLabel={`${gemTotal} gemas ganadas. Saldo: ${rewards.balance} gemas`}>
        <Animated.View style={[styles.gemIcon, { backgroundColor: `${theme.secondary}20` }, gemStyle]}><Ionicons name="diamond" size={38} color={theme.secondary} /></Animated.View>
        <View style={styles.flex}><Text style={[styles.gems, { color: theme.text }]}>+{gemsShown} <Text style={styles.gemUnit}>gemas</Text></Text><Text style={[styles.body, { color: theme.textMuted }]}>Saldo total: {rewards.balance} gemas</Text></View>
      </View>
      {rewards.entries.length ? <HapticPressable accessibilityRole="button" accessibilityLabel="Ver recompensas" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.disclosure}><Text style={[styles.link, { color: theme.secondary }]}>{expanded ? 'Ocultar recompensas' : 'Ver recompensas'}</Text><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.secondary} /></HapticPressable> : null}
      {expanded ? rewards.entries.map((entry, index) => <View key={index} style={styles.row}><Text style={[styles.body, styles.flex, { color: theme.textMuted }]}>{rewardLabel(entry.kind)}</Text><Text style={[styles.xp, { color: theme.text }]}>+{entry.amount}</Text></View>) : null}
    </View> : celebrate ? <Text style={[styles.body, { color: theme.textMuted }]}>Gemas pendientes de confirmación</Text> : null}
    {onDetails ? <HapticPressable accessibilityRole="button" accessibilityLabel="Ver entrenamiento" onPress={onDetails} style={styles.detail}><Text style={[styles.link, { color: theme.textMuted }]}>Ver entrenamiento</Text><Ionicons name="arrow-forward" size={18} color={theme.textMuted} /></HapticPressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 16 }, flex: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 23, fontWeight: '900', letterSpacing: -0.6 }, body: { fontSize: 14, lineHeight: 21 },
  meta: { fontSize: 14, marginTop: -6 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  levelCard: { padding: 22, borderRadius: 28, borderWidth: 1, gap: 14, overflow: 'hidden' },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, fontWeight: '900' }, xp: { fontSize: 16, fontWeight: '900' },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 18 }, level: { fontSize: 76, lineHeight: 88, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -3 },
  rank: { fontSize: 20, fontWeight: '800' }, track: { height: 16, borderRadius: 8, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 8, overflow: 'hidden' },
  gemsCard: { padding: 20, borderRadius: 24, borderWidth: 1, gap: 8 }, gemRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  gemIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, gems: { fontSize: 38, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1 }, gemUnit: { fontSize: 21, letterSpacing: 0 },
  disclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, link: { fontSize: 14, fontWeight: '700' },
  detail: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, pending: { padding: 20, borderRadius: 24 },
});
