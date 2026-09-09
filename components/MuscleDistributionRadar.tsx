import { useAnimationActivity } from '../hooks/useAnimationActivity';
import { CHART_DESIGN } from '../constants/chartDesign';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MuscleDistributionRadarCanvas } from './MuscleDistributionRadarCanvas';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import type { MuscleDistributionEntry } from '../services/socialGraph';
import type { AppTheme } from '../types';
import { useTheme } from '../context/ThemeContext';
import { radarPoint, radarPoints } from '../utils/radarGeometry';

const SIZE = 260;
const CENTER = SIZE / 2;
const RADIUS = 82;

export function MuscleDistributionRadar({ data, reference, palette }: { data: readonly MuscleDistributionEntry[]; reference?: readonly MuscleDistributionEntry[]; palette?: AppTheme }) {
  const { theme: activeTheme } = useTheme();
  const theme = palette ?? activeTheme;
  const [width, setWidth] = useState(0);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const reveal = useSharedValue(1);
  const animationActive = useAnimationActivity();
  const priorData = useRef<string | null>(null);
  const populated = data.filter((entry) => entry.value > 0);
  const max = Math.max(...data.map(({ value }) => value), 1);
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const referenceById = new Map(reference?.map((entry) => [entry.id, entry.value]));
  const referenceTotal = reference?.reduce((sum, entry) => sum + entry.value, 0) ?? 0;
  const comparisonMax = referenceTotal > 0 && total > 0
    ? Math.max(...data.map((entry) => entry.value / total), ...data.map((entry) => (referenceById.get(entry.id) ?? 0) / referenceTotal), 1e-6)
    : max;
  const scale = Math.min(1, width / SIZE || 1);
  const labels = data.map((entry, index) => ({ ...entry, ...radarPoint(index, data.length, RADIUS + 31, CENTER) }));
  const shapePoints = radarPoints(data.map((entry) => referenceTotal > 0 && total > 0 ? entry.value / total : entry.value), comparisonMax, RADIUS, CENTER, 8);
  const referencePoints = radarPoints(data.map((entry) => (referenceById.get(entry.id) ?? 0) / Math.max(referenceTotal, 1)), comparisonMax, RADIUS, CENTER, 0);
  const rings = [.25, .5, .75, 1].map((ratio) => data.map((_, index) => radarPoint(index, data.length, RADIUS * ratio, CENTER)));
  const axes = data.map((_, index) => radarPoint(index, data.length, RADIUS, CENTER));
  const summary = [...populated].sort((left, right) => right.value - left.value)[0];
  const signature = JSON.stringify([data, reference]);
  useEffect(() => {
    cancelAnimation(reveal);
    const changed = priorData.current !== null && priorData.current !== signature;
    priorData.current = signature;
    reveal.value = 1;
    if (animationActive && changed) {
      reveal.value = 0;
      reveal.value = withTiming(1, { duration: CHART_DESIGN.duration, easing: Easing.out(Easing.cubic) });
    }
    return () => cancelAnimation(reveal);
  }, [animationActive, signature, reveal]);
  const revealStyle = useAnimatedStyle(() => ({ opacity: reveal.value, transform: [{ scale: 0.88 + reveal.value * 0.12 }] }));
  if (!populated.length) return <View style={styles.empty}><Text style={{ color: theme.textMuted }}>Sin ejercicios completados en los últimos 90 días.</Text></View>;
  return <View accessibilityRole="summary" accessibilityLabel={`Distribución de estímulo muscular de los últimos 90 días. Mayor foco: ${summary.label}, ${summary.value.toFixed(2)} puntos.${reference ? ' Incluye el objetivo de referencia.' : ''}`} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
    <Animated.View style={[styles.canvasWrap, { width: SIZE * scale, height: SIZE * scale }, revealStyle]}>
      <MuscleDistributionRadarCanvas size={SIZE} center={CENTER} radius={RADIUS} rings={rings} axes={axes} shape={shapePoints} reference={referenceTotal > 0 ? referencePoints : undefined} focusedIndex={data.findIndex((entry) => entry.id === focusedId)} theme={theme} />
      {labels.map((entry) => <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`${entry.label}: ${entry.value.toFixed(2)} puntos de estímulo${referenceTotal ? `; objetivo ${(((referenceById.get(entry.id) ?? 0) / referenceTotal) * 100).toFixed(0)}%` : ''}`} onPress={() => setFocusedId(entry.id)} style={[styles.label, { left: entry.x * scale - 36, top: entry.y * scale - 10 }]}><Text numberOfLines={1} style={[styles.labelText, { color: focusedId === entry.id ? theme.accent : theme.text }]}>{entry.label} {entry.value.toFixed(1)}</Text></Pressable>)}
    </Animated.View>
    {focusedId ? <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: CHART_DESIGN.detail, fontWeight: '700' }}>{data.find((entry) => entry.id === focusedId)?.label}: {data.find((entry) => entry.id === focusedId)?.value.toFixed(2)} puntos de estímulo{referenceTotal ? ` · objetivo ${(((referenceById.get(focusedId) ?? 0) / referenceTotal) * 100).toFixed(0)}%` : ''}</Text> : null}
    <Text style={[styles.hint, { color: theme.textMuted }]}>{referenceTotal ? 'Área de color: estímulo realizado. Contorno: distribución objetivo.' : 'Cada eje suma estímulo ponderado por relevancia.'}</Text>
  </View>;
}

const styles = StyleSheet.create({ empty: { alignItems: 'center', justifyContent: 'center', minHeight: 170, paddingHorizontal: 20 }, canvasWrap: { alignSelf: 'center', marginBottom: 2 }, label: { alignItems: 'center', position: 'absolute', width: 72, minHeight: 48, justifyContent: 'center' }, labelText: { fontSize: CHART_DESIGN.label, fontWeight: '900', textAlign: 'center' }, hint: { fontSize: 12, lineHeight: 17, textAlign: 'center' } });
