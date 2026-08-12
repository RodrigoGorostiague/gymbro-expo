import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { muscleGroupLabel } from '../../utils/catalogMuscleGroups';

const relevanceLabel = (value: number) => `${Math.round(value * 100)}%`;

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { exercises, catalogMuscleGroups = [] } = useData();
  const { theme } = useTheme();
  const exercise = exercises.find((item) => item.id === id);

  if (!exercise) {
    return (
      <ThemeBackground>
        <SafeAreaView style={styles.safe}>
          <AppNavBar onBack={() => router.back()} backLabel="Ejercicios" />
          <GlassCard><Text style={[styles.emptyTitle, { color: theme.text }]}>Ejercicio no disponible</Text><Text style={[styles.emptyText, { color: theme.textMuted }]}>Volvé al catálogo para elegir otro ejercicio.</Text></GlassCard>
        </SafeAreaView>
      </ThemeBackground>
    );
  }

  const participations = exercise.catalog?.muscleParticipations ?? [];

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
          <AppNavBar onBack={() => router.back()} backLabel="Ejercicios" />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <GlassCard style={styles.hero}>
            <View style={[styles.monogram, { backgroundColor: theme.primary }]}><Text style={[styles.monogramText, { color: theme.onPrimary }]}>{exercise.name.slice(0, 1).toUpperCase()}</Text></View>
            <Text style={[styles.eyebrow, { color: theme.primary }]}>EJERCICIO DEL CATÁLOGO</Text>
            <Text style={[styles.title, { color: theme.text }]}>{exercise.name}</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>Información curada de referencia para tus rutinas. No se edita desde esta vista.</Text>
            <View style={styles.factRow}>
              <DetailFact label="Patrón" value={exercise.catalog?.movementPattern ?? 'No especificado'} />
              <DetailFact label="Implemento" value={exercise.catalog?.equipment ?? exercise.variant} />
            </View>
          </GlassCard>

          <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: theme.text }]}>Participación muscular</Text><Text style={[styles.sectionCount, { color: theme.textMuted }]}>{participations.length || exercise.muscleGroups.length} grupos</Text></View>
          {participations.length ? participations.map((participation) => {
            const primary = participation.role === 'Principal';
            return (
              <GlassCard key={`${participation.muscleGroupId}-${participation.role}`} style={styles.participationCard}>
                <View style={styles.participationHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.participationName, { color: theme.text }]}>{muscleGroupLabel(catalogMuscleGroups, participation.muscleGroupId)}</Text>
                    <Text style={[styles.path, { color: theme.textMuted }]}>{catalogMuscleGroups.find((group) => group.id === participation.muscleGroupId)?.path ?? participation.originalLabel}</Text>
                  </View>
                  <View style={[styles.roleBadge, { backgroundColor: primary ? theme.primary : theme.glass, borderColor: primary ? theme.primary : theme.glassBorder }]}><Text style={[styles.roleText, { color: primary ? theme.onPrimary : theme.text }]}>{participation.role}</Text></View>
                </View>
                <View style={styles.relevanceRow}><View style={[styles.relevanceTrack, { backgroundColor: theme.glass }]}><View style={[styles.relevanceFill, { width: `${Math.round(participation.relevance * 100)}%`, backgroundColor: primary ? theme.primary : theme.secondary }]} /></View><Text style={[styles.relevanceText, { color: theme.text }]}>{relevanceLabel(participation.relevance)}</Text></View>
              </GlassCard>
            );
          }) : exercise.muscleGroups.map((group) => <GlassCard key={group} style={styles.participationCard}><Text style={[styles.participationName, { color: theme.text }]}>{muscleGroupLabel(catalogMuscleGroups, group)}</Text></GlassCard>)}
        </ScrollView>
      </SafeAreaView>
    </ThemeBackground>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return <View style={styles.fact}><Text style={[styles.factLabel, { color: theme.textMuted }]}>{label}</Text><Text style={[styles.factValue, { color: theme.text }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  content: { gap: 14, paddingBottom: 36 },
  hero: { alignItems: 'flex-start' },
  monogram: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 18, marginBottom: 16 },
  monogramText: { fontSize: 24, fontWeight: '900' },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  title: { fontSize: 28, fontWeight: '900', marginTop: 5 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  factRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  fact: { flex: 1, gap: 4 },
  factLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  factValue: { fontSize: 14, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  sectionCount: { fontSize: 12, fontWeight: '700' },
  participationCard: { gap: 14 },
  participationHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  participationName: { fontSize: 16, fontWeight: '900' },
  path: { fontSize: 12, marginTop: 4 },
  roleBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  roleText: { fontSize: 11, fontWeight: '800' },
  relevanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  relevanceTrack: { flex: 1, height: 8, borderRadius: 999, overflow: 'hidden' },
  relevanceFill: { height: '100%', borderRadius: 999 },
  relevanceText: { width: 38, textAlign: 'right', fontSize: 13, fontWeight: '900' },
  emptyTitle: { fontSize: 18, fontWeight: '900' },
  emptyText: { fontSize: 14, marginTop: 8, lineHeight: 20 },
});
