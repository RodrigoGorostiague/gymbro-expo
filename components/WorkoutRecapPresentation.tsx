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
  copiedLabel?: string | null;
  onCopyRoutine?: () => void;
  onCopyMesocycle?: () => void;
  onViewMesocycle?: () => void;
};

/** Shared, reduced recap body. It deliberately accepts only the sanitized presentation model. */
export function WorkoutRecapPresentation({ recap, copyState = null, copiedLabel, onCopyRoutine, onCopyMesocycle, onViewMesocycle }: Props) {
  const { theme } = useTheme();
  const { catalogMuscleGroups = [] } = useData();
  const payload = recap.sharePayload;
  const canCopyRoutine = !!payload?.routine && !!onCopyRoutine;
  const canCopyMesocycle = !!payload?.mesocycle && !!onCopyMesocycle;
  const completedSets = recap.exercises.reduce((total, exercise) => total + exercise.sets.filter((set) => set.completed).length, 0);
  return <>
    <Text style={[styles.title, { color: theme.text }]}>{recap.routineName}</Text>
    <Text style={{ color: theme.textMuted }}>{Math.round(recap.durationSeconds / 60)} min · {recap.exerciseCount} ejercicios</Text>
    <GlassCard style={styles.hero}><View><Text style={[styles.metricValue, { color: theme.text }]}>{Math.round(recap.metrics.volume ?? 0)} kg</Text><Text style={{ color: theme.textMuted }}>volumen total</Text></View><View><Text style={[styles.metricValue, { color: theme.text }]}>{completedSets}</Text><Text style={{ color: theme.textMuted }}>series completadas</Text></View></GlassCard>
    {recap.caption ? <Text style={[styles.caption, { color: theme.text }]}>{recap.caption}</Text> : null}
    <Text style={[styles.section, { color: theme.text }]}>Entrenamiento realizado</Text>
    {recap.exercises.map((exercise, index) => <GlassCard key={`${exercise.name}-${index}`} style={styles.card}><Text style={[styles.exerciseName, { color: theme.text }]}>{exercise.name}</Text>{exercise.muscleGroupIds.length ? <Text style={{ color: theme.textMuted }}>{muscleGroupLabels(catalogMuscleGroups, exercise.muscleGroupIds).join(' · ')}</Text> : null}<View style={styles.sets}>{exercise.sets.map((set, setIndex) => <View key={setIndex} style={[styles.set, { borderColor: set.completed ? theme.primary : theme.glassBorder }]}><Text style={{ color: theme.textMuted }}>Serie {setIndex + 1}</Text><Text style={[styles.setValue, { color: theme.text }]}>{set.weight} kg × {set.reps}</Text><Text style={{ color: set.completed ? theme.primary : theme.textMuted }}>{set.completed ? 'Hecha' : 'Sin completar'}</Text></View>)}</View></GlassCard>)}
    {payload?.routine && !payload.mesocycle ? <GlassCard style={styles.card}><Text style={[styles.section, { color: theme.text }]}>Rutina base</Text>{payload.routine.exercises.map((exercise, index) => <Text key={`${exercise.name}-${index}`} style={{ color: theme.textMuted }}>{index + 1}. {exercise.name}</Text>)}</GlassCard> : null}
    {payload?.mesocycle ? <GlassCard style={styles.card}><Text style={[styles.section, { color: theme.text }]}>Mesociclo</Text><Text style={[styles.exerciseName, { color: theme.text }]}>{payload.mesocycle.name}</Text><Text style={{ color: theme.textMuted }}>{payload.mesocycle.goal || 'Sin objetivo'} · {payload.mesocycle.durationWeeks} semanas</Text>{payload.mesocycle.weeks.map((week, index) => <Text key={index} style={{ color: theme.textMuted }}>Semana {index + 1}: {week.map((entry) => entry === null ? 'Descanso' : payload.mesocycle!.routines[entry.routineIndex]?.name ?? 'Rutina').join(' · ')}</Text>)}{onViewMesocycle ? <GlassButton title="Ver mesociclo" variant="secondary" onPress={onViewMesocycle} /> : null}</GlassCard> : null}
    {canCopyRoutine ? <GlassButton title={copiedLabel ?? 'Guardar rutina'} loading={copyState === 'routine'} disabled={!!copyState || !!copiedLabel} onPress={onCopyRoutine} /> : null}
    {canCopyMesocycle ? <GlassButton title="Guardar mesociclo" variant="secondary" loading={copyState === 'mesocycle'} disabled={!!copyState || !!copiedLabel} onPress={onCopyMesocycle} /> : null}
  </>;
}

const styles = StyleSheet.create({ title: { fontSize: 28, fontWeight: '900', marginBottom: 4 }, hero: { flexDirection: 'row', justifyContent: 'space-between', gap: 20 }, metricValue: { fontSize: 26, fontWeight: '900' }, card: { gap: 8 }, section: { fontSize: 18, fontWeight: '900' }, exerciseName: { fontSize: 17, fontWeight: '800' }, caption: { marginTop: 10 }, sets: { gap: 6 }, set: { borderWidth: 1, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, setValue: { fontWeight: '900' } });
