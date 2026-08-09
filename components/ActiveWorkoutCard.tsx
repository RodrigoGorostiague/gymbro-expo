import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { cancelAnimation, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { ActiveWorkoutDraft } from '../types';
import { reconcileActiveWorkoutTiming } from '../utils/activeWorkoutTiming';
import { GlassCard } from './GlassCard';
import { HapticPressable } from './HapticPressable';
import { useTheme } from '../context/ThemeContext';

const CANCEL_HOLD_DURATION_MS = 800;
const HOLD_RING_SIZE = 74;
const HOLD_RING_STROKE_WIDTH = 3;
const HOLD_RING_RADIUS = (HOLD_RING_SIZE - HOLD_RING_STROKE_WIDTH) / 2;
const HOLD_RING_CIRCUMFERENCE = 2 * Math.PI * HOLD_RING_RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours ? `${hours} h ${String(minutes).padStart(2, '0')} min` : `${minutes} min`;
}

export function ActiveWorkoutCard({ draft, onContinue, onCancel }: {
  draft: ActiveWorkoutDraft;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  const [nowMs, setNowMs] = useState(Date.now());
  const routine = draft.routineSnapshot;
  const sets = routine?.exercises.flatMap((exercise) => exercise.sets.map((set) => `${exercise.id}-${set.id}`)) ?? [];
  const completedCount = sets.filter((key) => draft.completedSets[key]).length;
  const nextSet = routine?.exercises.flatMap((exercise) => exercise.sets.map((set, index) => ({
    exerciseName: exercise.name,
    label: `Serie ${index + 1}`,
    key: `${exercise.id}-${set.id}`,
  }))).find((set) => !draft.completedSets[set.key]);
  const timing = reconcileActiveWorkoutTiming(draft, nowMs);
  const progress = sets.length ? Math.round((completedCount / sets.length) * 100) : 0;
  const isPaused = !!draft.pausedAtMs;
  const holdProgress = useSharedValue(0);
  const longPressCompleted = useRef(false);
  const suppressNextPress = useRef(false);
  const holdRingAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: HOLD_RING_CIRCUMFERENCE * (1 - holdProgress.value),
  }));

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [isPaused]);

  const startCancelHold = () => {
    longPressCompleted.current = false;
    cancelAnimation(holdProgress);
    holdProgress.value = 0;
    holdProgress.value = withTiming(1, { duration: CANCEL_HOLD_DURATION_MS });
  };

  const stopCancelHold = () => {
    if (longPressCompleted.current) return;
    cancelAnimation(holdProgress);
    holdProgress.value = withTiming(0, { duration: 150 });
  };

  const resumeAfterCancelPrompt = () => {
    longPressCompleted.current = false;
    cancelAnimation(holdProgress);
    holdProgress.value = withTiming(0, { duration: 150 });
  };

  const confirmCancelWorkout = () => {
    longPressCompleted.current = true;
    suppressNextPress.current = true;
    cancelAnimation(holdProgress);
    holdProgress.value = 1;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    Alert.alert(
      '¿Cancelar entrenamiento?',
      'Vas a descartar el progreso de este entrenamiento activo.',
      [
        { text: 'Seguir entrenando', style: 'cancel', onPress: resumeAfterCancelPrompt },
        { text: 'Cancelar entrenamiento', style: 'destructive', onPress: onCancel },
      ],
    );
  };

  const continueWorkout = () => {
    if (suppressNextPress.current) {
      suppressNextPress.current = false;
      return;
    }
    onContinue();
  };

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.status, { backgroundColor: `${theme.accent}24`, borderColor: theme.accent }]}>
          <View style={[styles.statusDot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.statusText, { color: theme.accent }]}>{isPaused ? 'PAUSADO' : 'EN CURSO'}</Text>
        </View>
        <Text style={[styles.elapsed, { color: theme.textMuted }]}>{formatDuration(timing.elapsedSeconds)}</Text>
      </View>
      <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{routine?.name ?? 'Entrenamiento en curso'}</Text>
      <Text style={[styles.next, { color: theme.textMuted }]} numberOfLines={1}>{nextSet ? `Sigue: ${nextSet.exerciseName} · ${nextSet.label}` : 'Todas las series están completas'}</Text>
      <View style={styles.progressRow}>
        <View style={[styles.track, { backgroundColor: theme.glassBorder }]}><View style={[styles.fill, { backgroundColor: theme.accent, width: `${progress}%` }]} /></View>
        <Text style={[styles.progressText, { color: theme.text }]}>{completedCount}/{sets.length}</Text>
      </View>
      <View style={styles.actions}>
        <View style={styles.continueControl}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continuar entrenamiento"
            accessibilityHint="Tocá para continuar. Mantené presionado para descartar el entrenamiento."
            delayLongPress={CANCEL_HOLD_DURATION_MS}
            onLongPress={confirmCancelWorkout}
            onPress={continueWorkout}
            onPressIn={startCancelHold}
            onPressOut={stopCancelHold}
            style={[styles.continueButton, { backgroundColor: theme.accent }]}
          >
            <Ionicons name="play" color={theme.onPrimary} size={16} />
            <Text style={[styles.continueText, { color: theme.onPrimary }]}>Continuar</Text>
          </Pressable>
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={styles.holdRing}
          >
            <Svg width={HOLD_RING_SIZE} height={HOLD_RING_SIZE} pointerEvents="none">
              <AnimatedCircle
                animatedProps={holdRingAnimatedProps}
                cx={HOLD_RING_SIZE / 2}
                cy={HOLD_RING_SIZE / 2}
                fill="none"
                r={HOLD_RING_RADIUS}
                rotation="-90"
                origin={`${HOLD_RING_SIZE / 2}, ${HOLD_RING_SIZE / 2}`}
                stroke={theme.onPrimary}
                strokeDasharray={HOLD_RING_CIRCUMFERENCE}
                strokeLinecap="round"
                strokeWidth={HOLD_RING_STROKE_WIDTH}
              />
            </Svg>
          </View>
        </View>
        <HapticPressable accessibilityRole="button" accessibilityLabel="Cancelar entrenamiento" onPress={onCancel} style={styles.cancelButton}><Text style={[styles.cancelText, { color: theme.textMuted }]}>Cancelar</Text></HapticPressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, marginBottom: 16 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  status: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 9, paddingVertical: 5 },
  statusDot: { borderRadius: 4, height: 7, width: 7 },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  elapsed: { fontSize: 12, fontWeight: '800' },
  title: { fontSize: 21, fontWeight: '900' },
  next: { fontSize: 13 },
  progressRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 2 },
  track: { borderRadius: 999, flex: 1, height: 7, overflow: 'hidden' },
  fill: { borderRadius: 999, height: '100%' },
  progressText: { fontSize: 12, fontWeight: '900', minWidth: 30, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  continueControl: { flex: 1, position: 'relative' },
  continueButton: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 13 },
  continueText: { fontSize: 15, fontWeight: '900' },
  holdRing: { alignItems: 'center', justifyContent: 'center', left: '50%', marginLeft: -HOLD_RING_SIZE / 2, marginTop: -HOLD_RING_SIZE / 2, position: 'absolute', top: '50%' },
  cancelButton: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  cancelText: { fontSize: 13, fontWeight: '800' },
});
