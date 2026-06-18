import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { HapticPressable } from '../../../components/HapticPressable';
import { useShare } from '../../../context/ShareContext';
import { useTheme } from '../../../context/ThemeContext';
import { SharedRoutineDoc } from '../../../types';

export default function PendingSharesScreen() {
  const { theme } = useTheme();
  const { pendingShares, acceptShare, rejectShare } = useShare();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleAccept = async (shareId: string) => {
    setProcessingId(shareId);
    try {
      await acceptShare(shareId);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (shareId: string) => {
    setProcessingId(shareId);
    try {
      await rejectShare(shareId);
    } finally {
      setProcessingId(null);
    }
  };

  const renderShare = ({ item }: { item: SharedRoutineDoc }) => {
    const isProcessing = processingId === item.id;

    return (
      <GlassCard style={styles.card}>
        <Text style={[styles.routineName, { color: theme.text }]} numberOfLines={1}>
          {item.routine.name}
        </Text>
        <Text style={[styles.sharer, { color: theme.textMuted }]}>
          De: {item.sharedBy}
        </Text>
        <View style={styles.actions}>
          <HapticPressable
            onPress={() => handleAccept(item.id)}
            disabled={isProcessing}
            style={({ pressed }) => [
              styles.acceptBtn,
              { backgroundColor: theme.primary, opacity: pressed || isProcessing ? 0.7 : 1 },
            ]}
          >
            <Text style={styles.acceptText}>Aceptar</Text>
          </HapticPressable>
          <HapticPressable
            onPress={() => handleReject(item.id)}
            disabled={isProcessing}
            style={({ pressed }) => [
              styles.rejectBtn,
              { borderColor: theme.glassBorder, opacity: pressed || isProcessing ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.rejectText, { color: theme.textMuted }]}>Rechazar</Text>
          </HapticPressable>
        </View>
      </GlassCard>
    );
  };

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppNavBar onBack={() => router.back()} backLabel="← Rutinas" />

        <Text style={[styles.screenTitle, { color: theme.text }]}>Solicitudes pendientes</Text>
        <Text style={[styles.screenSubtitle, { color: theme.textMuted }]}>
          Rutinas compartidas contigo
        </Text>

        {pendingShares.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              No hay solicitudes pendientes
            </Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              Cuando tu pareja comparta una rutina contigo, aparecerá aquí.
            </Text>
          </GlassCard>
        ) : (
          <FlatList
            data={pendingShares}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={renderShare}
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
    paddingTop: 8,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: 13,
    marginBottom: 20,
    letterSpacing: 0.2,
  },
  list: {
    gap: 12,
    paddingBottom: 24,
  },
  card: {
    gap: 8,
  },
  routineName: {
    fontSize: 18,
    fontWeight: '700',
  },
  sharer: {
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  acceptBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  acceptText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  rejectBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  rejectText: {
    fontWeight: '600',
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
