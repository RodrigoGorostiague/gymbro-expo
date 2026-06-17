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

export default function RoutinesScreen() {
  const { theme } = useTheme();
  const { user, welcomeMessage, setWelcomeMessage } = useAuth();
  const { routines, deleteRoutine } = useData();

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
      { text: 'Eliminar', style: 'destructive', onPress: () => deleteRoutine(id) },
    ]);
  };

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppScreenHeader
          title="Mis Rutinas"
          subtitle="Mesociclos — carpetas de ejercicios"
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
              Crea tu primera rutina como un mesociclo con ejercicios y series.
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
                      <Text style={[styles.cardTitle, { color: theme.text }]}>
                        {item.name}
                      </Text>
                      <Text style={[styles.cardMeta, { color: theme.textMuted }]}>
                        {item.exercises.length} ejercicio
                        {item.exercises.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardActions}>
                    <HapticPressable
                      onPress={() => router.push(`/routine/execute/${item.id}`)}
                      style={styles.actionWrap}
                    >
                      <LinearGradient
                        colors={[theme.primary, theme.accent]}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={styles.actionBtn}
                      >
                        <Text style={styles.actionText}>▶ Ejecutar</Text>
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
  cardActions: {
    flexDirection: 'row',
    marginTop: 14,
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
