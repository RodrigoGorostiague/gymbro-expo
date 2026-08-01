import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { useData } from '../../../context/DataContext';
import { useSocial } from '../../../context/SocialContext';
import { useTheme } from '../../../context/ThemeContext';
import { WorkoutRecapDetail } from '../../../types';
import { muscleGroupLabels } from '../../../utils/catalogMuscleGroups';

export default function WorkoutRecapDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getWorkoutRecapDetail } = useSocial();
  const { catalogMuscleGroups = [] } = useData();
  const { theme } = useTheme();
  const [recap, setRecap] = useState<WorkoutRecapDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getWorkoutRecapDetail(id).then(setRecap).catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'No se pudo cargar el resumen.');
    });
  }, [getWorkoutRecapDetail, id]);

  return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} />
    <ScrollView contentContainerStyle={styles.scroll}>
      {error ? <Text style={{ color: theme.text }}>{error}</Text> : null}
      {!error && !recap ? <Text style={{ color: theme.textMuted }}>Cargando resumen...</Text> : null}
      {recap ? <><Text style={[styles.title, { color: theme.text }]}>{recap.routineName}</Text>
        <Text style={{ color: theme.textMuted }}>{recap.authorAlias} · {Math.round(recap.durationSeconds / 60)} min</Text>
        {recap.exercises.length ? recap.exercises.map((exercise, index) => <GlassCard key={`${exercise.name}-${index}`} style={styles.card}>
          <Text style={[styles.exerciseName, { color: theme.text }]}>{exercise.name}</Text>
          {exercise.muscleGroupIds.length ? <Text style={{ color: theme.textMuted }}>{muscleGroupLabels(catalogMuscleGroups, exercise.muscleGroupIds).join(' · ')}</Text> : null}
        </GlassCard>) : <Text style={{ color: theme.textMuted }}>Este resumen anterior no incluye ejercicios.</Text>}</> : null}
    </ScrollView>
  </SafeAreaView></ThemeBackground>;
}

const styles = StyleSheet.create({ safe: { flex: 1, paddingHorizontal: 20 }, scroll: { paddingBottom: 36 }, title: { fontSize: 28, fontWeight: '900', marginBottom: 4 }, card: { marginTop: 14 }, exerciseName: { fontSize: 17, fontWeight: '800', marginBottom: 4 } });
