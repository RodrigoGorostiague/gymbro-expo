import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { HapticPressable } from './HapticPressable';
import { useTheme } from '../context/ThemeContext';

export type TrainView = 'mesocycles' | 'routines';

interface TrainViewSwitcherProps {
  value: TrainView;
  onChange: (view: TrainView) => void;
}

export function TrainViewSwitcher({ value, onChange }: TrainViewSwitcherProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={[styles.segmented, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
        {([
          ['mesocycles', 'Mesociclos'],
          ['routines', 'Rutinas'],
        ] as const).map(([view, label]) => {
          const selected = value === view;
          return (
            <HapticPressable
              key={view}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(view)}
              style={[styles.segment, selected && { backgroundColor: theme.primary }]}
            >
              <Text style={[styles.segmentText, { color: selected ? theme.onPrimary : theme.text }]}>{label}</Text>
            </HapticPressable>
          );
        })}
      </View>
      <HapticPressable
        accessibilityRole="button"
        accessibilityLabel="Abrir catálogo de ejercicios"
        onPress={() => router.push('/exercises')}
        style={[styles.catalogLink, { borderColor: theme.glassBorder, backgroundColor: theme.glass }]}
      >
        <Text style={[styles.catalogLinkText, { color: theme.text }]}>Explorar ejercicios</Text>
        <Ionicons name="arrow-forward" size={18} color={theme.primary} />
      </HapticPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 16 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 16, padding: 4, gap: 4 },
  segment: { flex: 1, alignItems: 'center', borderRadius: 12, paddingVertical: 10 },
  segmentText: { fontSize: 13, fontWeight: '800' },
  catalogLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 },
  catalogLinkText: { fontSize: 13, fontWeight: '800' },
});
