import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { ANTHROPOMETRICS } from '../constants/anthropometrics';
import { AppTheme, AnthropometricMetricType } from '../types';
import { HapticPressable } from './HapticPressable';
import { GlassInput } from './UI';

export type AnthropometricDraft = Partial<Record<AnthropometricMetricType, string>>;

export function AnthropometricFields({ values, onChange, theme }: { values: AnthropometricDraft; onChange: (type: AnthropometricMetricType, value: string) => void; theme: AppTheme }) {
  return <View style={styles.fields}>{ANTHROPOMETRICS.map((metric) => <View key={metric.type} style={styles.field}>
    <View style={styles.labelRow}>
      <Text style={[styles.label, { color: theme.text }]}>{metric.label}</Text>
      <HapticPressable accessibilityRole="button" accessibilityLabel={`Cómo medir ${metric.label}`} onPress={() => Alert.alert(metric.label, metric.help)} hitSlop={10}>
        <FontAwesome5 name="info-circle" size={16} color={theme.primary} solid />
      </HapticPressable>
    </View>
    <GlassInput keyboardType="decimal-pad" value={values[metric.type] ?? ''} onChangeText={(value) => onChange(metric.type, value)} placeholder={`Ej.: ${metric.unit === 'kg' ? '72,5' : '98'} ${metric.unit}`} accessibilityLabel={`${metric.label} en ${metric.unit}`} />
  </View>)}</View>;
}

const styles = StyleSheet.create({ fields: { gap: 12 }, field: { gap: 6 }, labelRow: { alignItems: 'center', flexDirection: 'row', gap: 8 }, label: { fontSize: 14, fontWeight: '800' } });
