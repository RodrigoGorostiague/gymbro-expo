import { PendingWorkoutReviews } from '../../components/PendingWorkoutReviews';
import { TodayBriefing } from '../../components/TodayBriefing';
import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeBackground } from '../../components/GlassCard';
import { GlassButton } from '../../components/UI';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import MesocyclesScreen from './mesocycles';
import RoutinesScreen from './routines';
import { TrainView, TrainViewSwitcher } from '../../components/TrainViewSwitcher';
import { ActiveWorkoutCard } from '../../components/ActiveWorkoutCard';
import { hasActiveWorkoutReentryIntegrity } from '../../utils/activeWorkoutReentry';

export default function TrainEntryScreen() {
  const { offlineWorkoutEnabled, offlineWorkoutError, retryOfflineWorkout, routines, attempts = [], mesocycles = [], dataState, dataError, retryData, activeWorkoutDraft, cancelActiveWorkout } = useData();
  const { theme } = useTheme();
  const [selectedView, setSelectedView] = useState<TrainView | null>(null);

  if (offlineWorkoutEnabled && !activeWorkoutDraft) return <ThemeBackground><SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
    <Text style={{ color: theme.text }}>Cancelación guardada en este dispositivo. Sincroniza antes de iniciar otro entrenamiento.</Text>
    {offlineWorkoutError ? <Text accessibilityRole="alert" style={{ color: theme.textMuted }}>{offlineWorkoutError}</Text> : null}
    <GlassButton title="Reintentar sincronización" onPress={() => { void retryOfflineWorkout().catch(() => undefined); }} />
  </SafeAreaView></ThemeBackground>;

  if (offlineWorkoutEnabled && activeWorkoutDraft && dataState !== 'ready') {
    const draft = activeWorkoutDraft;
    return <ThemeBackground><SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ color: theme.text }}>Tu entrenamiento está guardado en este dispositivo. La biblioteca necesita conexión.</Text>
      <GlassButton title="Continuar entrenamiento guardado" onPress={() => router.push({ pathname: '/routine/execute/[id]', params: { id: draft.routineId, ...(draft.lineage ? { mesocycleId: draft.lineage.mesocycleId, weekNumber: String(draft.lineage.weekNumber), plannedSessionId: draft.lineage.plannedSessionId } : {}) } })} />
      <GlassButton title="Reintentar conexión" variant="secondary" onPress={retryData} />
    </SafeAreaView></ThemeBackground>;
  }

  if (dataState === 'error') return <ThemeBackground><SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}><Text accessibilityRole="alert" style={{ color: theme.textMuted, textAlign: 'center' }}>{dataError ?? 'No se pudieron cargar tus entrenamientos.'}</Text><GlassButton title="Reintentar" variant="secondary" onPress={retryData} /></SafeAreaView></ThemeBackground>;

  if (dataState === 'ready') {
    const resumableDraft = offlineWorkoutEnabled || hasActiveWorkoutReentryIntegrity(activeWorkoutDraft, routines, mesocycles)
      ? activeWorkoutDraft
      : null;
    const activeMesocycle = mesocycles.find((mesocycle) => mesocycle.status === 'active');
    const view = selectedView ?? (activeMesocycle ? 'mesocycles' : 'routines');
    const continueActiveWorkout = () => {
      if (!resumableDraft) return;
      const params: Record<string, string> = { id: resumableDraft.routineId };
      if (resumableDraft.jointWorkoutId) params.jointWorkoutId = resumableDraft.jointWorkoutId;
      if (resumableDraft.lineage) {
        params.mesocycleId = resumableDraft.lineage.mesocycleId;
        params.weekNumber = String(resumableDraft.lineage.weekNumber);
        params.plannedSessionId = resumableDraft.lineage.plannedSessionId;
      }
      router.push({ pathname: '/routine/execute/[id]', params });
    };
    const navigation = <>
      <PendingWorkoutReviews />
      <TodayBriefing mesocycle={activeMesocycle} routines={routines} attempts={attempts} active={!!resumableDraft} onRoutines={() => setSelectedView('routines')} />
      {resumableDraft ? <ActiveWorkoutCard draft={resumableDraft} onContinue={continueActiveWorkout} onCancel={() => Alert.alert('Cancelar entrenamiento', 'Se perderá el progreso de la sesión en curso.', [
        { text: 'Volver', style: 'cancel' },
        { text: 'Cancelar entrenamiento', style: 'destructive', onPress: () => void cancelActiveWorkout().catch((error) => Alert.alert('No se pudo cancelar el entrenamiento', error instanceof Error ? error.message : 'Inténtalo nuevamente.')) },
      ])} /> : null}
      <TrainViewSwitcher value={view} onChange={setSelectedView} />
    </>;
    return view === 'mesocycles'
      ? <MesocyclesScreen navigation={navigation} />
      : <RoutinesScreen navigation={navigation} />;
  }

  return <ThemeBackground><SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text accessibilityLabel="Preparando entrenamiento" style={{ color: theme.textMuted }}>Preparando entrenamiento...</Text></SafeAreaView></ThemeBackground>;
}
