import React, { useEffect, useState } from 'react';
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
import { ShareRoutineModal } from '../../../components/ShareRoutineModal';
import { GlassButton } from '../../../components/UI';
import { useAuth } from '../../../context/AuthContext';
import { useData } from '../../../context/DataContext';
import { useShare } from '../../../context/ShareContext';
import { useTheme } from '../../../context/ThemeContext';
import { PARTNER_PROFILE } from '../../../constants/kiss';
import { MUSCLE_GROUP_LABELS } from '../../../constants/muscleGroups';
import { Routine } from '../../../types';

export default function RoutinesScreen() {
  const { theme } = useTheme();
  const { user, welcomeMessage, setWelcomeMessage } = useAuth();
  const partner = user ? PARTNER_PROFILE[user] : null;
  const { routines, deleteRoutine } = useData();
  const { pendingShares, hasPendingShare } = useShare();
  const [shareTarget, setShareTarget] = useState<Routine | null>(null);

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
              {pendingShares.length > 0 && (
                <HapticPressable
                  onPress={() => router.push('/(tabs)/routines/pending-shares')}
                  style={styles.pendingBtn}
                >
                  <Text style={[styles.pendingBadge, { backgroundColor: theme.primary }]}>
                    {pendingShares.length}
                  </Text>
                </HapticPressable>
              )}
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
                      <View style={styles.cardTitleRow}>
                        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {item.isShared ? (
                          <View style={[styles.sharedBadge, { backgroundColor: theme.primary }]}>
                            <Text style={styles.sharedBadgeText}>Compartida</Text>
                          </View>
                        ) : null}
                      </View>
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
                                {MUSCLE_GROUP_LABELS[group]}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </View>
                  {/* Share toggle button — CombineWithPartnerCard pattern */}
                  {partner && (
                    <HapticPressable
                      onPress={(event) => {
                        event.stopPropagation();
                        setShareTarget(item);
                      }}
                      disabled={item.isShared || hasPendingShare(item.name)}
                      style={styles.shareToggleWrap}
                    >
                      <LinearGradient
                        colors={
                          item.isShared || hasPendingShare(item.name)
                            ? [theme.glassBorder, theme.glassBorder]
                            : [theme.primary, theme.accent]
                        }
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={styles.shareToggleBorder}
                      >
                        <View
                          style={[
                            styles.shareToggleInner,
                            {
                              backgroundColor:
                                theme.blurTint === 'light'
                                  ? 'rgba(255,255,255,0.65)'
                                  : 'rgba(8,8,14,0.65)',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.shareToggleText,
                              {
                                color:
                                  item.isShared || hasPendingShare(item.name)
                                    ? theme.textMuted
                                    : theme.text,
                              },
                            ]}
                          >
                            {item.isShared
                              ? 'Compartida'
                              : hasPendingShare(item.name)
                                ? 'Pendiente de aceptación'
                                : `Compartir con ${partner}`}
                          </Text>
                          <View
                            style={[
                              styles.shareTogglePill,
                              {
                                backgroundColor: item.isShared
                                  ? theme.success
                                  : hasPendingShare(item.name)
                                    ? theme.glass
                                    : theme.glass,
                                borderColor: theme.glassBorder,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.shareTogglePillText,
                                {
                                  color: item.isShared
                                    ? '#FFF'
                                    : theme.textMuted,
                                },
                              ]}
                            >
                              {item.isShared ? '✓' : hasPendingShare(item.name) ? '⏳' : '🔗'}
                            </Text>
                          </View>
                        </View>
                      </LinearGradient>
                    </HapticPressable>
                  )}
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
        <ShareRoutineModal
          visible={shareTarget !== null}
          routine={shareTarget}
          onClose={() => setShareTarget(null)}
        />
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
  shareToggleWrap: {
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
  },
  shareToggleBorder: {
    borderRadius: 14,
    padding: 1.5,
  },
  shareToggleInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  shareToggleText: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    paddingRight: 8,
  },
  shareTogglePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  shareTogglePillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
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
  pendingBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pendingBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sharedBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sharedBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
