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
import { jointRoutineImportPlan, listJointWorkouts, respondToJointInvite, JointRoutine, JointWorkout } from '../../services/jointWorkouts';
import { Routine } from '../../types';

export default function JointWorkoutScreen() {
  const { theme } = useTheme(); const { user } = useAuth(); const { routines, importCatalogContent } = useData(); const { realtimeRevision } = useSocial();
  const [workouts, setWorkouts] = useState<JointWorkout[]>([]); const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => setWorkouts(await listJointWorkouts()), []);
  useFocusEffect(useCallback(() => { void load().catch((error) => Alert.alert('Entrenamiento conjunto no disponible', error instanceof Error ? error.message : 'Intentá nuevamente.')); }, [load]));
  useEffect(() => { if (realtimeRevision) void load(); }, [load, realtimeRevision]);
  const begin = async (session: JointWorkout, selected: Routine | JointRoutine, localRoutineId: string) => { setBusy(session.id); try { await respondToJointInvite(session.id, true, selected); await load(); router.replace({ pathname: '/routine/execute/[id]', params: { id: localRoutineId, jointWorkoutId: session.id } }); } catch (error) { Alert.alert('No se pudo aceptar', error instanceof Error ? error.message : 'Intentá nuevamente.'); } finally { setBusy(null); } };
  const useSuggested = async (session: JointWorkout) => { if (!user) return; const plan = jointRoutineImportPlan(session.id, user, session.suggestedRoutine); try { await importCatalogContent(plan); await begin(session, session.suggestedRoutine, plan.routines[0].id); } catch (error) { Alert.alert('No se pudo preparar la rutina sugerida', error instanceof Error ? error.message : 'Intentá nuevamente.'); } };
  const reject = async (session: JointWorkout) => { setBusy(session.id); try { await respondToJointInvite(session.id, false); await load(); } catch (error) { Alert.alert('No se pudo rechazar', error instanceof Error ? error.message : 'Intentá nuevamente.'); } finally { setBusy(null); } };
  return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} /><ScrollView contentContainerStyle={styles.scroll}><Text style={[styles.title, { color: theme.text }]}>Entrenamientos conjuntos</Text><Text style={{ color: theme.textMuted }}>Las invitaciones nacen únicamente durante una rutina activa.</Text>
    {workouts.length ? workouts.map((session) => { const mine = session.participants.find((participant) => participant.isSelf); const partner = session.participants.find((participant) => !participant.isSelf); return <GlassCard key={session.id} style={styles.session}><Text style={[styles.alias, { color: theme.text }]}>{session.suggestedRoutine.name}</Text><Text style={{ color: theme.textMuted }}>{partner?.alias ?? 'Tu conexión'} · {mine?.status ?? 'activo'}</Text>{mine?.status === 'invited' ? <><Text style={{ color: theme.textMuted }}>Elegí explícitamente una rutina para iniciar tu ejecución real.</Text><GlassButton title={`Usar sugerida: ${session.suggestedRoutine.name}`} loading={busy === session.id} disabled={busy !== null} onPress={() => void useSuggested(session)} />{routines.map((routine) => <GlassButton key={routine.id} title={`Usar mi rutina: ${routine.name}`} variant="secondary" disabled={busy !== null} onPress={() => void begin(session, routine, routine.id)} />)}{!routines.length ? <Text style={{ color: theme.textMuted }}>No tenés rutinas locales. Podés usar la sugerida.</Text> : null}<GlassButton title="Rechazar" variant="secondary" disabled={busy !== null} onPress={() => void reject(session)} /></> : <GlassButton title="Ver estado del grupo" variant="secondary" onPress={() => router.push({ pathname: '/community/joint/[id]', params: { id: session.id } })} />}</GlassCard>; }) : <GlassCard><Text style={{ color: theme.textMuted }}>No hay invitaciones o sesiones conjuntas activas.</Text></GlassCard>}</ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 12, paddingBottom: 36 }, title: { fontSize: 28, fontWeight: '900' }, alias: { fontSize: 17, fontWeight: '800' }, session: { gap: 10 } });
