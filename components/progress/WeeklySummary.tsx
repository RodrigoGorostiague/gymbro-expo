import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { GlassCard } from '../GlassCard';
import { selectWeeklyProgress } from '../../utils/weeklyProgress';
import { WeeklyDensity } from './WeeklyDensity';
import { WeeklyEffort } from './WeeklyEffort';
import { muscleGroupLabel } from '../../utils/catalogMuscleGroups';

export function WeeklySummary() {
  const { attempts, mesocycles = [], catalogMuscleGroups = [] } = useData();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []));
  if (!user) return null;
  const summary = selectWeeklyProgress(attempts, user, mesocycles, now);
  const range = (week: typeof summary.current) => `${week.start.toLocaleDateString('es')}–${new Date(week.end.getTime() - 1).toLocaleDateString('es')}`;
  const muscles = Object.keys({ ...summary.current.statistics.muscles, ...summary.previous.statistics.muscles }).sort();
  const volume = (week: typeof summary.current, id: string) => Object.entries(week.muscleVolumes)
    .filter(([, values]) => values[id])
    .map(([unit, values]) => `${values[id].weightedVolume.toFixed(1)} ${unit}·rep`).join(' · ') || 'sin carga comparable';
  return <GlassCard>
    <View style={styles.content}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Resumen semanal</Text>
      <Text style={{ color: theme.textMuted }}>Lunes a domingo · hora local del dispositivo. Actual parcial frente a anterior completa; sin porcentaje de cambio.</Text>
      <WeeklyDensity current={summary.current.densitySetsPerHour} previous={summary.previous.densitySetsPerHour} theme={theme} />
      <WeeklyEffort current={summary.current.actualEffort} previous={summary.previous.actualEffort} theme={theme} />
      {([['current', 'Semana actual en curso'], ['previous', 'Semana anterior completa']] as const).map(([key, title]) => {
        const week = summary[key];
        return <View key={key} style={styles.content}>
          <Text style={[styles.subtitle, { color: theme.text }]}>{title} · {range(week)}</Text>
          <Text style={{ color: theme.text }}>Sesiones completadas: {week.sessions} · Series efectivas: {week.statistics.effectiveSets} · Frecuencia: {week.frequency} días</Text>
          <Text style={{ color: theme.text }}>Duración registrada: {week.durationSeconds === null ? 'no disponible' : `${(week.durationSeconds / 60).toLocaleString('es', { maximumFractionDigits: 1 })} min`}</Text>
          <Text style={{ color: theme.text }}>Ejercicios omitidos: {week.omittedExercises === null ? 'no disponible' : week.omittedExercises}</Text>
          <Text style={{ color: theme.textMuted }}>{week.planning ? `Plan vigente de esa semana: ${week.planning.completed} completadas de ${week.planning.planned} programadas` : 'Planificación no disponible'}</Text>
        </View>;
      })}
      <Text style={{ color: theme.textMuted }}>Duración guardada, incluidas sesiones parciales. Omitidos: ejercicios del registro histórico sin ninguna serie válida realizada, incluido el calentamiento; un ejercicio parcial no es omitido. Sin duración o prescripción histórica completa, el total no está disponible.</Text>
      <Text style={{ color: theme.textMuted }}>Solo registros sincronizados. Series efectivas según el registro, no según RIR medido. La frecuencia cuenta días con series efectivas.</Text>
      <Text style={[styles.subtitle, { color: theme.text }]}>Volumen muscular ponderado · actual / anterior</Text>
      {muscles.length === 0 ? <Text style={{ color: theme.textMuted }}>Sin datos musculares registrados</Text> : muscles.map((id) => <Text key={id} style={{ color: theme.text }}>{muscleGroupLabel(catalogMuscleGroups, id)}: {volume(summary.current, id)} / {volume(summary.previous, id)}</Text>)}
      <Text style={{ color: theme.textMuted }}>Solo carga externa con atribución histórica. Unidades separadas; los datos ausentes no equivalen a cero. El volumen ponderado no mide crecimiento muscular.</Text>
    </View>
  </GlassCard>;
}
const styles = StyleSheet.create({ content: { gap: 8 }, title: { fontSize: 20, fontWeight: '800' }, subtitle: { fontSize: 15, fontWeight: '700' } });
