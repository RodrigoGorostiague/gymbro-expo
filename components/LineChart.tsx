import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CartesianChart, Line } from 'victory-native';
import { useTheme } from '../context/ThemeContext';
import { ExerciseProgressPoint } from '../utils/analytics';

const CHART_HEIGHT = 180;

interface LineChartProps {
  data: ExerciseProgressPoint[];
  dataKey: 'maxWeight' | 'totalReps' | 'tonnage';
  label: string;
  summary?: string;
  unit?: string;
  replayKey?: number;
}

export function SimpleLineChart({ data, dataKey, label, summary, unit = '', replayKey = 0 }: LineChartProps) {
  const { theme } = useTheme();
  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ color: theme.textMuted }}>Sin datos aún</Text>
      </View>
    );
  }

  const chartData = data.map((point, index) => ({ x: index + 1, value: point[dataKey] }));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label}. ${summary ?? `${data.length} valores registrados`}`}
    >
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <View style={styles.chart} accessibilityLabel="Gráfico de evolución animado">
        <CartesianChart key={replayKey} data={chartData} xKey="x" yKeys={['value']} padding={{ left: 8, right: 8, top: 20, bottom: 12 }}>
          {({ points }) => <Line points={points.value} color={theme.primary} strokeWidth={3} curveType="natural" animate={{ type: 'timing', duration: 720 }} />}
        </CartesianChart>
      </View>
      <View style={styles.labels}>{data.map((point, index) => <Text key={point.date} style={[styles.tick, { color: theme.textMuted }]}>{data.length <= 6 || index % 2 === 0 ? point.label : ''}</Text>)}</View>
      {summary ? <Text style={[styles.summary, { color: theme.textMuted }]}>{summary}</Text> : null}
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
  chart: { height: CHART_HEIGHT - 28 },
  labels: { flexDirection: 'row', justifyContent: 'space-around', marginTop: -4 },
  tick: { flex: 1, fontSize: 10, textAlign: 'center' },
  summary: { fontSize: 12, lineHeight: 17, marginTop: 6 },
});
