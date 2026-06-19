import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { HapticPressable } from '../../components/HapticPressable';
import { SelectablePulse } from '../../components/SelectablePulse';
import { LogoutButton } from '../../components/LogoutButton';
import { SimpleLineChart } from '../../components/LineChart';
import { Exercise } from '../../types';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import {
  getCompletedWorkoutsCount,
  getExerciseProgress,
  getMonthlyTonnage,
  getUniqueExerciseNames,
  getWeeklyMinutes,
  getWeeklyTonnage,
  getWeeklyWorkoutsCount,
} from '../../utils/analytics';

interface ExerciseOption {
  key: string;
  catalogExerciseId?: string;
  name: string;
  label: string;
}

export default function ProgressScreen() {
  const { theme } = useTheme();
  const { exercises, sessions } = useData();
  const exerciseOptions = useMemo(
    () => buildExerciseOptions(exercises, sessions),
    [exercises, sessions],
  );
  const [selectedExercise, setSelectedExercise] = useState('');

  useEffect(() => {
    if (exerciseOptions.length > 0 && !exerciseOptions.some((option) => option.key === selectedExercise)) {
      setSelectedExercise(exerciseOptions[0].key);
    }
  }, [exerciseOptions, selectedExercise]);

  const selectedExerciseOption = exerciseOptions.find((option) => option.key === selectedExercise);

  const weeklyMinutes = getWeeklyMinutes(sessions);
  const weeklyTonnage = getWeeklyTonnage(sessions);
  const monthlyTonnage = getMonthlyTonnage(sessions);
  const weeklyWorkouts = getWeeklyWorkoutsCount(sessions);
  const totalWorkouts = getCompletedWorkoutsCount(sessions);

  const progressData = selectedExerciseOption
    ? getExerciseProgress(sessions, {
        catalogExerciseId: selectedExerciseOption.catalogExerciseId,
        name: selectedExerciseOption.name,
      })
    : [];

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <AppScreenHeader
            title="Mi Progreso"
            subtitle="Analíticas de rutinas completadas"
            trailing={<LogoutButton />}
          />

          <View style={styles.statsGrid}>
            <GlassCard style={styles.statCard}>
              <Text style={[styles.statValue, { color: theme.primary }]}>
                {Math.round(weeklyMinutes)}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>
                min esta semana
              </Text>
            </GlassCard>
            <GlassCard style={styles.statCard}>
              <Text style={[styles.statValue, { color: theme.accent }]}>
                {weeklyWorkouts}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>
                rutinas semana
              </Text>
            </GlassCard>
            <GlassCard style={styles.statCard}>
              <Text style={[styles.statValue, { color: theme.primary }]}>
                {(weeklyTonnage / 1000).toFixed(1)}k
              </Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>
                kg tonelaje sem.
              </Text>
            </GlassCard>
            <GlassCard style={styles.statCard}>
              <Text style={[styles.statValue, { color: theme.secondary }]}>
                {(monthlyTonnage / 1000).toFixed(1)}k
              </Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>
                kg tonelaje mes
              </Text>
            </GlassCard>
          </View>

          <GlassCard style={styles.chartCard}>
            <Text style={[styles.chartTitle, { color: theme.text }]}>
              Total rutinas: {totalWorkouts}
            </Text>
             {exerciseOptions.length === 0 ? (
              <Text style={[styles.empty, { color: theme.textMuted }]}>
                Completa rutinas para ver gráficos de progreso
              </Text>
            ) : (
              <>
                <Text style={[styles.pickerLabel, { color: theme.textMuted }]}>
                  Ejercicio
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
                   {exerciseOptions.map((option) => {
                     const isSelected = selectedExercise === option.key;
                     return (
                        <SelectablePulse
                         key={option.key}
                         selected={isSelected}
                         theme={theme}
                         borderRadius={20}
                        style={styles.chipPulse}
                      >
                        <HapticPressable
                           onPress={() => setSelectedExercise(option.key)}
                           style={[
                             styles.chip,
                             {
                              backgroundColor: isSelected ? theme.primary : theme.glass,
                              borderColor: theme.glassBorder,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: theme.text,
                              fontWeight: isSelected ? '700' : '400',
                              fontSize: 13,
                            }}
                          >
                            {option.label}
                          </Text>
                        </HapticPressable>
                      </SelectablePulse>
                    );
                  })}
                </ScrollView>

                <SimpleLineChart
                  data={progressData}
                  dataKey="maxWeight"
                  label="Peso máximo por sesión (kg)"
                />
                <View style={styles.chartSpacer} />
                <SimpleLineChart
                  data={progressData}
                  dataKey="totalReps"
                  label="Repeticiones totales por sesión"
                />
              </>
            )}
          </GlassCard>

          {sessions.length > 0 && (
            <GlassCard>
              <Text style={[styles.recentTitle, { color: theme.text }]}>Recientes</Text>
              {sessions.slice(0, 5).map((s) => (
                <View key={s.id} style={[styles.recentRow, { borderColor: theme.glassBorder }]}>
                  <Text style={{ color: theme.text, fontWeight: '600' }}>{s.routineName}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    {new Date(s.completedAt).toLocaleDateString('es')} ·{' '}
                    {Math.round(s.durationSeconds / 60)} min
                  </Text>
                </View>
              ))}
            </GlassCard>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemeBackground>
  );
}

function buildExerciseOptions(exercises: Exercise[], sessions: Parameters<typeof getUniqueExerciseNames>[0]): ExerciseOption[] {
  const sessionExerciseIds = new Set<string>();
  const sessionExerciseNames = new Set<string>();

  for (const session of sessions) {
    for (const exercise of session.exercises) {
      if (exercise.catalogExerciseId) {
        sessionExerciseIds.add(exercise.catalogExerciseId);
      } else {
        sessionExerciseNames.add(exercise.name.toLowerCase());
      }
    }
  }

  const catalogOptions = exercises
    .filter(
      (exercise) =>
        sessionExerciseIds.has(exercise.id) || sessionExerciseNames.has(exercise.name.toLowerCase()),
    )
    .map((exercise) => ({
      key: `catalog:${exercise.id}`,
      catalogExerciseId: exercise.id,
      name: exercise.name,
      label: exercise.name,
    }));

  const catalogNames = new Set(exercises.map((exercise) => exercise.name.toLowerCase()));
  const legacyOptions = getUniqueExerciseNames(sessions)
    .filter((name) => !catalogNames.has(name.toLowerCase()))
    .map((name) => ({
      key: `legacy:${name}`,
      name,
      label: `${name} · legado`,
    }));

  return [...catalogOptions, ...legacyOptions];
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 20, paddingTop: 12, paddingBottom: 40 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  chartCard: {
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  pickerLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  chips: {
    marginBottom: 16,
  },
  chipPulse: {
    marginRight: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chartSpacer: {
    height: 20,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: 24,
  },
  recentTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  recentRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
});
