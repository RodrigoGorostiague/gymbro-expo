import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { HapticPressable } from './HapticPressable';
import { useTheme } from '../context/ThemeContext';

/** Disclosure is presentation-only: the execution screen owns every recorded value. */
export function WorkoutExerciseCard({
  name,
  position,
  completed,
  total,
  current,
  expanded,
  onToggle,
  children,
}: {
  name: string;
  position: number;
  completed: number;
  total: number;
  current: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const done = total > 0 && completed === total;
  const color = done
    ? theme.success
    : current
      ? theme.primary
      : theme.textMuted;
  return (
    <GlassCard
      blur={false}
      style={[
        styles.card,
        { borderColor: expanded ? color : theme.glassBorder },
      ]}
    >
      <HapticPressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? 'Ocultar' : 'Desplegar'} ${name}`}
        accessibilityState={{ expanded }}
        accessibilityHint={`${completed} de ${total} series realizadas`}
        onPress={onToggle}
        style={styles.header}
      >
        <View style={[styles.number, { backgroundColor: theme.glass }]}>
          {done ? (
            <Ionicons name="checkmark" size={21} color={color} />
          ) : (
            <Text style={{ color, fontWeight: '900' }}>{position}</Text>
          )}
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.text }]}>{name}</Text>
          <Text style={{ color: theme.textMuted }}>
            {completed}/{total} series ·{' '}
            {done
              ? 'Completado'
              : current
                ? 'En curso'
                : completed
                  ? 'En progreso'
                  : 'Pendiente'}
          </Text>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: total || 1, now: completed }}
            style={[styles.track, { backgroundColor: theme.glassBorder }]}
          >
            <View
              style={{
                height: 3,
                width: `${total ? (completed / total) * 100 : 0}%`,
                backgroundColor: color,
              }}
            />
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={theme.textMuted}
        />
      </HapticPressable>
      {expanded && <View style={styles.body}>{children}</View>}
    </GlassCard>
  );
}
const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
  },
  number: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 5 },
  title: { fontSize: 17, fontWeight: '800' },
  track: { height: 3, borderRadius: 3, overflow: 'hidden', marginTop: 3 },
  body: { marginTop: 16 },
});
