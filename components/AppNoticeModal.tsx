import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { HapticPressable } from './HapticPressable';

export function AppNoticeModal({
  visible,
  title,
  message,
  highlight,
  actionLabel = 'Entendido',
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  highlight?: string;
  actionLabel?: string;
  onClose: () => void;
}) {
  const { theme } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View accessibilityRole="alert" style={[styles.card, { backgroundColor: theme.tabBarBackground, borderColor: theme.accent }]}>
          {highlight ? <View style={[styles.highlight, { backgroundColor: theme.primary }]}><Text style={[styles.highlightText, { color: theme.onPrimary }]}>{highlight}</Text></View> : null}
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.message, { color: theme.textMuted }]}>{message}</Text>
          <HapticPressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onClose} style={[styles.action, { backgroundColor: theme.primary }]}>
            <Text style={[styles.actionText, { color: theme.onPrimary }]}>{actionLabel}</Text>
          </HapticPressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.62)', flex: 1, justifyContent: 'center', padding: 24 },
  card: { alignItems: 'center', borderRadius: 24, borderWidth: 1.5, gap: 14, maxWidth: 360, padding: 24, width: '100%' },
  highlight: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  highlightText: { fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  title: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  message: { fontSize: 16, lineHeight: 23, textAlign: 'center' },
  action: { alignItems: 'center', borderRadius: 14, marginTop: 4, paddingHorizontal: 24, paddingVertical: 13, width: '100%' },
  actionText: { fontSize: 16, fontWeight: '900' },
});
