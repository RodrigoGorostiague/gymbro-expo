import React, { useState } from 'react';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeBackground } from '../../components/GlassCard';
import { GlassButton } from '../../components/UI';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import MesocyclesScreen from './mesocycles';
import RoutinesScreen from './routines';
import { TrainView, TrainViewSwitcher } from '../../components/TrainViewSwitcher';

export default function TrainEntryScreen() {
  const { routines, dataState, dataError, retryData } = useData();
  const { theme } = useTheme();
  const [selectedView, setSelectedView] = useState<TrainView | null>(null);

  if (dataState === 'error') return <ThemeBackground><SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}><Text accessibilityRole="alert" style={{ color: theme.textMuted, textAlign: 'center' }}>{dataError ?? 'No se pudieron cargar tus entrenamientos.'}</Text><GlassButton title="Reintentar" variant="secondary" onPress={retryData} /></SafeAreaView></ThemeBackground>;

  if (dataState === 'ready') {
    const view = selectedView ?? (routines.length ? 'mesocycles' : 'routines');
    const navigation = <TrainViewSwitcher value={view} onChange={setSelectedView} />;
    return view === 'mesocycles'
      ? <MesocyclesScreen navigation={navigation} />
      : <RoutinesScreen navigation={navigation} />;
  }

  return <ThemeBackground><SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text accessibilityLabel="Preparando entrenamiento" style={{ color: theme.textMuted }}>Preparando entrenamiento...</Text></SafeAreaView></ThemeBackground>;
}
