import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WorkoutRecapExercise, WorkoutRecapSharePayload } from '../types';
import { GlassCard } from './GlassCard';
import { GlassButton } from './UI';
import { useTheme } from '../context/ThemeContext';
import { useData } from '../context/DataContext';
import { muscleGroupLabels } from '../utils/catalogMuscleGroups';

export type WorkoutRecapPresentationModel = {
  routineName: string;
  durationSeconds: number;
  exerciseCount: number;
  metrics: Readonly<Record<string, number>>;
  exercises: readonly WorkoutRecapExercise[];
  caption?: string | null;
  sharePayload?: WorkoutRecapSharePayload | null;
};

type Props = {
  recap: WorkoutRecapPresentationModel;
  copyState?: 'routine' | 'mesocycle' | null;
  copiedKinds?: readonly ('routine' | 'mesocycle')[];
  onCopyRoutine?: () => void;
  onCopyMesocycle?: () => void;
  onViewMesocycle?: () => void;
};

/** Shared, reduced recap body. It deliberately accepts only the sanitized presentation model. */
export function WorkoutRecapPresentation({ recap, copyState = null, copiedKinds = [], onCopyRoutine, onCopyMesocycle, onViewMesocycle }: Props) {
  const { theme } = useTheme();
  const { catalogMuscleGroups = [] } = useData();
  const payload = recap.sharePayload;
  const canCopyRoutine = !!payload?.routine && !!onCopyRoutine;
  const canCopyMesocycle = !!payload?.mesocycle && !!onCopyMesocycle;
  const volume = recap.metrics.volume;
  return <>
    <Text style={[styles.title, { color: theme.text }]}>{recap.routineName}</Text>
    <View style={styles.summary}>
      <DetailFact value={`${Math.round(recap.durationSeconds / 60)} min`} label="duración" color={theme.text} />
      <DetailFact value={String(recap.exerciseCount)} label={recap.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'} color={theme.text} />
      {typeof volume === 'number' ? <DetailFact value={`${Math.round(volume)} kg`} label="volumen" color={theme.text} /> : null}
    </View>
    {recap.caption ? <Text style={[styles.caption, { color: theme.text }]}>{recap.caption}</Text> : null}
    <GlassCard style={styles.card}><Text style={[styles.section, { color: theme.text }]}>Estructura de la rutina</Text>{recap.exercises.map((exercise, index) => <View key={`${exercise.name}-${index}`} style={styles.structureRow}><Text style={[styles.exerciseName, { color: theme.text }]}>{index + 1}. {exercise.name}</Text>{exercise.muscleGroupIds.length ? <Text style={{ color: theme.textMuted }}>{muscleGroupLabels(catalogMuscleGroups, exercise.muscleGroupIds).join(' · ')}</Text> : null}</View>)}</GlassCard>
    {recap.exercises.length ? <GlassCard style={styles.card}><Text style={[styles.section, { color: theme.text }]}>Resultados reales</Text><Text style={{ color: theme.textMuted }}>Carga y repeticiones registradas durante la sesión</Text>{recap.exercises.map((exercise, exerciseIndex) => <View key={`${exercise.name}-${exerciseIndex}`} style={[styles.performedExercise, { borderColor: theme.glassBorder }]}><Text style={[styles.exerciseName, { color: theme.text }]}>{exerciseIndex + 1}. {exercise.name}</Text><View style={styles.sets}>{exercise.sets.map((set, setIndex) => <View key={setIndex} style={[styles.setRow, { backgroundColor: set.completed ? `${theme.primary}18` : 'transparent', borderColor: set.completed ? theme.primary : theme.glassBorder }]}><Text style={[styles.setNumber, { color: theme.textMuted }]}>S{setIndex + 1}</Text><Text style={[styles.setValue, { color: theme.text }]}>{set.weight} kg × {set.reps}</Text><Text style={[styles.setState, { color: set.completed ? theme.primary : theme.textMuted }]}>{set.completed ? 'Hecha' : 'Pendiente'}</Text></View>)}</View></View>)}</GlassCard> : null}
    {payload?.routine && !payload.mesocycle ? <GlassCard style={styles.card}><Text style={[styles.section, { color: theme.text }]}>Rutina base</Text>{payload.routine.exercises.map((exercise, index) => <Text key={`${exercise.name}-${index}`} style={{ color: theme.textMuted }}>{index + 1}. {exercise.name}</Text>)}</GlassCard> : null}
    {payload?.mesocycle ? <GlassCard style={styles.card}><Text style={[styles.section, { color: theme.text }]}>Mesociclo</Text><Text style={[styles.exerciseName, { color: theme.text }]}>{payload.mesocycle.name}</Text><Text style={{ color: theme.textMuted }}>{payload.mesocycle.goal || 'Sin objetivo'} · {payload.mesocycle.durationWeeks} semanas</Text>{payload.mesocycle.weeks.map((week, index) => <Text key={index} style={{ color: theme.textMuted }}>Semana {index + 1}: {week.map((entry) => entry === null ? 'Descanso' : payload.mesocycle!.routines[entry.routineIndex]?.name ?? 'Rutina').join(' · ')}</Text>)}{onViewMesocycle ? <GlassButton title="Ver mesociclo" variant="secondary" onPress={onViewMesocycle} /> : null}</GlassCard> : null}
    {canCopyRoutine ? <GlassButton title={copiedKinds.includes('routine') ? 'Rutina guardada' : 'Guardar rutina'} loading={copyState === 'routine'} disabled={!!copyState || copiedKinds.includes('routine')} onPress={onCopyRoutine} /> : null}
    {canCopyMesocycle ? <GlassButton title={copiedKinds.includes('mesocycle') ? 'Mesociclo guardado' : 'Guardar mesociclo'} variant="secondary" loading={copyState === 'mesocycle'} disabled={!!copyState || copiedKinds.includes('mesocycle')} onPress={onCopyMesocycle} /> : null}
  </>;
}

function DetailFact({ value, label, color }: { value: string; label: string; color: string }) {
  return <View style={styles.fact}><Text style={[styles.factValue, { color }]}>{value}</Text><Text style={styles.factLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({ title: { fontSize: 28, fontWeight: '900', marginBottom: 4 }, summary: { flexDirection: 'row', gap: 8 }, fact: { flex: 1, gap: 2 }, factValue: { fontSize: 17, fontWeight: '900' }, factLabel: { color: '#9CA3AF', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }, card: { gap: 8 }, section: { fontSize: 18, fontWeight: '900' }, exerciseName: { fontSize: 17, fontWeight: '800' }, caption: { marginTop: 10 }, structureRow: { gap: 2 }, performedExercise: { borderLeftWidth: 2, gap: 8, paddingLeft: 10 }, sets: { gap: 6 }, setRow: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 8 }, setNumber: { fontSize: 12, fontWeight: '900', width: 24 }, setValue: { flex: 1, fontSize: 15, fontWeight: '900' }, setState: { fontSize: 12, fontWeight: '800' } });
