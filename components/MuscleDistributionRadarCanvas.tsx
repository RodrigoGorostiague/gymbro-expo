import React, { useId } from 'react';
import Svg, { Circle, Defs, Line, LinearGradient, Polygon, Stop } from 'react-native-svg';
import { svgPoints } from '../utils/radarGeometry';
import type { MuscleDistributionRadarCanvasProps } from './MuscleDistributionRadarCanvas.types';

/** Browser-safe drawing layer: no CanvasKit import, download or initialization. */
export function MuscleDistributionRadarCanvas({ size, center, radius, rings, axes, shape, reference, focusedIndex, theme }: MuscleDistributionRadarCanvasProps) {
  const gradientId = `radar-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return <Svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} accessible={false} pointerEvents="none">
    <Defs><LinearGradient id={gradientId} x1={center} y1={center - radius} x2={center} y2={center + radius} gradientUnits="userSpaceOnUse"><Stop offset="0" stopColor={theme.accent} /><Stop offset="1" stopColor={theme.primary} /></LinearGradient></Defs>
    {rings.map((ring, index) => <Polygon key={index} points={svgPoints(ring)} fill="none" stroke={theme.glassBorder} strokeWidth={index === rings.length - 1 ? 1.5 : 1} opacity={0.44 + index * 0.08} />)}
    {axes.map((edge, index) => <Line key={index} x1={center} y1={center} x2={edge.x} y2={edge.y} stroke={theme.glassBorder} strokeWidth={1} opacity={0.45} />)}
    {reference ? <Polygon points={svgPoints(reference)} fill="none" stroke={theme.textMuted} strokeWidth={2} opacity={0.8} /> : null}
    <Polygon points={svgPoints(shape)} fill={`url(#${gradientId})`} fillOpacity={0.32} stroke={theme.primary} strokeWidth={3} strokeLinejoin="round" />
    <Polygon points={svgPoints(shape)} fill="none" stroke={theme.primary} strokeWidth={focusedIndex >= 0 ? 9 : 6} strokeOpacity={0.12} strokeLinejoin="round" />
    {shape.map((point, index) => <React.Fragment key={index}><Circle cx={point.x} cy={point.y} r={focusedIndex === index ? 8 : 5} fill={theme.accent} opacity={0.32} /><Circle cx={point.x} cy={point.y} r={focusedIndex === index ? 4.5 : 3.25} fill={theme.accent} /></React.Fragment>)}
  </Svg>;
}
