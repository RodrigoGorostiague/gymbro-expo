import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurMask, Canvas, Circle, Group, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import type { MuscleDistributionEntry } from '../services/socialGraph';
import type { AppTheme } from '../types';
import { useTheme } from '../context/ThemeContext';
import { radarPoint, radarPoints } from '../utils/radarGeometry';

const SIZE = 260;
const CENTER = SIZE / 2;
const RADIUS = 82;

function skiaPath(points: readonly { x: number; y: number }[]) {
  const [first, ...rest] = points;
  if (!first) return Skia.PathBuilder.Make().build();
  return rest.reduce(
    (builder, point) => builder.lineTo(point.x, point.y),
    Skia.PathBuilder.Make().moveTo(first.x, first.y),
  ).close().build();
}

export function MuscleDistributionRadar({ data, reference, palette }: { data: readonly MuscleDistributionEntry[]; reference?: readonly MuscleDistributionEntry[]; palette?: AppTheme }) {
  const { theme: activeTheme } = useTheme();
  const theme = palette ?? activeTheme;
  const [width, setWidth] = useState(0);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const reveal = useSharedValue(0);
  const populated = data.filter((entry) => entry.value > 0);
  if (!populated.length) return <View style={styles.empty}><Text style={{ color: theme.textMuted }}>Sin ejercicios completados en los últimos 90 días.</Text></View>;
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
  const polygon = useMemo(() => skiaPath(shapePoints), [data, max]);
  const referencePolygon = useMemo(() => skiaPath(referencePoints), [data, reference, comparisonMax]);
  const rings = useMemo(() => [.25, .5, .75, 1].map((ratio) => skiaPath(data.map((_, index) => radarPoint(index, data.length, RADIUS * ratio, CENTER)))), [data]);
  const summary = [...populated].sort((left, right) => right.value - left.value)[0];
  useEffect(() => { reveal.value = withDelay(90, withTiming(1, { duration: 720, easing: Easing.out(Easing.cubic) })); }, [reveal]);
  const revealStyle = useAnimatedStyle(() => ({ opacity: reveal.value, transform: [{ scale: 0.88 + reveal.value * 0.12 }] }));
  return <View accessible accessibilityRole="image" accessibilityLabel={`Distribución de estímulo muscular de los últimos 90 días. Mayor foco: ${summary.label}, ${summary.value.toFixed(2)} puntos.${reference ? ' Incluye el objetivo de referencia.' : ''}`} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
    <Animated.View style={[styles.canvasWrap, { width: SIZE * scale, height: SIZE * scale }, revealStyle]}>
      <Canvas style={StyleSheet.absoluteFill}>
        {rings.map((ring, index) => <Path key={index} path={ring} style="stroke" strokeWidth={index === rings.length - 1 ? 1.5 : 1} color={theme.glassBorder} opacity={0.44 + index * 0.08} />)}
        {data.map((_, index) => { const edge = radarPoint(index, data.length, RADIUS, CENTER); return <Path key={index} path={skiaPath([{ x: CENTER, y: CENTER }, edge, { x: CENTER, y: CENTER }])} style="stroke" strokeWidth={1} color={theme.glassBorder} opacity={0.45} />; })}
        {referenceTotal > 0 ? <Path path={referencePolygon} style="stroke" strokeWidth={2} color={theme.textMuted} opacity={0.8} /> : null}
        <Path path={polygon} color={theme.primary} opacity={0.32}><LinearGradient start={vec(CENTER, CENTER - RADIUS)} end={vec(CENTER, CENTER + RADIUS)} colors={[theme.accent, theme.primary]} /></Path>
        <Path path={polygon} style="stroke" strokeWidth={3} color={theme.primary}><BlurMask blur={focusedId ? 7 : 4} style="solid" /></Path>
        {shapePoints.map((point, index) => <Group key={data[index].id}><Circle cx={point.x} cy={point.y} r={focusedId === data[index].id ? 8 : 5} color={theme.accent} opacity={0.32}><BlurMask blur={6} style="solid" /></Circle><Circle cx={point.x} cy={point.y} r={focusedId === data[index].id ? 4.5 : 3.25} color={theme.accent} /></Group>)}
      </Canvas>
      {labels.map((entry) => <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`${entry.label}: ${entry.value.toFixed(2)} puntos de estímulo${referenceTotal ? `; objetivo ${(((referenceById.get(entry.id) ?? 0) / referenceTotal) * 100).toFixed(0)}%` : ''}`} onPress={() => setFocusedId(entry.id)} style={[styles.label, { left: entry.x * scale - 36, top: entry.y * scale - 10 }]}><Text numberOfLines={1} style={[styles.labelText, { color: focusedId === entry.id ? theme.accent : theme.text }]}>{entry.label} {entry.value.toFixed(1)}</Text></Pressable>)}
    </Animated.View>
    <Text style={[styles.hint, { color: theme.textMuted }]}>{referenceTotal ? 'Área de color: estímulo realizado. Contorno: distribución objetivo.' : 'Cada eje suma estímulo ponderado por relevancia.'}</Text>
  </View>;
}

const styles = StyleSheet.create({ empty: { alignItems: 'center', justifyContent: 'center', minHeight: 170, paddingHorizontal: 20 }, canvasWrap: { alignSelf: 'center', marginBottom: 2 }, label: { alignItems: 'center', position: 'absolute', width: 72 }, labelText: { fontSize: 10, fontWeight: '900', textAlign: 'center' }, hint: { fontSize: 12, lineHeight: 17, textAlign: 'center' } });
