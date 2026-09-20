import React from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useFunctionalGuidance } from '../context/FunctionalGuidanceContext';
import type { GuidanceAction } from '../utils/functionalGuidance';
import { GlassCard } from './GlassCard';
import { GlassButton } from './UI';

export function openGuidanceAction(action: GuidanceAction) {
  switch (action.type) {
    case 'create': router.push('/routine/create'); break;
    case 'select': router.push('/(tabs)/routines'); break;
    case 'edit': router.push(`/routine/${action.id}`); break;
    case 'train': router.push(`/routine/execute/${action.id}`); break;
    case 'recap': router.push(`/session/recap/${action.id}`); break;
    case 'complete': router.push('/(tabs)/progress'); break;
  }
}
export function FunctionalGuidanceCard() {
  const guide = useFunctionalGuidance();
  const { theme } = useTheme();
  if (!guide.progress.visible) return guide.error ? <Text accessibilityRole="alert" style={{ color: theme.textMuted }}>{guide.error}</Text> : null;
  const accepted = guide.preferences.invitation === 'accepted';
  return <GlassCard blur={false} style={{ marginBottom: 16 }}>
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 21, fontWeight: '800' }}>Primer entrenamiento</Text>
      <Text style={{ color: theme.textMuted }}>Prepara una rutina, registra lo que haces y revisa el resultado.</Text>
      {accepted && <>
        <Text style={{ color: theme.text }}>1. Preparar una rutina · {guide.progress.prepared ? 'Listo' : 'Pendiente'}</Text>
        <Text style={{ color: theme.text }}>2. Registrar un entrenamiento · {guide.progress.recorded ? 'Listo' : 'Pendiente'}</Text>
        <Text style={{ color: theme.text }}>3. Revisar el resultado · {guide.progress.reviewed ? 'Listo' : 'Pendiente'}</Text>
        <Text style={{ color: theme.textMuted }}>Puedes entrenar sin crear un mesociclo.</Text>
      </>}
      <GlassButton title={accepted ? 'Continuar guía' : 'Empezar'} disabled={guide.progress.next.type === 'blocked'} onPress={() => { const next = guide.nextAction(); if (next.type !== 'blocked') { guide.accept(); openGuidanceAction(next); } }} />
      <GlassButton title="Ocultar guía" variant="secondary" onPress={guide.dismiss} />
      {guide.error && <Text accessibilityRole="alert" style={{ color: theme.textMuted }}>{guide.error}</Text>}
    </View>
  </GlassCard>;
}
