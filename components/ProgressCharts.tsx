import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BarGroup, CartesianChart, StackedBar } from 'victory-native';

type Palette = { primary: string; secondary: string; accent: string; textMuted: string; glassBorder: string };
type ComparisonDatum = { label: string; current: number; previous: number };

export function ComparisonBarChart({ data, palette, currentLabel = 'Actual', previousLabel = 'Anterior', accessibilityLabel, replayKey = 0 }: { data: readonly ComparisonDatum[]; palette: Palette; currentLabel?: string; previousLabel?: string; accessibilityLabel: string; replayKey?: number }) {
  if (!data.length) return null;
  const chartData = data.map((datum, index) => ({ x: index + 1, current: datum.current, previous: datum.previous }));
  return <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={styles.wrap}>
    <View style={styles.chart}><CartesianChart key={replayKey} data={chartData} xKey="x" yKeys={['current', 'previous']} padding={{ left: 8, right: 8, top: 12, bottom: 6 }}>{({ points, chartBounds }) => <BarGroup chartBounds={chartBounds} betweenGroupPadding={0.32} withinGroupPadding={0.15} roundedCorners={{ topLeft: 5, topRight: 5 }}><BarGroup.Bar points={points.current} color={palette.primary} animate={{ type: 'timing', duration: 620 }} /><BarGroup.Bar points={points.previous} color={palette.secondary} animate={{ type: 'timing', duration: 620 }} /></BarGroup>}</CartesianChart></View>
    <View style={styles.labels}>{data.map((datum) => <Text key={datum.label} numberOfLines={1} style={[styles.label, { color: palette.textMuted }]}>{datum.label}</Text>)}</View>
    <View style={styles.legend}><Legend color={palette.primary} label={currentLabel} /><Legend color={palette.secondary} label={previousLabel} /></View>
  </View>;
}

export function DistributionBarChart({ data, palette, accessibilityLabel, replayKey = 0 }: { data: readonly { label: string; value: number }[]; palette: Palette; accessibilityLabel: string; replayKey?: number }) {
  return <ComparisonBarChart data={data.map(({ label, value }) => ({ label, current: value, previous: 0 }))} palette={palette} currentLabel="Valor" previousLabel="" accessibilityLabel={accessibilityLabel} replayKey={replayKey} />;
}

export function AdherenceStackedChart({ data, palette, accessibilityLabel, replayKey = 0 }: { data: readonly { label: string; completed: number; remaining: number }[]; palette: Palette; accessibilityLabel: string; replayKey?: number }) {
  if (!data.length) return null;
  const chartData = data.map((datum, index) => ({ x: index + 1, completed: datum.completed, remaining: datum.remaining }));
  return <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={styles.wrap}>
    <View style={styles.chart}><CartesianChart key={replayKey} data={chartData} xKey="x" yKeys={['completed', 'remaining']} padding={{ left: 8, right: 8, top: 12, bottom: 6 }}>{({ points, chartBounds }) => <StackedBar chartBounds={chartBounds} points={[points.completed, points.remaining]} colors={[palette.primary, palette.glassBorder]} innerPadding={0.3} animate={{ type: 'timing', duration: 680 }} barOptions={({ isTop }) => ({ roundedCorners: isTop ? { topLeft: 5, topRight: 5 } : undefined })} />}</CartesianChart></View>
    <View style={styles.labels}>{data.map((datum) => <Text key={datum.label} numberOfLines={1} style={[styles.label, { color: palette.textMuted }]}>{datum.label}</Text>)}</View>
    <View style={styles.legend}><Legend color={palette.primary} label="Completadas" /><Legend color={palette.glassBorder} label="Pendientes" /></View>
  </View>;
}

function Legend({ color, label }: { color: string; label: string }) {
  if (!label) return null;
  return <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 }, chart: { height: 156 }, labels: { flexDirection: 'row', justifyContent: 'space-around', marginTop: -2 }, label: { flex: 1, fontSize: 10, textAlign: 'center' }, legend: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 10 }, legendItem: { alignItems: 'center', flexDirection: 'row', gap: 5 }, dot: { borderRadius: 4, height: 8, width: 8 }, legendText: { color: '#9CA3AF', fontSize: 11, fontWeight: '700' },
});
