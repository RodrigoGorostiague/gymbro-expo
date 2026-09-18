import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CartesianChart, Line } from 'victory-native';
import { useTheme } from '../context/ThemeContext';
import { ExerciseProgressPoint } from '../utils/analytics';
import { useAnimationActivity } from '../hooks/useAnimationActivity';
import { CHART_ANIMATION, CHART_DESIGN, nearestChartIndex } from '../constants/chartDesign';
import { ChartInspector } from './ChartInspector';
interface LineChartProps {
    data: ExerciseProgressPoint[];
    dataKey: 'maxWeight' | 'totalReps' | 'tonnage';
    label: string;
    summary?: string;
    unit?: string;
    replayKey?: number;
}
export function SimpleLineChart({ data, dataKey, label, summary, unit = '' }: LineChartProps) {
    const { theme } = useTheme();
    const animate = useAnimationActivity();
    const [width, setWidth] = useState(0);
    const [selected, setSelected] = useState(0);
    if (!data.length)
        return <View style={styles.empty}><Text style={{ color: theme.textMuted }}>Sin datos aún</Text></View>;
    const index = Math.min(selected, data.length - 1);
    const chartData = data.map((point, x) => ({ x: x + 1, value: point[dataKey] }));
    return <View style={styles.surface}>
    <Text accessibilityRole="header" style={[styles.label, { color: theme.text }]}>{label}{unit ? ` · ${unit}` : ''}</Text>
    <View testID="line-chart-touch" accessible={false} accessibilityLabel={`${label}. ${summary ?? `${data.length} valores registrados`}`} style={styles.chart} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)} onTouchEnd={({ nativeEvent }) => setSelected(nearestChartIndex(nativeEvent.locationX, width, data.length))}>
      <CartesianChart data={chartData} xKey="x" yKeys={['value']} padding={{
        left: 16, right: 16, top: 16, bottom: 12
    }}>
        {({ points }) => <Line points={points.value} color={theme.primary} strokeWidth={CHART_DESIGN.stroke} curveType="linear" animate={animate ? CHART_ANIMATION : undefined}/>}
      </CartesianChart>
      <View pointerEvents="none" style={[styles.selection, { left: 16 + (width - 32) * index / Math.max(1, data.length - 1), borderColor: theme.textMuted }]}/>
    </View>
    <ChartInspector labels={data.map((point) => point.label)} details={data.map((point) => `${point.label}: ${point[dataKey]} ${unit}`.trim())} selected={index} onSelect={setSelected} color={theme.text} muted={theme.textMuted}/>
    {summary ? <Text style={[styles.summary, { color: theme.textMuted }]}>{summary}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
    empty: {
        minHeight: CHART_DESIGN.height, alignItems: 'center', justifyContent: 'center'
    }, surface: { gap: 8 }, label: { fontSize: 16, fontWeight: '800' }, chart: { height: CHART_DESIGN.height }, selection: {
        position: 'absolute', top: 12, bottom: 12, borderLeftWidth: 1, borderStyle: 'dashed'
    }, summary: {
        fontSize: CHART_DESIGN.label, lineHeight: 18, marginTop: 6
    }
});
