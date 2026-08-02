import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Href, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { HapticPressable } from '../../../components/HapticPressable';
import { GlassButton } from '../../../components/UI';
import { useData } from '../../../context/DataContext';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../context/ThemeContext';
import { MesocycleEntry, PlannedSession, PlannedSessionRef } from '../../../types';
import { buildMesocycleDraft, deriveMesocycleAdherence, deriveMesocycleDayGuidance, deriveMesocycleScheduleProjection, MesocycleScheduleProjectionEntry } from '../../../utils/mesocycles';
import { matchesActiveWorkout } from '../../../utils/activeWorkoutReentry';

const recoveryCopy: Record<NonNullable<MesocycleScheduleProjectionEntry['scheduleState']>, string> = {
  upcoming: 'Recuperación programada próximamente.',
  today: 'Hoy es un día de recuperación.',
  past: 'Este día de recuperación ya pasó.',
};
const isRest = (entry: MesocycleEntry): entry is Extract<MesocycleEntry, { kind: 'rest' }> => 'kind' in entry && entry.kind === 'rest';
const findRoutineEntry = (entries: readonly MesocycleEntry[], entryId: string): PlannedSession | undefined => entries.find((candidate): candidate is PlannedSession => candidate.id === entryId && !isRest(candidate));

export default function MesocycleSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { attempts, getMesocycle, routines, resolvePlannedRoutine, activeWorkoutDraft } = useData();
  const { user } = useAuth();
  const { theme } = useTheme();
  const mesocycle = getMesocycle(id);
  if (!mesocycle) return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} /><GlassCard><Text style={[styles.title, { color: theme.text }]}>No encontramos este mesociclo</Text><GlassButton title="Volver a mesociclos" onPress={() => router.replace('/(tabs)/mesocycles')} /></GlassCard></SafeAreaView></ThemeBackground>;

  const draft = buildMesocycleDraft(mesocycle);
  const adherence = deriveMesocycleAdherence(draft, attempts);
  const schedule = deriveMesocycleScheduleProjection(draft, routines ?? [], attempts);
  const today = deriveMesocycleDayGuidance(draft);
  const canExecute = draft.status === 'active';
  const execute = (weekNumber: number, entryId: string, routineId: string) => router.push({ pathname: '/routine/execute/[id]', params: { id: routineId, mesocycleId: draft.id, weekNumber: String(weekNumber), plannedSessionId: entryId } } satisfies Href);
  const share = () => router.push({ pathname: '/community/share-plan', params: { kind: 'mesocycle', id: draft.id, name: draft.name } } satisfies Href);
  const canContinue = (weekNumber: number, entryId: string, routineId: string) => matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId, lineage: { mesocycleId: draft.id, weekNumber, plannedSessionId: entryId } });

  return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} trailing={<HapticPressable accessibilityRole="button" accessibilityLabel={`Compartir ${draft.name}`} accessibilityHint="Abre la lista de personas de tu círculo para enviar este mesociclo." onPress={share}><Text style={{ color: theme.primary, fontWeight: '800' }}>Compartir</Text></HapticPressable>} /><ScrollView contentContainerStyle={styles.scroll}>
    <Text style={[styles.title, { color: theme.text }]}>{draft.name}</Text><Text style={[styles.subtitle, { color: theme.textMuted }]}>Resumen del mesociclo</Text>
    <GlassCard style={styles.card}><Text style={[styles.heading, { color: theme.text }]}>Vista general</Text><Text style={{ color: theme.textMuted }}>Progreso: {adherence.completedSessions}/{adherence.plannedSessions} sesiones completadas</Text><GlassButton title="Editar mesociclo" onPress={() => router.push(`/mesocycle/${id}`)} /></GlassCard>
    {today ? <GlassCard style={styles.card}><Text style={[styles.heading, { color: theme.text }]}>Guía de hoy</Text>{today.state === 'pre-start' ? <Text style={{ color: theme.textMuted }}>El plan todavía no comenzó.</Text> : null}{today.state === 'unplanned' ? <Text style={{ color: theme.textMuted }}>Hoy no hay una entrada planificada.</Text> : null}{today.state === 'completed' ? <Text style={{ color: theme.textMuted }}>El plan ya terminó.</Text> : null}{today.state === 'rest' ? <Text style={{ color: theme.textMuted }}>Hoy toca descanso.</Text> : null}{today.state === 'routine' ? <Text style={{ color: theme.textMuted }}>Hoy: {today.ref.routineName}</Text> : null}</GlassCard> : null}
    {draft.weeks.map((week) => <GlassCard key={week.id} style={styles.card}><Text style={[styles.heading, { color: theme.text }]}>Semana {week.weekNumber}</Text>{schedule.filter((entry) => entry.weekNumber === week.weekNumber).length === 0 ? <Text style={{ color: theme.textMuted }}>Todavía no hay entradas planificadas en esta semana.</Text> : schedule.filter((entry) => entry.weekNumber === week.weekNumber).map((entry) => entry.kind === 'rest' ? <RestCard key={entry.entryId} entry={entry} theme={theme} /> : <RoutineCard key={entry.entryId} entry={entry} routineRef={findRoutineEntry(week.entries, entry.entryId)?.ref ?? { routineId: '', routineName: 'Rutina', source: 'local' }} resolvePlannedRoutine={resolvePlannedRoutine} onExecute={execute} canExecute={canExecute} mesocycleStatus={draft.status} continueActiveWorkout={canContinue(entry.weekNumber, entry.entryId, findRoutineEntry(week.entries, entry.entryId)?.ref.routineId ?? '')} theme={theme} />)}</GlassCard>)}
  </ScrollView></SafeAreaView></ThemeBackground>;
}

