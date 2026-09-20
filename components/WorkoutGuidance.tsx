import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useFunctionalGuidance } from '../context/FunctionalGuidanceContext';
import { useTheme } from '../context/ThemeContext';
import { GlassButton } from './UI';
import { TrainingHelp } from './TrainingHelp';

export function WorkoutGuidance({ phase, hasSavedSet = false }: { phase: 'setup' | 'active'; hasSavedSet?: boolean }) {
  const guide = useFunctionalGuidance();
  const { theme } = useTheme();
  const dismissed = guide.preferences.dismissedTopicIds.includes('first-set');
  useEffect(() => { if (guide.active && phase === 'active' && hasSavedSet && !dismissed) guide.dismissTopic('first-set', false); }, [guide.active, phase, hasSavedSet, dismissed, guide.dismissTopic]);
  return <View style={{ gap: 8 }}>
    {guide.active && phase === 'setup' && <Text style={{ color: theme.textMuted }}>La rutina es tu plan. Aquí guardarás las series que realmente hagas. Iniciar entrenamiento comienza la sesión. No hace falta completar la guía para entrenar.</Text>}
    {guide.active && phase === 'active' && !hasSavedSet && !dismissed && <>
      <Text accessibilityRole="header" style={{ color: theme.text, fontWeight: '800' }}>Registra lo realizado</Text>
      <Text style={{ color: theme.textMuted }}>Revisa la carga y las repeticiones o duración antes de marcar la serie como hecha.</Text>
      <GlassButton title="Ocultar ayuda de la primera serie" variant="secondary" onPress={() => guide.dismissTopic('first-set')} />
    </>}
    <TrainingHelp topic={phase === 'setup' ? 'workout' : 'sets'} />
  </View>;
}
export function ResultGuidance({ sessionId }: { sessionId: string }) {
  const guide = useFunctionalGuidance();
  const { theme } = useTheme();
  useEffect(() => { if (guide.ready && guide.active) guide.reviewResult(sessionId); }, [sessionId, guide.ready, guide.active, guide.reviewResult]);
  return <View style={{ gap: 10 }}>
    <Text style={{ color: theme.textMuted }}>Estos son tus datos registrados, no una copia del plan. Puedes corregirlos con “Corregir datos de esta sesión”.</Text>
    <GlassButton title="Ver progreso" variant="secondary" onPress={() => router.push('/(tabs)/progress')} />
    <TrainingHelp topic="results" />
  </View>;
}
