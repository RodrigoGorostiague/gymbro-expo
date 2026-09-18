import React from 'react';
import { View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import type { MuscleDistributionEntry } from '../services/socialGraph';
import { radarPoints, radarPoint, svgPoints } from '../utils/radarGeometry';

const SIZE = 46;
const CENTER = SIZE / 2;
const RADIUS = 17;

export function MiniMuscleDistributionRadar({ data, color, fill, unit = 'puntos', scaleMax }: { data: readonly MuscleDistributionEntry[]; color: string; fill: string; unit?: string; scaleMax?: number }) {
  const max = scaleMax ?? Math.max(...data.map((entry) => entry.value), 0);
  if (!max || !data.length) return null;
  const grid = svgPoints(data.map((_, index) => radarPoint(index, data.length, RADIUS, CENTER)));
  const shape = svgPoints(radarPoints(data.map((entry) => entry.value), max, RADIUS, CENTER, 0));
  return <View accessible accessibilityRole="image" accessibilityLabel={`Distribución muscular compartida: ${data.map((entry) => `${entry.label}: ${entry.value.toFixed(2)} ${unit}`).join('; ')}`}><Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}><Polygon points={grid} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1} /><Polygon points={shape} fill={fill} fillOpacity={0.55} stroke={color} strokeWidth={1.5} /></Svg></View>;
}
