import React, { useState } from 'react';
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
    const { sessions, isLoading } = useData();
    const { theme } = useTheme();
    const session = sessions.find((candidate) => candidate.id === id);
    const [expanded, setExpanded] = useState<string | null>(null);
    return <ThemeBackground><SafeAreaView style={styles.safe}>
    <AppNavBar onBack={() => router.back()} backLabel="Volver"/>
    <ScrollView contentContainerStyle={styles.content}>
      {!session ? <Text accessibilityRole="alert" style={{ color: theme.text }}>{isLoading ? 'Cargando tu entrenamiento…' : 'Esta sesión no está disponible en tu historial.'}</Text> : <>
        <WorkoutVictory session={session}/>
        <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header">Tu trabajo, serie por serie</Text>
        <Text style={{ color: theme.textMuted }}>Esta vista consulta tu historial personal. La publicación en GymBro depende de tus preferencias de privacidad.</Text>
        {session.exercises.map((exercise, index) => <GlassCard key={exercise.exerciseId} blur={false}>
          <HapticPressable accessibilityLabel={`${exercise.name}, ver series`} accessibilityState={{ expanded: expanded === exercise.exerciseId }} onPress={() => setExpanded(expanded === exercise.exerciseId ? null : exercise.exerciseId)} style={styles.row}>
            <View style={styles.flex}><Text style={[styles.heading, { color: theme.text }]}>{String(index + 1).padStart(2, '0')} · {exercise.name}</Text><Text style={{ color: theme.textMuted }}>{exercise.sets.filter((set) => set.completed).length}/{exercise.sets.length} series realizadas</Text></View><Text style={{ color: theme.primary }}>{expanded === exercise.exerciseId ? '−' : '+'}</Text>
          </HapticPressable>
          {expanded === exercise.exerciseId ? exercise.sets.map((set, setIndex) => <View key={set.setId} style={[styles.row, { borderTopColor: theme.glassBorder, borderTopWidth: 1 }]}><Text style={{ color: theme.text }}>Serie {setIndex + 1} · {set.reps} reps</Text><Text style={{ color: set.completed ? theme.success : theme.textMuted }}>{set.completed ? 'Realizada' : 'No realizada'}</Text></View>) : null}
        </GlassCard>)}
        <GlassButton title="Corregir datos de esta sesión" variant="secondary" onPress={() => router.push(`/session/${session.id}`)}/>
      </>}
      <GlassButton title="Volver a entrenar" onPress={() => router.replace('/(tabs)/train')}/>
    </ScrollView>
  </SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1, paddingHorizontal: 16 }, content: { gap: 16, paddingBottom: 32 }, heading: { fontSize: 19, fontWeight: '800' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 16, minHeight: 48 }, flex: { flex: 1, gap: 8 } });
