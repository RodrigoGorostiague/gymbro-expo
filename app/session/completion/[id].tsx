import React from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '../../../context/DataContext';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../context/ThemeContext';
import { ThemeBackground } from '../../../components/GlassCard';
import { AppNavBar } from '../../../components/AppNavBar';
import { WorkoutCompletionReview } from '../../../components/WorkoutCompletionReview';
import { attemptToSession } from '../../../utils/workoutAttempts';
export default function ResumeWorkoutCompletion() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { attempts = [], dataState, hydratedUserId } = useData();
  const { user } = useAuth();
  const { theme } = useTheme();
  const attempt = dataState === 'ready' && hydratedUserId === user ? attempts.find((value) => value.id === id && value.owner === user) : undefined;
  return <ThemeBackground calm><SafeAreaView style={{ flex: 1, paddingHorizontal: 16 }}>
    <AppNavBar onBack={() => router.back()} />
    {attempt ? <WorkoutCompletionReview key={`${user}:${id}`} session={attemptToSession(attempt)} onDone={() => router.replace('/(tabs)/train')} /> : <Text style={{ color: theme.textMuted }}>{dataState === 'ready' ? 'Esta sesión no está disponible.' : 'Cargando entrenamiento…'}</Text>}
  </SafeAreaView></ThemeBackground>;
}
