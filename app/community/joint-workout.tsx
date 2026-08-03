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
import { Routine } from '../../types';
import { deriveMesocycleDayGuidance } from '../../utils/mesocycles';

export default function JointWorkoutScreen() {
  const { theme } = useTheme(); const { routines, mesocycles } = useData(); const { realtimeRevision } = useSocial();
  const [workouts, setWorkouts] = useState<JointWorkout[]>([]); const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => setWorkouts(await listJointWorkouts()), []);
  useFocusEffect(useCallback(() => { void load().catch((error) => Alert.alert('Entrenamiento conjunto no disponible', error instanceof Error ? error.message : 'Intentá nuevamente.')); }, [load]));
  useEffect(() => { if (realtimeRevision) void load(); }, [load, realtimeRevision]);
  const begin = async (session: JointWorkout, selected: Routine) => { setBusy(session.id); try { await respondToJointInvite(session.id, true, selected); await load(); router.replace({ pathname: '/routine/execute/[id]', params: { id: selected.id, jointWorkoutId: session.id } }); } catch (error) { Alert.alert('No se pudo aceptar', error instanceof Error ? error.message : 'Intentá nuevamente.'); } finally { setBusy(null); } };
  const plannedRoutine = (today = new Date()) => {
    const active = mesocycles.find((cycle) => cycle.status === 'active');
    if (!active) return undefined;
    const guidance = deriveMesocycleDayGuidance(active, today);
    return guidance?.state === 'routine' ? routines.find((routine) => routine.id === guidance.ref.routineId) : undefined;
  };
  const reject = async (session: JointWorkout) => { setBusy(session.id); try { await respondToJointInvite(session.id, false); await load(); } catch (error) { Alert.alert('No se pudo rechazar', error instanceof Error ? error.message : 'Intentá nuevamente.'); } finally { setBusy(null); } };
  return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} /><ScrollView contentContainerStyle={styles.scroll}><Text style={[styles.title, { color: theme.text }]}>Entrenamientos conjuntos</Text><Text style={{ color: theme.textMuted }}>Las invitaciones nacen únicamente durante una rutina activa.</Text>
    {workouts.length ? workouts.map((session) => { const mine = session.participants.find((participant) => participant.isSelf); const partner = session.participants.find((participant) => !participant.isSelf); const planned = plannedRoutine(); return <GlassCard key={session.id} style={styles.session}><Text style={[styles.alias, { color: theme.text }]}>Entrenamiento conjunto</Text><Text style={{ color: theme.textMuted }}>{partner?.alias ?? 'Tu conexión'} · {mine?.status ?? 'activo'}</Text>{mine?.status === 'invited' ? <><Text style={{ color: theme.textMuted }}>{planned ? `Tu mesociclo planificó ${planned.name} para hoy.` : 'Elegí una rutina propia para iniciar tu ejecución real.'}</Text>{planned ? <GlassButton title={`Usar plan de hoy: ${planned.name}`} loading={busy === session.id} disabled={busy !== null} onPress={() => void begin(session, planned)} /> : null}{routines.filter((routine) => routine.id !== planned?.id).map((routine) => <GlassButton key={routine.id} title={`Elegir otra rutina propia: ${routine.name}`} variant="secondary" disabled={busy !== null} onPress={() => void begin(session, routine)} />)}{!routines.length ? <Text style={{ color: theme.textMuted }}>No tenés rutinas propias disponibles.</Text> : null}<GlassButton title="Rechazar" variant="secondary" disabled={busy !== null} onPress={() => void reject(session)} /></> : <GlassButton title="Ver estado del grupo" variant="secondary" onPress={() => router.push({ pathname: '/community/joint/[id]', params: { id: session.id } })} />}</GlassCard>; }) : <GlassCard><Text style={{ color: theme.textMuted }}>No hay invitaciones o sesiones conjuntas activas.</Text></GlassCard>}</ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 12, paddingBottom: 36 }, title: { fontSize: 28, fontWeight: '900' }, alias: { fontSize: 17, fontWeight: '800' }, session: { gap: 10 } });
