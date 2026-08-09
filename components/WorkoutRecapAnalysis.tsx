import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WorkoutRecapDetail, WorkoutRecapExercise } from '../types';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { HapticPressable } from './HapticPressable';
import { muscleGroupLabels } from '../utils/catalogMuscleGroups';

function ExerciseAnalysis({ exercise, index }: { exercise: WorkoutRecapExercise; index: number }) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(index === 0);
  const completed = exercise.sets.filter((set) => set.completed);
  const volume = completed.reduce((total, set) => total + set.weight * set.reps, 0);
  const repetitions = completed.reduce((total, set) => total + set.reps, 0);
  const completion = exercise.sets.length ? Math.round(completed.length / exercise.sets.length * 100) : 0;
  const { catalogMuscleGroups = [] } = useData();
  return <View style={[styles.exercise, { borderColor: theme.glassBorder }]}>
    <HapticPressable accessibilityRole="button" accessibilityLabel={`${exercise.name}, ${completion}% de series completadas`} accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.exerciseHeader}>
      <View style={styles.exerciseCopy}><Text style={[styles.exerciseIndex, { color: theme.primary }]}>{String(index + 1).padStart(2, '0')}</Text><View style={styles.exerciseTitle}><Text style={[styles.exerciseName, { color: theme.text }]}>{exercise.name}</Text>{exercise.muscleGroupIds.length ? <Text style={{ color: theme.textMuted }}>{muscleGroupLabels(catalogMuscleGroups, exercise.muscleGroupIds).join(' · ')}</Text> : null}</View></View>
      <Text style={[styles.completion, { color: completed.length === exercise.sets.length ? theme.success : theme.primary }]}>{completion}%</Text>
    </HapticPressable>
    <View style={[styles.exerciseMetrics, { borderTopColor: theme.glassBorder }]}><AnalysisMetric value={`${completed.length}/${exercise.sets.length}`} label="series" /><AnalysisMetric value={String(repetitions)} label="reps" />{volume ? <AnalysisMetric value={`${Math.round(volume)}`} label="kg" /> : null}</View>
    {expanded ? <View style={styles.sets}>{exercise.sets.map((set, setIndex) => <View key={setIndex} style={[styles.set, { backgroundColor: set.completed ? `${theme.primary}18` : 'transparent', borderColor: set.completed ? theme.primary : theme.glassBorder }]}><Text style={[styles.setLabel, { color: theme.textMuted }]}>SERIE {setIndex + 1}</Text><Text style={[styles.setValue, { color: theme.text }]}>{set.weight} kg × {set.reps}</Text><Text style={[styles.setState, { color: set.completed ? theme.success : theme.textMuted }]}>{set.completed ? 'Hecha' : 'No realizada'}</Text></View>)}</View> : null}
  </View>;
}

function AnalysisMetric({ value, label }: { value: string; label: string }) {
  const { theme } = useTheme();
  return <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text><Text style={[styles.metricLabel, { color: theme.textMuted }]}>{label}</Text></View>;
}

export function WorkoutRecapAnalysis({ recap }: { recap: WorkoutRecapDetail }) {
  const { theme } = useTheme();
  const completedSets = recap.exercises.reduce((total, exercise) => total + exercise.sets.filter((set) => set.completed).length, 0);
  const totalSets = recap.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
  const volume = recap.metrics.volume;
  const previousVolume = recap.previousComparable?.metrics.volume;
  const volumeDelta = typeof volume === 'number' && typeof previousVolume === 'number' ? Math.round(volume - previousVolume) : null;
  return <><View style={styles.overview}><AnalysisMetric value={`${Math.round(recap.durationSeconds / 60)} min`} label="duración" /><AnalysisMetric value={String(recap.exerciseCount)} label="ejercicios" /><AnalysisMetric value={`${completedSets}/${totalSets}`} label="series" />{typeof volume === 'number' ? <AnalysisMetric value={`${Math.round(volume)} kg`} label="volumen" /> : null}</View>{recap.previousComparable ? <View style={[styles.comparison, { borderColor: theme.glassBorder }]}><Text style={[styles.comparisonTitle, { color: theme.text }]}>Vs. último entrenamiento igual</Text><Text style={{ color: theme.textMuted }}>{Math.round(recap.previousComparable.durationSeconds / 60)} min · {recap.previousComparable.exerciseCount} ejercicios{volumeDelta === null ? '' : ` · ${volumeDelta >= 0 ? '+' : ''}${volumeDelta} kg de volumen`}</Text></View> : null}{recap.caption ? <Text style={[styles.caption, { color: theme.text }]}>{recap.caption}</Text> : null}<View style={styles.sectionHeading}><Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>Análisis por ejercicio</Text><Text style={{ color: theme.textMuted }}>Abrí un ejercicio para revisar cada serie.</Text></View>{recap.exercises.map((exercise, index) => <ExerciseAnalysis key={`${exercise.name}-${index}`} exercise={exercise} index={index} />)}</>;
}

const styles = StyleSheet.create({ overview: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, metric: { flexGrow: 1, minWidth: '20%', gap: 2 }, metricValue: { fontSize: 18, fontWeight: '900' }, metricLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }, comparison: { borderLeftWidth: 3, gap: 3, paddingLeft: 11 }, comparisonTitle: { fontSize: 14, fontWeight: '900' }, caption: { fontSize: 15, lineHeight: 22 }, sectionHeading: { gap: 3, marginTop: 8 }, sectionTitle: { fontSize: 21, fontWeight: '900' }, exercise: { borderBottomWidth: StyleSheet.hairlineWidth, gap: 10, paddingVertical: 14 }, exerciseHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, exerciseCopy: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 11 }, exerciseIndex: { fontSize: 12, fontWeight: '900', letterSpacing: 1 }, exerciseTitle: { flex: 1, gap: 2 }, exerciseName: { fontSize: 17, fontWeight: '900' }, completion: { fontSize: 15, fontWeight: '900' }, exerciseMetrics: { flexDirection: 'row', gap: 12, paddingTop: 10 }, sets: { gap: 6 }, set: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 9 }, setLabel: { fontSize: 10, fontWeight: '900', width: 54 }, setValue: { flex: 1, fontSize: 15, fontWeight: '900' }, setState: { fontSize: 11, fontWeight: '800' } });
