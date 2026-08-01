import React, { useEffect } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppScreenHeader } from '../../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { HapticPressable } from '../../../components/HapticPressable';
import { LogoutButton } from '../../../components/LogoutButton';
import { GlassButton } from '../../../components/UI';
import { useAuth } from '../../../context/AuthContext';
import { useData } from '../../../context/DataContext';
import { useTheme } from '../../../context/ThemeContext';
import { matchesActiveWorkout } from '../../../utils/activeWorkoutReentry';
import { muscleGroupLabel } from '../../../utils/catalogMuscleGroups';

export default function RoutinesScreen() {
  const { theme } = useTheme();
  const { user, welcomeMessage, setWelcomeMessage } = useAuth();
  const { routines, deleteRoutine, activeWorkoutDraft, catalogMuscleGroups = [] } = useData();

  useEffect(() => {
    if (user === 'brisas' && welcomeMessage) {
      Alert.alert('¡Bienvenida!', welcomeMessage, [
        { text: 'Gracias 💕', onPress: () => setWelcomeMessage(null) },
      ]);
    }
  }, [user, welcomeMessage]);

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Eliminar rutina', `¿Eliminar "${name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRoutine(id);
          } catch (error) {
            Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Inténtalo nuevamente.');
          }
        },
      },
    ]);
  };

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppScreenHeader
          title="Biblioteca de rutinas"
          subtitle="Plantillas reutilizables para mesociclos y entrenamientos"
          trailing={
            <>
              <LogoutButton />
              <GlassButton title="+ Nueva" onPress={() => router.push('/routine/create')} />
            </>
          }
        />

        {routines.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Aún no tienes rutinas
            </Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}> 
              Crea tu primera rutina como una plantilla reutilizable de ejercicios y series.
            </Text>
          </GlassCard>
        ) : (
          <FlatList
            data={routines}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <HapticPressable onPress={() => router.push(`/routine/${item.id}`)}>
                <GlassCard style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.folderIcon, { backgroundColor: theme.primary }]}>
                      <Text style={styles.folderEmoji}>📁</Text>
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={[styles.cardMeta, { color: theme.textMuted }]}> 
                        {item.exercises.length} ejercicio
                        {item.exercises.length !== 1 ? 's' : ''}
                      </Text>
                      {item.muscleGroups.length > 0 ? (
                        <View style={styles.muscleGroupRow}>
                          {item.muscleGroups.map((group) => (
                            <View
                              key={`${item.id}-${group}`}
                              style={[
                                styles.muscleGroupChip,
                                {
                                  backgroundColor: theme.glass,
                                  borderColor: theme.glassBorder,
                                },
                              ]}
                            >
                              <Text style={[styles.muscleGroupChipText, { color: theme.text }]}> 
                                 {muscleGroupLabel(catalogMuscleGroups, group)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.cardActions}>
                    <HapticPressable
                      accessibilityLabel={`${matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: item.id }) ? 'Continuar' : 'Entrenar'} ${item.name}`}
                      onPress={() => router.push(`/routine/execute/${item.id}`)}
                      style={styles.actionWrap}
                    >
                      <LinearGradient
                        colors={[theme.primary, theme.accent]}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={styles.actionBtn}
                      >
                        <Text style={styles.actionText}>▶ {matchesActiveWorkout(activeWorkoutDraft, { owner: user, routineId: item.id }) ? 'Continuar' : 'Entrenar'}</Text>
                      </LinearGradient>
                    </HapticPressable>
                    <HapticPressable
                      style={[styles.actionBtnOutline, { borderColor: theme.glassBorder }]}
                      onPress={() => handleDelete(item.id, item.name)}
                    >
                      <Text style={{ color: theme.textMuted }}>🗑</Text>
                    </HapticPressable>
                  </View>
                </GlassCard>
              </HapticPressable>
            )}
          />
        )}
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  list: {
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    marginBottom: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  folderIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderEmoji: {
    fontSize: 22,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  muscleGroupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  muscleGroupChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  muscleGroupChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 10,
  },
  actionWrap: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionBtnOutline: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  emptyCard: {
    marginTop: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 20,
  },
});
