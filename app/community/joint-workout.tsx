import { useLatestRequest } from '../../hooks/useLatestRequest';
import { publishWorkoutStartActivity } from '../../services/workoutStartActivity';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton } from '../../components/UI';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useSocial } from '../../context/SocialContext';
import { useTheme } from '../../context/ThemeContext';
import { listJointWorkouts, respondToJointInvite, JointWorkout } from '../../services/jointWorkouts';

export default function JointWorkoutScreen() {
  const { theme } = useTheme(); const { activeWorkoutDraft, associateActiveWorkoutJoint } = useData(); const { realtimeRevision } = useSocial();
  const { user } = useAuth();
  const reads = useLatestRequest(user);
  useEffect(() => { setWorkouts([]); setBusy(null); }, [user]);
  const [workouts, setWorkouts] = useState<JointWorkout[]>([]); const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => { const current = reads.begin(); const next = await listJointWorkouts(); if (current()) setWorkouts(next); }, [user, reads]);
  useFocusEffect(useCallback(() => { void load().catch((error) => Alert.alert('Entrenamiento conjunto no disponible', error instanceof Error ? error.message : 'Intentá nuevamente.')); }, [load]));
  useEffect(() => { if (realtimeRevision) void load().catch(() => undefined); }, [load, realtimeRevision]);
  const begin = async (session: JointWorkout) => { if (!activeWorkoutDraft) { Alert.alert('Entrenamiento activo requerido', 'Iniciá tu rutina y aceptá esta invitación desde el aviso para unirte sin cambiar de rutina.'); return; } setBusy(session.id); try { if (!user || activeWorkoutDraft.pendingFinalization || activeWorkoutDraft.jointCancellationPending) throw new Error('El entrenamiento está finalizando.'); await publishWorkoutStartActivity(activeWorkoutDraft.routineSnapshot?.name ?? '', activeWorkoutDraft.jointWorkoutId, activeWorkoutDraft.attemptId); await respondToJointInvite(session.id, true); await associateActiveWorkoutJoint(user, activeWorkoutDraft.attemptId, session.id); await load(); router.replace({ pathname: '/routine/execute/[id]', params: { id: activeWorkoutDraft.routineId, jointWorkoutId: session.id, ...(activeWorkoutDraft.lineage ? { mesocycleId: activeWorkoutDraft.lineage.mesocycleId, weekNumber: String(activeWorkoutDraft.lineage.weekNumber), plannedSessionId: activeWorkoutDraft.lineage.plannedSessionId } : {}) } }); } catch (error) { Alert.alert('No se pudo aceptar', error instanceof Error ? error.message : 'Intentá nuevamente.'); } finally { setBusy(null); } };
  const reject = async (session: JointWorkout) => { setBusy(session.id); try { await respondToJointInvite(session.id, false); await load(); } catch (error) { Alert.alert('No se pudo rechazar', error instanceof Error ? error.message : 'Intentá nuevamente.'); } finally { setBusy(null); } };
  return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} /><ScrollView contentContainerStyle={styles.scroll}><Text style={[styles.title, { color: theme.text }]}>Entrenamientos conjuntos</Text><Text style={{ color: theme.textMuted }}>Las invitaciones nacen únicamente durante una rutina activa.</Text>
    {workouts.length ? workouts.map((session) => { const mine = session.participants.find((participant) => participant.isSelf); const partner = session.participants.find((participant) => !participant.isSelf); return <GlassCard key={session.id} style={styles.session}><Text style={[styles.alias, { color: theme.text }]}>Entrenamiento conjunto</Text><Text style={{ color: theme.textMuted }}>{partner?.alias ?? 'Tu conexión'} · {mine?.status ?? 'activo'}</Text>{mine?.status === 'invited' ? <><Text style={{ color: theme.textMuted }}>Aceptá desde tu entrenamiento activo para unirte al grupo con tu rutina actual.</Text><GlassButton title="Aceptar con mi entrenamiento activo" loading={busy === session.id} disabled={busy !== null || !activeWorkoutDraft} onPress={() => void begin(session)} /><GlassButton title="Rechazar" variant="secondary" disabled={busy !== null} onPress={() => void reject(session)} /></> : <GlassButton title="Ver estado del grupo" variant="secondary" onPress={() => router.push({ pathname: '/community/joint/[id]', params: { id: session.id } })} />}</GlassCard>; }) : <GlassCard><Text style={{ color: theme.textMuted }}>No hay invitaciones o sesiones conjuntas activas.</Text></GlassCard>}</ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 12, paddingBottom: 36 }, title: { fontSize: 28, fontWeight: '900' }, alias: { fontSize: 17, fontWeight: '800' }, session: { gap: 10 } });
