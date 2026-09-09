import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HapticPressable } from './HapticPressable';
import { CHART_DESIGN } from '../constants/chartDesign';
export function ChartInspector({ labels, details, selected, onSelect, color, muted }: {
    labels: readonly string[];
    details: readonly string[];
    selected: number;
    onSelect: (index: number) => void;
    color: string;
    muted: string;
}) {
    return <View style={styles.content}>
    <Text accessibilityLiveRegion="polite" style={[styles.detail, { color }]}>{details[selected] ?? 'Sin datos seleccionados'}</Text>
    <Text style={[styles.hint, { color: muted }]}>Toca el gráfico o elige un punto para inspeccionarlo.</Text>
    <View style={styles.points}>{labels.map((label, index) => <HapticPressable key={`${label}-${index}`} accessibilityRole="button" accessibilityLabel={details[index]} accessibilityState={{ selected: index === selected }} onPress={() => onSelect(index)} style={[styles.point, { borderColor: index === selected ? color : muted }]}><Text style={{ color: index === selected ? color : muted }}>{label}</Text></HapticPressable>)}</View>
  </View>;
}
const styles = StyleSheet.create({
    content: { gap: 8, marginTop: 12 }, detail: {
        fontSize: CHART_DESIGN.detail, fontWeight: '700', lineHeight: 22
    }, hint: { fontSize: CHART_DESIGN.label }, points: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 6
    }, point: {
        minHeight: 48, minWidth: 48, padding: 10, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center'
    }
});
