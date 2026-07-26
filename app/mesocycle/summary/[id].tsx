import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { GlassButton } from '../../../components/UI';
import { useData } from '../../../context/DataContext';
import { useTheme } from '../../../context/ThemeContext';
import { buildMesocycleDraft, countPlannedSessions } from '../../../utils/mesocycles';

const formatStartDate = (value?: string) => (value ? value : 'Sin fecha definida');

export default function MesocycleSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getMesocycle, resolvePlannedRoutine } = useData();
  const { theme } = useTheme();
  const mesocycle = getMesocycle(id);

  if (!mesocycle) {
    return (
      <ThemeBackground>
        <SafeAreaView style={styles.safe}>
          <AppNavBar onBack={() => router.back()} />
          <GlassCard>
            <Text style={[styles.title, { color: theme.text }]}>No encontramos este mesociclo</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>Si llegaste desde un enlace viejo o ya borraste este bloque, vuelve a la lista para elegir otro plan.</Text>
            <View style={styles.actions}>
              <GlassButton title="Volver a mesociclos" onPress={() => router.replace('/(tabs)/mesocycles')} />
            </View>
          </GlassCard>
        </SafeAreaView>
      </ThemeBackground>
    );
  }

  const draft = buildMesocycleDraft(mesocycle);
  const plannedSessions = countPlannedSessions(draft);

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppNavBar
          onBack={() => router.back()}
          trailing={<Text style={[styles.headerTitle, { color: theme.primary }]}>{draft.status}</Text>}
        />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: theme.text }]}>{draft.name}</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>Resumen del mesociclo</Text>

          <GlassCard style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Vista general</Text>
            <Text style={[styles.metaText, { color: theme.textMuted }]}>Objetivo: {draft.goal || 'Sin objetivo definido todavía'}</Text>
            <Text style={[styles.metaText, { color: theme.textMuted }]}>Fecha de inicio: {formatStartDate(draft.startDate)}</Text>
            <Text style={[styles.metaText, { color: theme.textMuted }]}>Duración: {draft.durationWeeks} semana{draft.durationWeeks === 1 ? '' : 's'}</Text>
            <Text style={[styles.metaText, { color: theme.textMuted }]}>Sesiones planificadas: {plannedSessions}</Text>

            <View style={styles.actions}>
              <GlassButton title="Editar mesociclo" onPress={() => router.push(`/mesocycle/${id}`)} />
            </View>
          </GlassCard>

          {draft.weeks.map((week) => (
            <GlassCard key={week.id} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Semana {week.weekNumber}</Text>
              <Text style={[styles.weekMeta, { color: theme.textMuted }]}>{week.sessions.length} sesión{week.sessions.length === 1 ? '' : 'es'} planificada{week.sessions.length === 1 ? '' : 's'}</Text>

              {week.sessions.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>Todavía no hay sesiones planificadas en esta semana.</Text>
              ) : week.sessions.map((session) => {
                const resolvedRoutine = resolvePlannedRoutine(session.ref);
                return (
                  <View key={session.id} style={[styles.sessionCard, { borderColor: theme.glassBorder }]}> 
                    <Text style={[styles.sessionTitle, { color: theme.text }]}>{session.ref.routineName}</Text>
                    <Text style={[styles.sessionMeta, { color: theme.textMuted }]}>Día: {session.dayLabel || 'Sin asignar'} · Orden #{session.order}</Text>
                    <Text style={[styles.sessionMeta, { color: resolvedRoutine ? theme.textMuted : '#F5B041' }]}>
                      {resolvedRoutine ? 'Rutina disponible' : 'Rutina no disponible'}
                    </Text>
                    {session.progressionNote ? (
                      <Text style={[styles.sessionNote, { color: theme.textMuted }]}>Progresión: {session.progressionNote}</Text>
                    ) : null}
                    {session.note ? (
                      <Text style={[styles.sessionNote, { color: theme.textMuted }]}>Nota: {session.note}</Text>
                    ) : null}
                    {!resolvedRoutine ? (
                      <Text style={[styles.sessionNote, { color: '#F5B041' }]}>Esta rutina ya no está disponible para ejecutar desde este resumen.</Text>
                    ) : null}
                    <View style={styles.actions}>
                      <GlassButton title="Ejecutar rutina" onPress={() => resolvedRoutine ? router.push(`/routine/execute/${resolvedRoutine.id}`) : undefined} variant="secondary" disabled={!resolvedRoutine} />
                    </View>
                  </View>
                );
              })}
            </GlassCard>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  scroll: { paddingBottom: 40 },
  headerTitle: { fontSize: 14, fontWeight: '800', textTransform: 'capitalize' },
  title: { fontSize: 26, fontWeight: '900', marginBottom: 4 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  metaText: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  weekMeta: { fontSize: 13, marginBottom: 12 },
  emptyText: { fontSize: 13, lineHeight: 18 },
  sessionCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 10 },
  sessionTitle: { fontSize: 16, fontWeight: '800' },
  sessionMeta: { fontSize: 12, marginTop: 4 },
  sessionNote: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  actions: { marginTop: 16, gap: 10 },
});