function RestCard({ entry, theme }: { entry: Extract<MesocycleScheduleProjectionEntry, { kind: 'rest' }>; theme: { secondary: string; text: string; textMuted: string; glass: string; glassBorder: string } }) {
  const date = entry.dateLabel;
  return <View style={[styles.restCard, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}><Ionicons name="moon-outline" size={20} color={theme.secondary} /><View style={styles.cardContent}>{date ? <Text style={[styles.dateLabel, { color: theme.secondary }]}>{date.weekday} · {date.date}</Text> : null}<Text style={[styles.restTitle, { color: theme.text }]}>Día de descanso</Text><Text style={{ color: theme.textMuted }}>{entry.scheduleState ? recoveryCopy[entry.scheduleState] : 'Recuperación programada.'}</Text><Text style={{ color: theme.textMuted }}>Descanso planificado</Text></View></View>;
}

function RoutineCard({ entry, routineRef, resolvePlannedRoutine, onExecute, canExecute, mesocycleStatus, continueActiveWorkout, theme }: { entry: Extract<MesocycleScheduleProjectionEntry, { kind: 'routine' }>; routineRef: PlannedSessionRef; resolvePlannedRoutine: (ref: PlannedSessionRef) => { id: string } | undefined; onExecute: (weekNumber: number, entryId: string, routineId: string) => void; canExecute: boolean; mesocycleStatus: 'draft' | 'active' | 'completed' | 'archived'; continueActiveWorkout: boolean; theme: { primary: string; secondary: string; text: string; textMuted: string; onPrimary: string; glass: string; glassBorder: string } }) {
  const routine = entry.routine.available ? resolvePlannedRoutine(routineRef) : undefined;
  const percent = entry.progress.plannedSets ? Math.round((entry.progress.validSets / entry.progress.plannedSets) * 100) : 0;
  const executionMessage = mesocycleStatus === 'draft' ? 'Este plan debe activarse antes de entrenar.' : 'Este mesociclo ya no acepta sesiones programadas.';
  return <View style={[styles.routineCard, { borderColor: theme.glassBorder }]}><View style={styles.routineHeader}><View style={styles.cardContent}><Text style={[styles.routineTitle, { color: theme.text }]}>{routineRef.routineName}</Text>{entry.dateLabel ? <Text style={[styles.dateLabel, { color: theme.primary }]}>{entry.dateLabel.weekday} · {entry.dateLabel.date}</Text> : null}</View>{routine && canExecute && !entry.progress.fullyCompleted ? <PlayAction routineName={routineRef.routineName} continueActiveWorkout={continueActiveWorkout} onPress={() => onExecute(entry.weekNumber, entry.entryId, routine.id)} theme={theme} /> : null}</View>{routine ? <><Text style={{ color: theme.textMuted }}>{entry.routine.muscleGroups.join(' · ')} · {entry.routine.exerciseCount} ejercicios</Text><Text style={{ color: theme.textMuted }}>Ejercicios: {entry.progress.completedExercises}/{entry.progress.plannedExercises}</Text><Text style={{ color: theme.textMuted }}>Series válidas: {entry.progress.validSets}/{entry.progress.plannedSets}</Text><View style={[styles.progressTrack, { backgroundColor: theme.glassBorder }]}><View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: entry.progress.fullyCompleted ? theme.secondary : theme.primary }]} /></View>{entry.progress.fullyCompleted ? <Text style={{ color: theme.secondary }}>Sesión completada</Text> : !canExecute ? <Text style={{ color: theme.textMuted }}>{executionMessage}</Text> : null}</> : <Text style={{ color: '#F5B041' }}>Rutina no disponible</Text>}</View>;
}

function PlayAction({ routineName, continueActiveWorkout, onPress, theme }: { routineName: string; continueActiveWorkout: boolean; onPress: () => void; theme: { primary: string; onPrimary: string } }) { const action = continueActiveWorkout ? 'Continuar' : 'Ejecutar'; return <HapticPressable style={[styles.playAction, { backgroundColor: theme.primary }]} accessibilityRole="button" accessibilityLabel={`${action} ${routineName}`} accessibilityHint={continueActiveWorkout ? 'Reanuda el entrenamiento activo de esta sesión.' : 'Abre la rutina programada para esta sesión.'} onPress={onPress}><Ionicons name="play" size={18} color={theme.onPrimary} /></HapticPressable>; }

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20, paddingTop: 8 }, scroll: { paddingBottom: 40 }, title: { fontSize: 26, fontWeight: '900' }, subtitle: { marginBottom: 16 }, card: { marginBottom: 14 }, heading: { fontSize: 18, fontWeight: '800', marginBottom: 8 }, routineCard: { gap: 6, padding: 12, borderWidth: 1, borderRadius: 12, marginTop: 10 }, routineHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, cardContent: { flex: 1, gap: 3 }, routineTitle: { fontSize: 16, fontWeight: '800' }, restCard: { flexDirection: 'row', gap: 10, padding: 12, borderWidth: 1, borderRadius: 12, alignItems: 'center', marginTop: 10 }, restTitle: { fontSize: 16, fontWeight: '800' }, dateLabel: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' }, progressTrack: { height: 7, borderRadius: 99, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 99 }, playAction: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
