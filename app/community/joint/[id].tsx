import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../../components/AppNavBar';
import { ThemeBackground } from '../../../components/GlassCard';
import { GlassButton } from '../../../components/UI';
import { useTheme } from '../../../context/ThemeContext';
import { defaultJointParticipantId, directPartnerRecipient, getJointWorkoutDetail, listJointWorkouts, JointWorkout, touchJointWorkoutPresence } from '../../../services/jointWorkouts';
import { useAuth } from '../../../context/AuthContext';
import { useData } from '../../../context/DataContext';
import { recapImportPlan } from '../../../services/workoutRecapFeed';
import { WorkoutRecapPresentation, WorkoutRecapPresentationModel } from '../../../components/WorkoutRecapPresentation';
import { ChatFab } from '../../../components/ChatFab';
import { JointParticipantProfileCard } from '../../../components/JointParticipantProfileCard';

export default function JointWorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { theme } = useTheme(); const { user } = useAuth(); const { importCatalogContent } = useData(); const [workout, setWorkout] = useState<JointWorkout | null>(null); const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null); const [saving, setSaving] = useState<'routine' | 'mesocycle' | null>(null);
  const load = useCallback(async () => { const live = (await listJointWorkouts()).find((item) => item.id === id); if (live) await touchJointWorkoutPresence(id); setWorkout(live ?? await getJointWorkoutDetail(id)); }, [id]);
  useFocusEffect(useCallback(() => { void load().catch((error) => Alert.alert('Sesión no disponible', error instanceof Error ? error.message : 'Intentá nuevamente.')); }, [load]));
  useEffect(() => { const timer = setInterval(() => void load(), 15_000); return () => clearInterval(timer); }, [load]);
  useEffect(() => {
    if (!workout) return;
    setSelectedParticipantId((current) => current && workout.participants.some((participant) => participant.id === current) ? current : defaultJointParticipantId(workout));
  }, [workout]);
  const participant = workout?.participants.find((item) => item.id === selectedParticipantId); const isLive = !!workout && !workout.completedAt;
  const save = async (kind: 'routine' | 'mesocycle') => { if (!participant?.sharePayload || !user) return; setSaving(kind); try { await importCatalogContent(recapImportPlan(`${workout!.id}:${participant.id}`, user, participant.sharePayload, kind === 'mesocycle')); } catch (error) { Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Intentá nuevamente.'); } finally { setSaving(null); } };
  const participantRecap: WorkoutRecapPresentationModel | null = participant?.status === 'completed' && participant.workout ? { routineName: participant.workout.routineName, durationSeconds: participant.workout.durationSeconds, exerciseCount: participant.workout.exercises.length, metrics: { volume: participant.workout.exercises.reduce((total, exercise) => total + exercise.sets.reduce((sets, set) => sets + (set.completed ? set.weight * set.reps : 0), 0), 0) }, exercises: participant.workout.exercises, sharePayload: participant.sharePayload } : null;
  const partnerRecipientId = directPartnerRecipient(workout);
  return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} /><ScrollView contentContainerStyle={styles.scroll}>{!workout ? <Text style={{ color: theme.textMuted }}>Cargando sesión...</Text> : <><Text style={[styles.title, { color: theme.text }]}>Entrenamiento conjunto</Text><Text style={{ color: theme.textMuted }}>{isLive ? 'Sesión conjunta en vivo: finalizá desde tu ejecución de rutina.' : 'Entrenamiento conjunto completado'}</Text><View accessibilityRole="radiogroup" style={styles.participants}>{workout.participants.map((item) => { const selected = item.id === selectedParticipantId; return <JointParticipantProfileCard key={item.id} participant={item} selected={selected} onPress={() => setSelectedParticipantId(item.id)}>{selected ? !participantRecap ? <><Text style={{ color: theme.textMuted }}>Estado: {item.status}</Text>{item.canInviteBro ? <GlassButton title="Invitar como Bro" variant="secondary" onPress={() => router.push({ pathname: '/social/[uid]', params: { uid: item.id } })} /> : null}</> : <WorkoutRecapPresentation recap={participantRecap} copyState={saving} onCopyRoutine={item.sharePayload?.routine ? () => void save('routine') : undefined} onCopyMesocycle={item.sharePayload?.mesocycle ? () => void save('mesocycle') : undefined} /> : null}</JointParticipantProfileCard>; })}</View>{isLive && partnerRecipientId ? <ChatFab recipientId={partnerRecipientId} /> : null}</>}</ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 12, paddingBottom: 36 }, title: { fontSize: 28, fontWeight: '900' }, participants: { gap: 8 }, section: { fontSize: 17, fontWeight: '800' } });
