import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EffortTarget } from '../types';
import { useTheme } from '../context/ThemeContext';
import { HapticPressable } from './HapticPressable';

type EffortMode = EffortTarget['kind'] | 'none';

interface EffortTargetControlProps {
  value?: EffortTarget;
  disabled?: boolean;
  onChange: (target: EffortTarget | undefined) => void;
}

export function EffortTargetControl({ value, disabled = false, onChange }: EffortTargetControlProps) {
  const { theme } = useTheme();
  const [pendingMode, setPendingMode] = useState<EffortTarget['kind'] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const mode: EffortMode = pendingMode ?? value?.kind ?? 'none';
  const choices = mode === 'rir' ? [0, 1, 2, 3, 4, 5] : mode === 'rpe' ? [6, 7, 8, 9, 10] : [];
  const tone = value ? effortTone(value) : null;

  const selectMode = (next: EffortMode) => {
    if (disabled) return;
    if (next === 'none') {
      setPendingMode(null);
      onChange(undefined);
      setIsEditing(false);
      return;
    }
    setPendingMode(next);
  };

  const selectValue = (next: number) => {
    if (mode === 'rir') onChange({ kind: 'rir', value: next as Extract<EffortTarget, { kind: 'rir' }>['value'] });
    if (mode === 'rpe') onChange({ kind: 'rpe', value: next as Extract<EffortTarget, { kind: 'rpe' }>['value'] });
    setPendingMode(null);
    setIsEditing(false);
  };

  if (!isEditing) {
    const accessibilityLabel = value
      ? `Editar ${value.kind.toUpperCase()} ${value.value}`
      : 'Configurar intensidad objetivo';
    return <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.textMuted }]}>Intensidad objetivo</Text>
      <HapticPressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Abre el selector de intensidad"
        disabled={disabled}
        onPress={() => setIsEditing(true)}
        style={value
          ? [styles.badge, { backgroundColor: `${tone!.color}24`, borderColor: tone!.color }]
          : [styles.powerButton, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}
      >{value
        ? <><Text style={[styles.badgeText, { color: tone!.color }]}>{value.kind.toUpperCase()} {value.value}</Text><Ionicons name="pencil" size={13} color={tone!.color} /></>
        : <Ionicons name="power-outline" size={18} color={theme.textMuted} />}</HapticPressable>
    </View>;
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.textMuted }]}>Intensidad objetivo</Text>
      <View accessibilityRole="radiogroup" style={styles.modes}>
        {([
          ['none', 'Sin objetivo'],
          ['rir', 'RIR'],
          ['rpe', 'RPE'],
        ] as const).map(([candidate, label]) => {
          const selected = mode === candidate;
          return <HapticPressable
            key={candidate}
            accessibilityRole="radio"
            accessibilityLabel={candidate === 'none' ? 'Sin objetivo' : label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => selectMode(candidate)}
            style={[styles.mode, candidate === 'none' && styles.noneMode, { borderColor: selected ? theme.primary : theme.glassBorder, backgroundColor: selected ? theme.primary : theme.glass }]}
          ><View style={styles.modeLabel}>{candidate === 'none' ? <Ionicons name="ban-outline" size={17} color={selected ? theme.onPrimary : theme.textMuted} /> : <Text style={{ color: selected ? theme.onPrimary : theme.textMuted, fontWeight: '800' }}>{label}</Text>}</View></HapticPressable>;
        })}
      </View>
      {choices.length ? <View style={styles.values}>
        {choices.map((choice) => {
          const selected = value?.kind === mode && value.value === choice;
          const choiceTone = effortTone(mode === 'rir' ? { kind: 'rir', value: choice as Extract<EffortTarget, { kind: 'rir' }>['value'] } : { kind: 'rpe', value: choice as Extract<EffortTarget, { kind: 'rpe' }>['value'] });
          return <HapticPressable
            key={choice}
            accessibilityRole="radio"
            accessibilityLabel={`${mode.toUpperCase()} ${choice}`}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => selectValue(choice)}
            style={[styles.value, { borderColor: selected ? choiceTone.color : theme.glassBorder, backgroundColor: selected ? `${choiceTone.color}24` : theme.glass }]}
          ><Text style={{ color: selected ? choiceTone.color : theme.text, fontWeight: '800' }}>{choice}</Text></HapticPressable>;
        })}
      </View> : null}
    </View>
  );
}

function effortTone(target: EffortTarget) {
  const high = target.kind === 'rir' ? target.value <= 1 : target.value >= 9;
  const medium = target.kind === 'rir' ? target.value <= 3 : target.value >= 7;
  return { color: high ? '#F05252' : medium ? '#F59E0B' : '#22C55E' };
}

const styles = StyleSheet.create({
  wrap: { gap: 7, marginTop: 12 },
  label: { fontSize: 12, fontWeight: '700' },
  modes: { flexDirection: 'row', gap: 6 },
  mode: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flex: 1, minHeight: 38, justifyContent: 'center', paddingHorizontal: 8 },
  noneMode: { flex: 0, width: 42 },
  modeLabel: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  values: { flexDirection: 'row', gap: 6 },
  value: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flex: 1, minHeight: 38, justifyContent: 'center' },
  badge: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 34, paddingHorizontal: 12 },
  badgeText: { fontSize: 13, fontWeight: '900' },
  powerButton: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, height: 34, justifyContent: 'center', width: 42 },
});
