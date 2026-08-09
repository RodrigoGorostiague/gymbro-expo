import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Mesocycle, Routine, WorkoutAttempt } from '../types';
import { deriveMesocycleAdherence, deriveMesocycleTrainingProgress } from '../utils/mesocycles';
import { deriveMesocycleDateRange, deriveMesocycleTemporalLabel, getMesocycleStatusCopy } from '../utils/mesocycleAnalytics';
import { useTheme } from '../context/ThemeContext';
import { GlassCard } from './GlassCard';
import { useData } from '../context/DataContext';
import { muscleGroupLabel } from '../utils/catalogMuscleGroups';
import { HapticPressable } from './HapticPressable';

const temporalCopy = { upcoming: 'Próximamente', 'in-progress': 'En curso', ended: 'Finalizado por fecha', undated: 'Sin calendario' } as const;

const formatRange = (mesocycle: Mesocycle) => {
  const range = deriveMesocycleDateRange(mesocycle);
  if (!range) return 'Sin fecha definida';
  const format = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  return `${format(range.startDate)} — ${format(range.endDate)}`;
};

export function MesocycleOverviewCard({ mesocycle, attempts, routines, onOpen, onDelete }: { mesocycle: Mesocycle; attempts: readonly WorkoutAttempt[]; routines: readonly Routine[]; onOpen: () => void; onDelete: () => void }) {
  const { theme } = useTheme();
  const { catalogMuscleGroups = [] } = useData();
  const adherence = deriveMesocycleAdherence(mesocycle, attempts);
  const training = deriveMesocycleTrainingProgress(mesocycle, attempts, routines);
  const status = getMesocycleStatusCopy(mesocycle.status);
  const temporal = deriveMesocycleTemporalLabel(mesocycle);
  const progress = adherence.plannedSessions ? Math.round((adherence.completedSessions / adherence.plannedSessions) * 100) : 0;
  const weekProgress = adherence.weeks.slice(0, 8).map((week) => week.plannedSessions ? Math.round((week.completedSessions / week.plannedSessions) * 100) : 0);
  const [expanded, setExpanded] = useState(false);

  const muscles = Object.entries(training.muscles).sort(([, left], [, right]) => right.plannedSets - left.plannedSets).slice(0, 4);
  return <GlassCard style={styles.card}>
    <HapticPressable accessibilityRole="button" accessibilityLabel={`Abrir resumen de ${mesocycle.name}`} accessibilityHint="Abre las sesiones y el detalle completo del mesociclo." onPress={onOpen} style={styles.openArea}>
      <View style={styles.header}><View style={styles.titleWrap}><Text style={[styles.title, { color: theme.text }]}>{mesocycle.name}</Text><Text style={[styles.goal, { color: theme.textMuted }]} numberOfLines={2}>{mesocycle.goal || 'Sin objetivo definido'}</Text></View><View accessible accessibilityLabel={status.accessibilityLabel} style={[styles.status, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}><Text style={[styles.statusText, { color: theme.primary }]}>{status.label}</Text></View></View>
      <View style={styles.badges}><Text style={[styles.badge, { color: theme.primary, borderColor: theme.primary }]}>{formatRange(mesocycle)}</Text><Text style={[styles.badge, { color: theme.secondary, borderColor: theme.secondary }]}>{temporalCopy[temporal]}</Text><Text style={[styles.badge, { color: theme.textMuted, borderColor: theme.glassBorder }]}>{mesocycle.durationWeeks} sem.</Text></View>
      <View style={styles.metrics}><Metric label="Adherencia" value={`${progress}%`} color={theme.primary} /><Metric label="Series" value={`${training.completedEffectiveSets}/${training.plannedEffectiveSets}`} color={theme.text} /><Metric label="Tonelaje" value={`${Math.round(training.volume)} kg`} color={theme.text} /></View>
      <View style={styles.progressHeader}><Text style={[styles.progressLabel, { color: theme.textMuted }]}>Sesiones del bloque</Text><Text style={[styles.progressValue, { color: theme.text }]}>{adherence.completedSessions}/{adherence.plannedSessions}</Text></View><View style={[styles.track, { backgroundColor: theme.glassBorder }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }}><View style={[styles.fill, { width: `${progress}%`, backgroundColor: theme.primary }]} /></View>
    </HapticPressable>
    <View style={[styles.cardActions, { borderColor: theme.glassBorder }]}><HapticPressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel="Desplegar estadísticas del mesociclo" accessibilityHint={expanded ? 'Oculta estadísticas y progreso detallado.' : 'Muestra estadísticas y progreso detallado.'} onPress={() => setExpanded((current) => !current)} style={[styles.iconAction, { borderColor: theme.glassBorder }]}><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={21} color={theme.primary} /></HapticPressable><HapticPressable accessibilityRole="button" accessibilityLabel={`Eliminar ${mesocycle.name}`} accessibilityHint="Solicita confirmación antes de eliminar este mesociclo." onPress={onDelete} style={[styles.iconAction, { borderColor: theme.glassBorder }]}><Ionicons name="trash-outline" size={19} color={theme.textMuted} /></HapticPressable></View>
    {expanded ? <><View style={[styles.detailDivider, { backgroundColor: theme.glassBorder }]} />{muscles.length ? <View style={styles.muscles}>{muscles.map(([id, muscle]) => { const value = muscle.plannedSets ? Math.min(100, Math.round(muscle.completedSets / muscle.plannedSets * 100)) : 0; return <View key={id} style={styles.muscle}><View style={styles.progressHeader}><Text style={[styles.muscleLabel, { color: theme.text }]}>{muscleGroupLabel(catalogMuscleGroups, id)}</Text><Text style={[styles.progressValue, { color: theme.textMuted }]}>{muscle.completedSets.toFixed(1)}/{muscle.plannedSets.toFixed(1)}</Text></View><View style={[styles.smallTrack, { backgroundColor: theme.glassBorder }]}><View style={[styles.fill, { width: `${value}%`, backgroundColor: value === 100 ? theme.secondary : theme.primary }]} /></View></View>; })}</View> : null}<View accessible accessibilityRole="image" accessibilityLabel={`Progreso por semana: ${weekProgress.join(', ') || 'sin sesiones'}%`} style={styles.chart}>{weekProgress.map((value, index) => <View key={index} style={styles.barSlot}><View style={[styles.bar, { height: `${Math.max(value, 8)}%`, backgroundColor: value === 100 ? theme.secondary : theme.primary }]} /><Text style={[styles.barLabel, { color: theme.textMuted }]}>S{index + 1}</Text></View>)}</View></> : null}
  </GlassCard>;
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) { return <View style={styles.metric}><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  card: { marginBottom: 4 }, openArea: { gap: 0 }, header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, titleWrap: { flex: 1, gap: 4 }, title: { fontSize: 20, fontWeight: '900' }, goal: { fontSize: 13, lineHeight: 18 }, status: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }, statusText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: .3 }, badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 }, badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11, fontWeight: '800' }, metrics: { flexDirection: 'row', gap: 8, marginTop: 16 }, metric: { flex: 1, gap: 2 }, metricValue: { fontSize: 17, fontWeight: '900' }, metricLabel: { color: '#9CA3AF', fontSize: 10, fontWeight: '700' }, progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }, progressLabel: { fontSize: 12, fontWeight: '700' }, progressValue: { fontSize: 12, fontWeight: '900' }, track: { height: 8, borderRadius: 99, overflow: 'hidden', marginTop: 7 }, smallTrack: { height: 6, borderRadius: 99, overflow: 'hidden', marginTop: 5 }, fill: { height: '100%', borderRadius: 99 }, cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, borderTopWidth: 1, marginTop: 14, paddingTop: 12 }, iconAction: { width: 40, height: 36, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, detailDivider: { height: 1, marginTop: 14 }, muscles: { gap: 9, marginTop: 16 }, muscle: { gap: 1 }, muscleLabel: { fontSize: 12, fontWeight: '800' }, chart: { height: 48, flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 14 }, barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', gap: 3 }, bar: { width: '100%', maxWidth: 22, minHeight: 3, borderRadius: 99 }, barLabel: { fontSize: 9, fontWeight: '700' },
});
