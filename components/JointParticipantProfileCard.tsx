import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getShopTheme } from '../constants/shopThemes';
import { useTheme } from '../context/ThemeContext';
import type { JointParticipant } from '../services/jointWorkouts';
import { HapticPressable } from './HapticPressable';
import { ProfileAvatar } from './ProfileAvatar';

const statusPresentation = {
  invited: { label: 'Invitado', palette: { primary: '#525252', accent: '#A3A3A3', secondary: '#262626' } },
  declined: { label: 'Declinó', palette: { primary: '#7F1D1D', accent: '#EF4444', secondary: '#450A0A' } },
} as const;

export function JointParticipantProfileCard({ participant, children, onPress, selected = false }: {
  participant: JointParticipant;
  children?: React.ReactNode;
  onPress?: () => void;
  selected?: boolean;
}) {
  const { theme } = useTheme();
  const fixedStatus = statusPresentation[participant.status as 'invited' | 'declined'];
  const palette = fixedStatus?.palette ?? getShopTheme(participant.themeId ?? '') ?? {
    primary: theme.primary,
    accent: theme.accent,
    secondary: theme.secondary,
  };
  const badge = fixedStatus?.label ?? (participant.status === 'completed' ? 'Completó' : 'Activo');

  const content = <>
      <View style={[styles.banner, { backgroundColor: palette.primary, borderColor: palette.accent }]}>
        <ProfileAvatar avatarId={participant.avatarId} size={48} borderColor="#fff" />
        <View style={styles.copy}>
          <Text style={styles.alias}>{participant.alias}</Text>
          <View style={[styles.badge, { backgroundColor: palette.secondary }]}><Text style={styles.badgeText}>{badge}</Text></View>
        </View>
      </View>
      {children}
  </>;

  if (onPress) {
    return <HapticPressable accessibilityRole="button" accessibilityLabel={`Participante ${participant.alias}: ${badge}`} accessibilityState={{ selected }} onPress={onPress} style={[styles.card, styles.selectableCard, { borderColor: palette.accent }, selected && styles.selectedCard]}>{content}</HapticPressable>;
  }

  return <View accessibilityLabel={`Participante ${participant.alias}: ${badge}`} style={[styles.card, { borderColor: palette.accent }]}>{content}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, gap: 10, overflow: 'hidden' },
  selectableCard: { width: '100%' },
  selectedCard: { borderWidth: 3 },
  banner: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 10, padding: 12 },
  copy: { flex: 1, gap: 5 },
  alias: { color: '#fff', fontSize: 18, fontWeight: '900' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
});
