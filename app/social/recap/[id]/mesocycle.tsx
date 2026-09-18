import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../../../components/GlassCard';
import { GlassButton } from '../../../../components/UI';
import { useAuth } from '../../../../context/AuthContext';
import { useData } from '../../../../context/DataContext';
import { useSocial } from '../../../../context/SocialContext';
import { useTheme } from '../../../../context/ThemeContext';
import { getJointParticipantPublicationDetail } from '../../../../services/jointWorkouts';
import { recapImportPlan } from '../../../../services/workoutRecapFeed';
import { WorkoutRecapDetail } from '../../../../types';

export default function SharedMesocycleDetailScreen() {
  const { id, workoutId, participantId } = useLocalSearchParams<{ id: string; workoutId?: string; participantId?: string }>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { getWorkoutRecapDetail } = useSocial();
  const { importCatalogContent } = useData();
  const [recap, setRecap] = useState<WorkoutRecapDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isJointParticipant = typeof workoutId === 'string' && workoutId.length > 0 && typeof participantId === 'string' && participantId.length > 0;

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        const detail = isJointParticipant
          ? await getJointParticipantPublicationDetail(workoutId!, participantId!)
          : await getWorkoutRecapDetail(id);
        setRecap(detail);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No se pudo cargar el mesociclo.');
      }
    };
    void load();
  }, [getWorkoutRecapDetail, id, isJointParticipant, participantId, workoutId]);

  const mesocycle = recap?.sharePayload?.mesocycle;

  const save = async () => {
    if (!recap?.sharePayload || !user) return;
    setSaving(true);
    setError(null);
    try {
      await importCatalogContent(recapImportPlan(recap.id, user, recap.sharePayload, true));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar el mesociclo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppNavBar onBack={() => router.back()} />
        <ScrollView contentContainerStyle={styles.scroll}>
          {error ? <Text accessibilityRole="alert" style={{ color: theme.text }}>{error}</Text> : null}
          {!recap ? <Text style={{ color: theme.textMuted }}>Cargando mesociclo...</Text> : !mesocycle ? <Text style={{ color: theme.textMuted }}>Esta publicación no incluye un mesociclo compartido.</Text> : (
            <>
              <Text style={[styles.title, { color: theme.text }]}>{mesocycle.name}</Text>
              <Text style={{ color: theme.textMuted }}>{mesocycle.goal || 'Sin objetivo'} · {mesocycle.durationWeeks} semanas</Text>
              {mesocycle.weeks.map((week, weekIndex) => (
                <GlassCard key={weekIndex}>
                  <Text style={[styles.week, { color: theme.text }]}>Semana {weekIndex + 1}</Text>
                  {week.map((entry, dayIndex) => <Text key={dayIndex} style={{ color: theme.textMuted }}>Día {dayIndex + 1}: {entry === null ? 'Descanso' : `${entry.dayLabel ? `${entry.dayLabel} · ` : ''}${mesocycle.routines[entry.routineIndex]?.name ?? 'Rutina'}`}</Text>)}
                </GlassCard>
              ))}
              {!recap.isAuthor && recap.mesocycleAvailable ? <GlassButton title="Guardar mesociclo" loading={saving} disabled={saving} onPress={() => void save()} /> : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, paddingHorizontal: 20 }, scroll: { gap: 12, paddingBottom: 36 }, title: { fontSize: 28, fontWeight: '900' }, week: { fontSize: 18, fontWeight: '900' } });
