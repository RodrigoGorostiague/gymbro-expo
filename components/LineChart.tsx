import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { ExerciseProgressPoint } from '../utils/analytics';

const CHART_WIDTH = Dimensions.get('window').width - 64;
const CHART_HEIGHT = 180;
const PADDING = 24;

interface LineChartProps {
  data: ExerciseProgressPoint[];
  dataKey: 'maxWeight' | 'totalReps' | 'tonnage';
  label: string;
}

export function SimpleLineChart({ data, dataKey, label }: LineChartProps) {
  const { theme } = useTheme();

  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ color: theme.textMuted }}>Sin datos aún</Text>
      </View>
    );
  }

  const values = data.map((d) => d[dataKey]);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const chartW = CHART_WIDTH - PADDING * 2;
  const chartH = CHART_HEIGHT - PADDING * 2;

  const points = data.map((d, i) => {
    const x = PADDING + (i / Math.max(data.length - 1, 1)) * chartW;
    const y = PADDING + chartH - ((d[dataKey] - minVal) / range) * chartH;
    return `${x},${y}`;
  });

  return (
    <View>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        <Line
          x1={PADDING}
          y1={PADDING + chartH}
          x2={PADDING + chartW}
          y2={PADDING + chartH}
          stroke={theme.glassBorder}
          strokeWidth={1}
        />
        <Polyline
          points={points.join(' ')}
          fill="none"
          stroke={theme.primary}
          strokeWidth={2.5}
        />
        {data.map((d, i) => {
          const x = PADDING + (i / Math.max(data.length - 1, 1)) * chartW;
          const y = PADDING + chartH - ((d[dataKey] - minVal) / range) * chartH;
          return (
            <React.Fragment key={d.date}>
              <Circle cx={x} cy={y} r={4} fill={theme.accent} />
              <SvgText
                x={x}
                y={CHART_HEIGHT - 4}
                fill={theme.textMuted}
                fontSize={10}
                textAnchor="middle"
              >
                {d.label}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '600',
  },
});
