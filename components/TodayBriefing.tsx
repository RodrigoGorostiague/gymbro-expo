import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { Mesocycle, Routine, WorkoutAttempt } from '../types';
import { deriveMesocycleDayGuidance } from '../utils/mesocycles';
import { GlassButton } from './UI';
export function TodayBriefing({ mesocycle, routines, attempts, active, onRoutines }: {
    mesocycle?: Mesocycle;
    routines: Routine[];
    attempts: WorkoutAttempt[];
    active: boolean;
    onRoutines: () => void;
}) {
    const { theme } = useTheme();
    const day = mesocycle ? deriveMesocycleDayGuidance(mesocycle) : null;
    const recorded = day?.state === 'routine' && attempts.some((attempt) => attempt.lineage?.mesocycleId === mesocycle?.id && attempt.lineage?.plannedSessionId === day.entryId);
    const title = active ? 'Retoma donde lo dejaste.' : recorded ? 'Tu sesión de hoy, registrada.' : day?.state === 'rest' ? 'Hoy toca recuperar.' : day?.state === 'routine' ? day.ref.routineName : routines.length ? 'Tu próxima serie empieza aquí.' : 'Tu primera sesión empieza aquí.';
    return <LinearGradient colors={[`${theme.primary}24`, `${theme.secondary}12`]} style={[styles.hero, { borderColor: theme.glassBorder }]}>
    <Text style={[styles.eyebrow, { color: theme.primary }]}>HOY · {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })}</Text>
    <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{title}</Text>
    <Text style={[styles.body, { color: theme.textMuted }]}>{active ? 'Tu progreso sigue disponible en el entrenamiento en curso.' : day?.state === 'rest' ? 'El descanso también forma parte de tu plan. Puedes revisar las próximas sesiones.' : mesocycle ? `${mesocycle.name} · Consulta tu calendario antes de empezar.` : 'Elige una rutina o crea la tuya. No necesitas un bloque para entrenar.'}</Text>
    {!active ? <View style={styles.actions}>{mesocycle ? <GlassButton title={day?.state === 'routine' && !recorded ? 'Preparar sesión de hoy' : 'Ver mi calendario'} onPress={() => router.push(`/mesocycle/summary/${mesocycle.id}`)}/> : routines.length === 1 ? <GlassButton title={`Preparar ${routines[0].name}`} onPress={() => router.push(`/routine/execute/${routines[0].id}`)}/> : <GlassButton title={routines.length ? 'Elegir rutina' : 'Crear mi primera rutina'} onPress={() => routines.length ? onRoutines() : router.push('/routine/create')}/>}</View> : null}
  </LinearGradient>;
}
const styles = StyleSheet.create({ hero: { padding: 20, borderRadius: 28, borderWidth: 1, marginBottom: 16, gap: 10 }, eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1 }, title: { fontSize: 27, fontWeight: '900', letterSpacing: -0.6 }, body: { fontSize: 14, lineHeight: 20 }, actions: { marginTop: 6 } });
