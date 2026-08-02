import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { GlassButton } from '../../../components/UI';
import { ProfileAvatar } from '../../../components/ProfileAvatar';
import { useTheme } from '../../../context/ThemeContext';
import { getJointWorkoutDetail, listJointWorkouts, JointWorkout, touchJointWorkoutPresence } from '../../../services/jointWorkouts';

export default function JointWorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { theme } = useTheme(); const [workout, setWorkout] = useState<JointWorkout | null>(null); const [tab, setTab] = useState(0);
  const load = useCallback(async () => { const live = (await listJointWorkouts()).find((item) => item.id === id); if (live) await touchJointWorkoutPresence(id); setWorkout(live ?? await getJointWorkoutDetail(id)); }, [id]);
  useFocusEffect(useCallback(() => { void load().catch((error) => Alert.alert('Sesión no disponible', error instanceof Error ? error.message : 'Intentá nuevamente.')); }, [load]));
  useEffect(() => { const timer = setInterval(() => void load(), 15_000); return () => clearInterval(timer); }, [load]);
  const participant = workout?.participants[tab]; const isLive = !!workout && !workout.completedAt;
  return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} /><ScrollView contentContainerStyle={styles.scroll}>{!workout ? <Text style={{ color: theme.textMuted }}>Cargando sesión...</Text> : <><Text style={[styles.title, { color: theme.text }]}>{workout.suggestedRoutine.name}</Text><Text style={{ color: theme.textMuted }}>{isLive ? 'Sesión conjunta en vivo: finalizá desde tu ejecución de rutina.' : 'Entrenamiento conjunto completado'}</Text><View accessibilityRole="tablist" style={styles.tabs}>{workout.participants.map((item, index) => <GlassButton key={item.id} title={item.alias} variant="secondary" onPress={() => setTab(index)} />)}</View>{participant ? <GlassCard style={styles.card}><View style={styles.identity}><ProfileAvatar avatarId={participant.avatarId} borderColor={theme.primary} /><View><Text style={[styles.name, { color: theme.text }]}>{participant.alias}</Text><Text style={{ color: theme.textMuted }}>{participant.status}</Text></View></View>{participant.workout ? <><Text style={[styles.section, { color: theme.text }]}>Entrenamiento realizado · {Math.round(participant.workout.durationSeconds / 60)} min</Text>{participant.workout.exercises.map((exercise, index) => <Text key={`${exercise.name}-${index}`} style={{ color: theme.textMuted }}>{index + 1}. {exercise.name} · {exercise.sets.length} series</Text>)}</> : <Text style={{ color: theme.textMuted }}>Esta persona mantiene su entrenamiento privado.</Text>}{participant.canInviteBro ? <GlassButton title="Invitar como Bro" variant="secondary" onPress={() => router.push({ pathname: '/social/[uid]', params: { uid: participant.id } })} /> : null}</GlassCard> : null}</>}</ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 12, paddingBottom: 36 }, title: { fontSize: 28, fontWeight: '900' }, tabs: { gap: 8 }, card: { gap: 10 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 10 }, name: { fontSize: 18, fontWeight: '900' }, section: { fontSize: 17, fontWeight: '800' } });
