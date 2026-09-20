import { ResultGuidance } from '../../../components/WorkoutGuidance';
import { SessionBodyMap } from '../../../components/TrainingBodyMap';
import { useAuth } from '../../../context/AuthContext';
import { selectPersonalLoadRecords, selectPersonalRepRecords, selectPersonalVolumeRecords } from '../../../utils/personalRecords';
import { getRecordGemRewards, RecordGemReward } from '../../../services/recordRewards';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '../../../context/DataContext';
import { useTheme } from '../../../context/ThemeContext';
import { ThemeBackground, GlassCard } from '../../../components/GlassCard';
import { GlassButton } from '../../../components/UI';
import { AppNavBar } from '../../../components/AppNavBar';
import { WorkoutVictory } from '../../../components/WorkoutVictory';
import { HapticPressable } from '../../../components/HapticPressable';
export default function PersonalWorkoutRecapScreen() {
    const { id } = useLocalSearchParams<{
        id: string;
    }>();
    const { sessions, attempts = [], isLoading, dataState, hydratedUserId } = useData();
    const { user } = useAuth();
    const records = dataState === 'ready' && hydratedUserId === user
      ? selectPersonalLoadRecords(attempts, user, id) : [];
    const repRecords = dataState === 'ready' && hydratedUserId === user
      ? selectPersonalRepRecords(attempts, user, id) : [];
    const volumeRecords = dataState === 'ready' && hydratedUserId === user
      ? selectPersonalVolumeRecords(attempts, user, id) : [];
    const [awards, setAwards] = useState<{ owner: string; id: string; values: RecordGemReward[] | null } | null>(null);
    const canQueryAwards = Boolean(user) && dataState === 'ready' && hydratedUserId === user;
    useEffect(() => {
      let active = true;
      setAwards(null);
      if (!user || dataState !== 'ready' || hydratedUserId !== user) return;
      void getRecordGemRewards(id).then((values) => {
        if (active) setAwards({ owner: user, id, values });
      }).catch(() => { if (active) setAwards({ owner: user, id, values: null }); });
      return () => { active = false; };
    }, [user, id, dataState, hydratedUserId]);
    const confirmedAwards = awards?.owner === user && awards.id === id ? awards : null;
    const awardExercises = canQueryAwards
      ? attempts.find((attempt) => attempt.id === id && attempt.owner === user)?.exercises : undefined;
    const awardExerciseName = (award: RecordGemReward) => awardExercises?.find((exercise) =>
      exercise.exerciseId === award.exerciseId && exercise.variant === award.variant
    )?.recordedName.trim() || 'Ejercicio';
    const { theme } = useTheme();
    const session = canQueryAwards ? sessions.find((candidate) => candidate.id === id) : undefined;
    const [expanded, setExpanded] = useState<string | null>(null);
    return <ThemeBackground><SafeAreaView style={styles.safe}>
    <AppNavBar onBack={() => router.back()} backLabel="Volver"/>
    <ScrollView contentContainerStyle={styles.content}>
      {!session ? <Text accessibilityRole="alert" style={{ color: theme.text }}>{isLoading || dataState === 'loading' ? 'Cargando tu entrenamiento…' : !canQueryAwards ? 'Tu historial confirmado no está disponible. Vuelve a Entrenar para reintentar la conexión.' : 'Esta sesión no está disponible en tu historial.'}</Text> : <>
        <WorkoutVictory session={session}/>
        <SessionBodyMap session={session} owner={user} />
        <ResultGuidance sessionId={session.id} />
        {records.length ? <GlassCard blur={false}>
          <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>Mejor carga a iguales repeticiones</Text>
          <Text style={{ color: theme.textMuted }}>Comparación con tu historial anterior confirmado de la misma variante. Los registros sin variante no se incluyen. Esta comparación recalculada no confirma un premio.</Text>
          {records.map((record) => <View key={record.key} style={{ gap: 4, paddingTop: 12 }}>
            <Text style={{ color: theme.text }}>{record.name} · {record.variant} · Carga externa · {record.reps} reps</Text>
            <Text style={{ color: theme.success }}>Anterior: {record.previousLoad} {record.unit} · Ahora: {record.load} {record.unit}</Text>
          </View>)}
        </GlassCard> : null}
        {repRecords.length ? <GlassCard blur={false}>
          <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>Más repeticiones con la misma carga</Text>
          <Text style={{ color: theme.textMuted }}>Comparación con tu historial anterior confirmado de la misma variante y carga exacta. Los registros sin variante no se incluyen. Esta comparación recalculada no confirma un premio.</Text>
          {repRecords.map((record) => <View key={record.key} style={{ gap: 4, paddingTop: 12 }}>
            <Text style={{ color: theme.text }}>{record.name} · {record.variant} · Carga externa · {record.load} {record.unit}</Text>
            <Text style={{ color: theme.success }}>Anterior: {record.previousReps} reps · Ahora: {record.reps} reps</Text>
          </View>)}
        </GlassCard> : null}
        {volumeRecords.length ? <GlassCard blur={false}>
          <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>Mayor volumen por ejercicio</Text>
          <Text style={{ color: theme.textMuted }}>Suma de carga externa por repeticiones realizadas, en tu historial comparable. No incluye calentamientos ni variantes desconocidas.</Text>
          {volumeRecords.map((record) => <View key={record.key} style={{ gap: 4, paddingTop: 12 }}>
            <Text style={{ color: theme.text }}>{record.name} · {record.variant}</Text>
            <Text style={{ color: theme.success }}>Anterior: {record.previousVolume} {record.unit}·reps · Ahora: {record.volume} {record.unit}·reps</Text>
          </View>)}
        </GlassCard> : null}
        <GlassCard blur={false}>
          <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>Premios confirmados por récords</Text>
          <Text style={{ color: theme.textMuted }}>25 gemas por tipo, ejercicio, variante y unidad en esta sesión; hasta 75 por grupo. Los premios históricos no cambian al corregir datos.</Text>
          {!canQueryAwards ? <Text style={{ color: theme.textMuted }}>Los premios no están disponibles mientras no se pueda consultar tu historial confirmado.</Text>
            : !confirmedAwards ? <Text style={{ color: theme.textMuted }}>Consultando premios…</Text>
            : confirmedAwards.values === null ? <Text style={{ color: theme.textMuted }}>No se pudieron consultar los premios. La comparación no confirma gemas acreditadas.</Text>
            : confirmedAwards.values.length === 0 ? <Text style={{ color: theme.textMuted }}>Sin premios por récords acreditados en esta sesión.</Text>
            : confirmedAwards.values.map((award) => <Text key={JSON.stringify(award)} style={{ color: theme.success }}>
              {award.recordType === 'load' ? 'Carga' : award.recordType === 'reps' ? 'Repeticiones' : 'Volumen'} · {awardExerciseName(award)} · {award.variant} · {award.unit}: +{award.amount} gemas acreditadas
            </Text>)}
        </GlassCard>
        <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header">Tu trabajo, serie por serie</Text>
        <Text style={{ color: theme.textMuted }}>Esta vista consulta tu historial personal. La publicación en GymBro depende de tus preferencias de privacidad.</Text>
        {session.exercises.map((exercise, index) => <GlassCard key={exercise.exerciseId} blur={false}>
          <HapticPressable accessibilityLabel={`${exercise.name}, ver series`} accessibilityState={{ expanded: expanded === exercise.exerciseId }} onPress={() => setExpanded(expanded === exercise.exerciseId ? null : exercise.exerciseId)} style={styles.row}>
            <View style={styles.flex}><Text style={[styles.heading, { color: theme.text }]}>{String(index + 1).padStart(2, '0')} · {exercise.name}</Text><Text style={{ color: theme.textMuted }}>{exercise.sets.filter((set) => set.completed).length}/{exercise.sets.length} series realizadas</Text></View><Text style={{ color: theme.primary }}>{expanded === exercise.exerciseId ? '−' : '+'}</Text>
          </HapticPressable>
          {expanded === exercise.exerciseId ? exercise.sets.map((set, setIndex) => <View key={set.setId} style={[styles.row, { borderTopColor: theme.glassBorder, borderTopWidth: 1 }]}><Text style={{ color: theme.text }}>Serie {setIndex + 1} · {set.durationSeconds !== undefined ? `${set.durationSeconds} s` : `${set.reps} reps`}</Text><Text style={{ color: set.completed ? theme.success : theme.textMuted }}>{set.completed ? 'Realizada' : 'No realizada'}</Text></View>) : null}
        </GlassCard>)}
        <GlassButton title="Corregir datos de esta sesión" variant="secondary" onPress={() => router.push(`/session/${session.id}`)}/>
      </>}
      <GlassButton title="Volver a entrenar" onPress={() => router.replace('/(tabs)/train')}/>
    </ScrollView>
  </SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1, paddingHorizontal: 16 }, content: { gap: 16, paddingBottom: 32 }, heading: { fontSize: 19, fontWeight: '800' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 16, minHeight: 48 }, flex: { flex: 1, gap: 8 } });
