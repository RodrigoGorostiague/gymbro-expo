import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getShopTheme } from '../constants/shopThemes';
import { useTheme } from '../context/ThemeContext';
import type { JointParticipant } from '../services/jointWorkouts';
import { HapticPressable } from './HapticPressable';
import { ProfileAvatar } from './ProfileAvatar';
import { ProfileTitleBadge } from './ProfileTitleBadge';

const statusPresentation = {
  invited: { label: 'Invitado', palette: { primary: '#525252', accent: '#A3A3A3', secondary: '#262626' } },
  declined: { label: 'Declinó', palette: { primary: '#7F1D1D', accent: '#EF4444', secondary: '#450A0A' } },
} as const;

export function JointParticipantProfileCard({ participant, children, onPress, selected = false, compact = false }: {
  participant: JointParticipant;
  children?: React.ReactNode;
  onPress?: () => void;
  selected?: boolean;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  const fixedStatus = statusPresentation[participant.status as 'invited' | 'declined'];
  const palette = fixedStatus?.palette ?? getShopTheme(participant.themeId ?? '') ?? {
    primary: theme.primary,
    accent: theme.accent,
    secondary: theme.secondary,
  };
  const badge = fixedStatus?.label ?? (participant.status === 'completed' ? 'Completó' : 'Activo');

  if (compact) {
    return <View accessibilityLabel={`Participante ${participant.alias}: ${badge}`} style={[styles.compact, { backgroundColor: palette.primary, borderColor: palette.accent }]}>
      <ProfileAvatar avatarId={participant.avatarId} frameId={participant.frameId} size={28} borderColor="#fff" />
      <Text numberOfLines={1} style={styles.compactAlias}>{participant.alias}</Text>
      <Text style={[styles.compactBadge, { backgroundColor: palette.secondary }]}>{badge}</Text>
    </View>;
  }

  const content = <>
      <View style={[styles.banner, { backgroundColor: palette.primary, borderColor: palette.accent }]}>
        <ProfileAvatar avatarId={participant.avatarId} frameId={participant.frameId} size={48} borderColor="#fff" />
        <View style={styles.copy}>
          <Text style={styles.alias}>{participant.alias}</Text>
          {participant.titleId ? <ProfileTitleBadge titleId={participant.titleId} /> : <View style={[styles.badge, { backgroundColor: palette.secondary }]}><Text style={styles.badgeText}>{badge}</Text></View>}
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
  compact: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 5, maxWidth: 150, paddingHorizontal: 6, paddingVertical: 5 },
  compactAlias: { color: '#fff', flexShrink: 1, fontSize: 12, fontWeight: '800' },
  compactBadge: { color: '#fff', borderRadius: 999, fontSize: 9, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 5, paddingVertical: 2, textTransform: 'uppercase' },
  banner: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 10, padding: 12 },
  copy: { flex: 1, gap: 5 },
  alias: { color: '#fff', fontSize: 18, fontWeight: '900' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
});
