import React from 'react';
import { StyleSheet } from 'react-native';
import { BlurMask, Canvas, Circle, Group, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';
import type { RadarPoint } from '../utils/radarGeometry';
import type { MuscleDistributionRadarCanvasProps } from './MuscleDistributionRadarCanvas.types';

function skiaPath(points: readonly RadarPoint[]) {
  const [first, ...rest] = points;
  if (!first) return Skia.PathBuilder.Make().build();
  return rest.reduce((builder, point) => builder.lineTo(point.x, point.y), Skia.PathBuilder.Make().moveTo(first.x, first.y)).close().build();
}

/** Metro resolves this drawing layer only on native platforms. */
export function MuscleDistributionRadarCanvas({ drawScale = 1, center, radius, rings, axes, shape, reference, focusedIndex, theme }: MuscleDistributionRadarCanvasProps) {
  const polygon = skiaPath(shape);
  return <Canvas style={StyleSheet.absoluteFill}><Group transform={[{ scale: drawScale }]}>
    {rings.map((ring, index) => <Path key={index} path={skiaPath(ring)} style="stroke" strokeWidth={index === rings.length - 1 ? 1.5 : 1} color={theme.glassBorder} opacity={0.44 + index * 0.08} />)}
    {axes.map((edge, index) => <Path key={index} path={skiaPath([{ x: center, y: center }, edge, { x: center, y: center }])} style="stroke" strokeWidth={1} color={theme.glassBorder} opacity={0.45} />)}
    {reference ? <Path path={skiaPath(reference)} style="stroke" strokeWidth={2} color={theme.textMuted} opacity={0.8} /> : null}
    <Path path={polygon} color={theme.primary} opacity={0.32}><LinearGradient start={vec(center, center - radius)} end={vec(center, center + radius)} colors={[theme.accent, theme.primary]} /></Path>
    <Path path={polygon} style="stroke" strokeWidth={3} color={theme.primary}><BlurMask blur={focusedIndex >= 0 ? 7 : 4} style="solid" /></Path>
    {shape.map((point, index) => <Group key={index}><Circle cx={point.x} cy={point.y} r={focusedIndex === index ? 8 : 5} color={theme.accent} opacity={0.32}><BlurMask blur={6} style="solid" /></Circle><Circle cx={point.x} cy={point.y} r={focusedIndex === index ? 4.5 : 3.25} color={theme.accent} /></Group>)}
  </Group></Canvas>;
}
