import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BarGroup, CartesianChart, StackedBar } from 'victory-native';
import { useAnimationActivity } from '../hooks/useAnimationActivity';
import { CHART_ANIMATION, CHART_DESIGN, nearestChartIndex } from '../constants/chartDesign';
import { ChartInspector } from './ChartInspector';
type Palette = {
    primary: string;
    secondary: string;
    accent: string;
    textMuted: string;
    glassBorder: string;
};
type ComparisonDatum = {
    label: string;
    current: number;
    previous: number;
    unit?: string;
};
type ComparisonProps = {
    data: readonly ComparisonDatum[];
    palette: Palette;
    currentLabel?: string;
    previousLabel?: string;
    accessibilityLabel: string;
    replayKey?: number;
};
export function ComparisonBarChart(props: ComparisonProps) {
    const units = [...new Set(props.data.map((datum) => datum.unit ?? ''))];
    // Separate scales for semantically distinct units; counts and percentages never share an axis.
    return <View>{units.map((unit) => <ComparisonPanel key={unit} {...props} data={props.data.filter((datum) => (datum.unit ?? '') === unit)}/>)}</View>;
}
function ComparisonPanel({ data, palette, currentLabel = 'Actual', previousLabel = 'Anterior', accessibilityLabel }: ComparisonProps) {
    const animate = useAnimationActivity();
    const [width, setWidth] = useState(0);
    const [selected, setSelected] = useState(0);
    if (!data.length)
        return null;
    const index = Math.min(selected, data.length - 1);
    const chartData = data.map((datum, x) => ({
        x: x + 1, current: datum.current, previous: datum.previous
    }));
    const details = data.map((datum) => `${datum.label}: ${currentLabel} ${datum.current}${datum.unit ? ` ${datum.unit}` : ''}${previousLabel ? `; ${previousLabel} ${datum.previous}${datum.unit ? ` ${datum.unit}` : ''}` : ''}`);
    return <View style={styles.wrap}>
    <Text accessibilityRole="header" style={[styles.title, { color: palette.textMuted }]}>{accessibilityLabel}{data[0].unit ? ` · ${data[0].unit}` : ''}</Text>
    <View testID="comparison-chart-touch" style={styles.chart} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)} onTouchEnd={({ nativeEvent }) => setSelected(nearestChartIndex(nativeEvent.locationX, width, data.length))}>
      <CartesianChart data={chartData} xKey="x" yKeys={['current', 'previous']} domain={{ y: [0] }} padding={{
        left: 16, right: 16, top: 12, bottom: 6
    }}>
        {({ points, chartBounds }) => <BarGroup chartBounds={chartBounds} betweenGroupPadding={0.32} withinGroupPadding={0.15} roundedCorners={{ topLeft: 5, topRight: 5 }}>
          {(previousLabel ? ['current', 'previous'] as const : ['current'] as const).map((series) => <BarGroup.Bar key={series} points={points[series]} color={series === 'current' ? palette.primary : palette.textMuted} animate={animate ? CHART_ANIMATION : undefined}/>)}
        </BarGroup>}
      </CartesianChart>
    </View>
    <View style={styles.legend}><Legend color={palette.primary} textColor={palette.textMuted} label={currentLabel}/><Legend color={palette.textMuted} textColor={palette.textMuted} label={previousLabel}/></View>
    <ChartInspector labels={data.map(({ label }) => label)} details={details} selected={index} onSelect={setSelected} color={palette.primary} muted={palette.textMuted}/>
  </View>;
}
export function DistributionBarChart({ data, ...props }: Omit<ComparisonProps, 'data'> & {
    data: readonly {
        label: string;
        value: number;
    }[];
}) {
    return <ComparisonBarChart {...props} data={data.map(({ label, value }) => ({
        label, current: value, previous: 0
    }))} currentLabel="Valor" previousLabel=""/>;
}
export function AdherenceStackedChart({ data, palette, accessibilityLabel }: {
    data: readonly {
        label: string;
        completed: number;
        remaining: number;
    }[];
    palette: Palette;
    accessibilityLabel: string;
    replayKey?: number;
}) {
    const animate = useAnimationActivity();
    const [selected, setSelected] = useState(0);
    const [width, setWidth] = useState(0);
    if (!data.length)
        return null;
    const chartData = data.map((datum, x) => ({
        x: x + 1, completed: datum.completed, remaining: datum.remaining
    }));
    return <View style={styles.wrap}>
    <Text accessibilityRole="header" style={[styles.title, { color: palette.textMuted }]}>{accessibilityLabel}</Text>
    <View testID="adherence-chart-touch" style={styles.chart} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)} onTouchEnd={({ nativeEvent }) => setSelected(nearestChartIndex(nativeEvent.locationX, width, data.length))}>
      <CartesianChart data={chartData} xKey="x" yKeys={['completed', 'remaining']} domain={{ y: [0] }} padding={{
        left: 16, right: 16, top: 12, bottom: 6
    }}>
        {({ points, chartBounds }) => <StackedBar chartBounds={chartBounds} points={[points.completed, points.remaining]} colors={[palette.primary, palette.glassBorder]} innerPadding={0.3} animate={animate ? CHART_ANIMATION : undefined}/>}
      </CartesianChart>
    </View>
    <View style={styles.legend}><Legend color={palette.primary} textColor={palette.textMuted} label="Completadas"/><Legend color={palette.glassBorder} textColor={palette.textMuted} label="Pendientes"/></View>
    <ChartInspector labels={data.map(({ label }) => label)} details={data.map((datum) => `${datum.label}: ${datum.completed} completadas; ${datum.remaining} pendientes`)} selected={Math.min(selected, data.length - 1)} onSelect={setSelected} color={palette.primary} muted={palette.textMuted}/>
  </View>;
}
function Legend({ color, textColor, label }: {
    color: string;
    textColor: string;
    label: string;
}) {
    return label ? <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: color }]}/><Text style={{ color: textColor, fontSize: CHART_DESIGN.label }}>{label}</Text></View> : null;
}
const styles = StyleSheet.create({
    wrap: { marginTop: 14, gap: 10 }, chart: { height: CHART_DESIGN.height }, title: { fontSize: 14, fontWeight: '800' }, legend: {
        flexDirection: 'row', gap: 16, flexWrap: 'wrap'
    }, legendItem: {
        alignItems: 'center', flexDirection: 'row', gap: 6
    }, dot: {
        width: 10, height: 10, borderRadius: 3
    }
});
