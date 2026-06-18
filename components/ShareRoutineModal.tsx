import React, { useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassCard } from './GlassCard';
import { GlassButton } from './UI';
import { useAuth } from '../context/AuthContext';
import { useShare } from '../context/ShareContext';
import { Routine, UserProfile } from '../types';

interface ShareRoutineModalProps {
  visible: boolean;
  routine: Routine | null;
  onClose: () => void;
}

function getPartner(me: UserProfile): UserProfile {
  return me === 'rodaja' ? 'brisas' : 'rodaja';
}

export function ShareRoutineModal({ visible, routine, onClose }: ShareRoutineModalProps) {
  const { user } = useAuth();
  const { shareRoutine, hasPendingShare } = useShare();
  const [loading, setLoading] = useState(false);

  if (!routine || !user) return null;

  const partner = getPartner(user);
  const alreadyShared = hasPendingShare(routine.name);

  const handleShare = async () => {
    if (alreadyShared || loading) return;
    setLoading(true);
    try {
      await shareRoutine(routine.id, routine);
      if (Platform.OS === 'ios') {
        // toast-like feedback via haptic already handled by GlassButton
      }
      onClose();
    } catch {
      // Alert already shown by ShareContext
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <BlurView intensity={60} tint="dark" style={styles.overlay}>
        <View style={styles.container}>
          <GlassCard style={styles.card}>
            <Text style={styles.title}>Compartir rutina</Text>
            <Text style={styles.routineName}>{routine.name}</Text>

            {alreadyShared ? (
              <Text style={styles.warning}>Ya compartiste esta rutina</Text>
            ) : null}

            <GlassButton
              title={`Compartir con ${partner}`}
              onPress={handleShare}
              disabled={alreadyShared}
              loading={loading}
            />
            <View style={styles.spacer} />
            <GlassButton title="Cancelar" onPress={onClose} variant="secondary" />
          </GlassCard>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 20,
  },
  container: {
    paddingBottom: 20,
  },
  card: {
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'center',
  },
  routineName: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  warning: {
    fontSize: 14,
    color: '#E74C3C',
    textAlign: 'center',
    fontWeight: '600',
  },
  spacer: {
    height: 4,
  },
});
