import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AppTheme } from '../../types';
import type { selectWeeklyProgress } from '../../utils/weeklyProgress';

type Effort = ReturnType<typeof selectWeeklyProgress>['current']['actualEffort'];
type Props = { current: Effort; previous: Effort; theme: AppTheme };
const format = (value: number) => value.toLocaleString('es', { maximumFractionDigits: 1 });

export function WeeklyEffort({ current, previous, theme }: Props) {
  return <View style={[styles.card, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
    <View style={styles.heading}>
      <View accessible={false} style={[styles.accent, { backgroundColor: theme.accent }]} />
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Esfuerzo registrado</Text>
    </View>
    <Text style={[styles.note, { color: theme.textMuted }]}>Promedios por serie · RIR y RPE por separado</Text>
    {(['rir', 'rpe'] as const).map((kind) => <View key={kind} style={styles.section}>
      <Text style={[styles.scale, { color: theme.text }]}>{kind === 'rir' ? 'RIR · repeticiones en reserva' : 'RPE · esfuerzo percibido'}</Text>
      <View style={styles.comparison}>
        {([['Actual · en curso', current], ['Anterior · completa', previous]] as const).map(([label, week]) => {
          const { average, count } = week[kind];
          const value = average === null ? 'Sin registros' : format(average);
          const coverage = `${count} de ${week.eligibleSets} series efectivas con ${kind.toUpperCase()}`;
          return <View key={label} accessible accessibilityLabel={`${label}: ${kind.toUpperCase()} ${value}. ${coverage}`} style={[styles.period, { borderColor: theme.glassBorder }]}>
            <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
            <Text style={[average === null ? styles.empty : styles.value, { color: theme.text }]}>{value}</Text>
            <Text style={[styles.note, { color: theme.textMuted }]}>{coverage}</Text>
          </View>;
        })}
      </View>
    </View>)}
    <Text style={[styles.note, { color: theme.textMuted }]}>Solo series efectivas realizadas con esfuerzo válido. Sin calentamientos ni objetivos planificados. Las series sin registro no entran en el promedio; más o menos no implica mejor entrenamiento.</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: 12, marginVertical: 8, padding: 16, borderRadius: 18, borderWidth: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accent: { width: 4, height: 20, borderRadius: 2 },
  title: { flex: 1, fontSize: 17, fontWeight: '800' },
  section: { gap: 8 },
  scale: { fontSize: 15, fontWeight: '700' },
  comparison: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  period: { flexGrow: 1, flexBasis: 144, minWidth: 0, gap: 6, paddingTop: 12, borderTopWidth: 1 },
  label: { fontSize: 13, fontWeight: '600' },
  value: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  empty: { fontSize: 18, fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 20 },
});
