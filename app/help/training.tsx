import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton } from '../../components/UI';
import { TrainingHelp, TrainingHelpTopic } from '../../components/TrainingHelp';
import { useTheme } from '../../context/ThemeContext';
import { useFunctionalGuidance } from '../../context/FunctionalGuidanceContext';
import { openGuidanceAction } from '../../components/FunctionalGuidanceCard';

export default function TrainingHelpScreen() {
  const { theme } = useTheme();
  const guide = useFunctionalGuidance();
  return <ThemeBackground><SafeAreaView style={{ flex: 1 }}>
    <AppNavBar onBack={() => router.back()} />
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 28, fontWeight: '800' }}>Cómo usar GymBro</Text>
      <Text style={{ color: theme.textMuted }}>Consulta lo que necesites. La ayuda es opcional y puedes volver cuando quieras.</Text>
      {(['routines', 'sets', 'workout', 'results', 'mesocycles'] as TrainingHelpTopic[]).map(topic => <GlassCard key={topic} blur={false}><TrainingHelp topic={topic} /></GlassCard>)}
      <View style={{ gap: 12 }}>
        <GlassButton title={guide.progress.reviewed ? 'Ver progreso' : guide.active ? 'Continuar guía' : 'Volver a mostrar la guía'} disabled={!guide.ready || guide.progress.next.type === 'blocked'}
          onPress={() => { const action = guide.nextAction(); if (action.type === 'blocked') return; guide.accept(); if (guide.active || guide.progress.reviewed) openGuidanceAction(action); else router.push('/(tabs)/train'); }} />
        {guide.progress.next.type === 'blocked' && <Text style={{ color: theme.textMuted }}>La guía estará disponible cuando tu biblioteca esté lista y no haya un entrenamiento por recuperar. Puedes consultar todos los temas ahora.</Text>}
        {guide.error && <Text accessibilityRole="alert" style={{ color: theme.textMuted }}>{guide.error}</Text>}
      </View>
    </ScrollView>
  </SafeAreaView></ThemeBackground>;
}
