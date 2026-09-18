import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppTheme } from '../../types';

type Props = { current: number | null; previous: number | null; theme: AppTheme };
const display = (value: number) => value.toLocaleString('es', { maximumFractionDigits: 1 });

/** Descriptive pace, not a score: more density is not necessarily better training. */
export function WeeklyDensity({ current, previous, theme }: Props) {
  return <View style={[styles.card, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
    <View style={styles.heading}>
      <View accessible={false} style={[styles.accent, { backgroundColor: theme.accent }]} />
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Densidad semanal</Text>
    </View>
    <Text style={[styles.description, { color: theme.text }]}>Series efectivas por hora registrada</Text>
    <View style={styles.comparison}>
      {([['Actual · en curso', current], ['Anterior · completa', previous]] as const).map(([label, value]) => (
        <View key={label} accessible accessibilityLabel={`${label}: ${value === null ? 'densidad no disponible' : `${display(value)} series efectivas por hora registrada`}`} style={[styles.period, { borderColor: theme.glassBorder }]}>
          <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
          <Text style={[value === null ? styles.unavailable : styles.value, { color: theme.text }]}>{value === null ? 'No disponible' : display(value)}</Text>
          <Text style={[styles.unit, { color: theme.textMuted }]}>{value === null ? 'Faltan registros completos con duración positiva' : 'series / hora'}</Text>
        </View>
      ))}
    </View>
    <Text style={[styles.note, { color: theme.textMuted }]}>Total de series ÷ horas guardadas, incluidos los descansos registrados. No mide tiempo activo ni calidad: más no siempre es mejor.</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: 12, marginVertical: 8, padding: 16, borderRadius: 18, borderWidth: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accent: { width: 4, height: 20, borderRadius: 2 },
  title: { flex: 1, fontSize: 17, fontWeight: '800' },
  description: { fontSize: 14, lineHeight: 21 },
  comparison: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  period: { flexGrow: 1, flexBasis: 144, minWidth: 0, gap: 6, paddingTop: 12, borderTopWidth: 1 },
  label: { fontSize: 13, fontWeight: '600' },
  value: { fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  unavailable: { fontSize: 18, fontWeight: '700' },
  unit: { fontSize: 13, lineHeight: 19 },
  note: { fontSize: 13, lineHeight: 20 },
});
