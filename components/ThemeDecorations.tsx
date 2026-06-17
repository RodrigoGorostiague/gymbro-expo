import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg';
import { AppTheme, ThemeDecoration } from '../types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface ThemeDecorationsProps {
  decoration: ThemeDecoration;
  theme: AppTheme;
  compact?: boolean;
}

function StarShape({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon
        points="12,2 15,9 22,9 16.5,13.5 18.5,21 12,17 5.5,21 7.5,13.5 2,9 9,9"
        fill={color}
        opacity={0.85}
      />
    </Svg>
  );
}

function MoonShape({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M21 14.5A8.5 8.5 0 0 1 9.5 3 10 10 0 0 0 21 14.5z"
        fill={color}
        opacity={0.9}
      />
    </Svg>
  );
}

function SunShape({ color, size }: { color: string; size: number }) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4;
    const x1 = 12 + Math.cos(angle) * 7;
    const y1 = 12 + Math.sin(angle) * 7;
    const x2 = 12 + Math.cos(angle) * 10;
    const y2 = 12 + Math.sin(angle) * 10;
    return { x1, y1, x2, y2, key: i };
  });

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {rays.map((ray) => (
        <Line
          key={ray.key}
          x1={ray.x1}
          y1={ray.y1}
          x2={ray.x2}
          y2={ray.y2}
          stroke={color}
          strokeWidth={1.5}
          opacity={0.8}
        />
      ))}
      <Circle cx={12} cy={12} r={4.5} fill={color} opacity={0.95} />
    </Svg>
  );
}

function LeafShape({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2C8 6 4 10 6 16c1.5 4 4 6 6 6s4.5-2 6-6c2-6-2-10-6-14z"
        fill={color}
        opacity={0.85}
      />
      <Path d="M12 8v10M9 11l3-3 3 3" stroke={color} strokeWidth={1} opacity={0.5} fill="none" />
    </Svg>
  );
}

function SnowflakeShape({ color, size }: { color: string; size: number }) {
  const arms = Array.from({ length: 6 }, (_, i) => {
    const angle = (i * Math.PI) / 3;
    const x2 = 12 + Math.cos(angle) * 9;
    const y2 = 12 + Math.sin(angle) * 9;
    return { x2, y2, key: i };
  });

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {arms.map((arm) => (
        <Line
          key={arm.key}
          x1={12}
          y1={12}
          x2={arm.x2}
          y2={arm.y2}
          stroke={color}
          strokeWidth={1.4}
          opacity={0.85}
        />
      ))}
      <Circle cx={12} cy={12} r={2} fill={color} opacity={0.9} />
    </Svg>
  );
}

const SHAPES: Record<
  ThemeDecoration,
  React.ComponentType<{ color: string; size: number }>
> = {
  star: StarShape,
  moon: MoonShape,
  sun: SunShape,
  leaf: LeafShape,
  snowflake: SnowflakeShape,
};

const LAYOUTS: Record<ThemeDecoration, Array<{ x: number; y: number; size: number; colorKey: 'primary' | 'accent' | 'secondary' }>> = {
  star: [
    { x: 0.12, y: 0.1, size: 36, colorKey: 'accent' },
    { x: 0.72, y: 0.18, size: 28, colorKey: 'primary' },
    { x: 0.55, y: 0.55, size: 22, colorKey: 'accent' },
    { x: 0.2, y: 0.72, size: 30, colorKey: 'secondary' },
  ],
  moon: [
    { x: 0.78, y: 0.08, size: 44, colorKey: 'accent' },
    { x: 0.15, y: 0.35, size: 26, colorKey: 'primary' },
    { x: 0.65, y: 0.62, size: 32, colorKey: 'secondary' },
  ],
  sun: [
    { x: 0.7, y: 0.12, size: 48, colorKey: 'primary' },
    { x: 0.18, y: 0.55, size: 30, colorKey: 'accent' },
    { x: 0.5, y: 0.78, size: 24, colorKey: 'secondary' },
  ],
  leaf: [
    { x: 0.1, y: 0.2, size: 38, colorKey: 'primary' },
    { x: 0.75, y: 0.28, size: 32, colorKey: 'accent' },
    { x: 0.35, y: 0.65, size: 28, colorKey: 'secondary' },
    { x: 0.82, y: 0.7, size: 24, colorKey: 'primary' },
  ],
  snowflake: [
    { x: 0.15, y: 0.12, size: 34, colorKey: 'accent' },
    { x: 0.68, y: 0.22, size: 40, colorKey: 'primary' },
    { x: 0.42, y: 0.48, size: 28, colorKey: 'secondary' },
    { x: 0.22, y: 0.75, size: 32, colorKey: 'accent' },
    { x: 0.8, y: 0.68, size: 26, colorKey: 'primary' },
  ],
};

export function ThemeDecorations({ decoration, theme, compact }: ThemeDecorationsProps) {
  const Shape = SHAPES[decoration];
  const layouts = LAYOUTS[decoration];
  const containerW = compact ? 72 : SCREEN_W;
  const containerH = compact ? 72 : SCREEN_H;

  return (
    <View style={compact ? styles.compact : styles.container} pointerEvents="none">
      {layouts.map((item, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            left: item.x * containerW,
            top: item.y * containerH,
            opacity: compact ? 0.95 : 0.35,
          }}
        >
          <Shape color={theme[item.colorKey]} size={compact ? item.size * 0.55 : item.size} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  compact: {
    position: 'relative',
    width: 72,
    height: 72,
  },
});
