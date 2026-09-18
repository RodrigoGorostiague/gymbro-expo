import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SetType } from '../types';
import { useTheme } from '../context/ThemeContext';
import { HapticPressable } from './HapticPressable';

type SetTypeChoice = 'C' | 'effective' | 'F';

interface SetTypeControlProps {
  value: SetType;
  disabled?: boolean;
  onChange: (type: SetTypeChoice) => void;
}

function setTypeDetails(type: SetType) {
  if (type === 'C') return { label: 'Calentamiento', color: '#F59E0B' };
  if (type === 'F') return { label: 'Serie al fallo', color: '#EF4444' };
  return { label: `Serie ${type}`, color: null };
}

export function SetTypeControl({ value, disabled = false, onChange }: SetTypeControlProps) {
  const { theme } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const details = setTypeDetails(value);

  const selectType = (type: SetTypeChoice) => {
    if (disabled) return;
    onChange(type);
    setIsEditing(false);
  };

  if (!isEditing) {
    const color = details.color ?? theme.primary;
    return <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.textMuted }]}>Tipo de serie</Text>
      <HapticPressable
        accessibilityRole="button"
        accessibilityLabel={disabled ? `Tipo de serie: ${details.label}` : `Editar ${details.label}`}
        accessibilityHint={disabled ? undefined : 'Abre el selector de tipo de serie'}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setIsEditing(true)}
        style={[styles.badge, { backgroundColor: `${color}24`, borderColor: color }]}
      >
        <Text style={[styles.badgeText, { color }]}>{details.label}</Text>
        {!disabled ? <Ionicons name="pencil" size={13} color={color} /> : null}
      </HapticPressable>
    </View>;
  }

  return <View style={styles.wrap}>
    <Text style={[styles.label, { color: theme.textMuted }]}>Tipo de serie</Text>
    <View accessibilityRole="radiogroup" style={styles.options}>
      {([
        ['C', 'C', 'Calentamiento'],
        ['effective', 'E', 'Serie efectiva'],
        ['F', 'F', 'Fallo muscular'],
      ] as const).map(([type, label, accessibilityLabel]) => {
        const selected = type === 'effective' ? typeof value === 'number' : value === type;
        return <HapticPressable
          key={type}
          accessibilityRole="radio"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ selected, disabled }}
          disabled={disabled}
          onPress={() => selectType(type)}
          style={[styles.option, { borderColor: selected ? theme.primary : theme.glassBorder, backgroundColor: selected ? theme.primary : theme.glass }]}
        ><Text style={{ color: selected ? theme.onPrimary : theme.textMuted, fontWeight: '800' }}>{label}</Text></HapticPressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 7, marginTop: 12 },
  label: { fontSize: 12, fontWeight: '700' },
  badge: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 34, paddingHorizontal: 12 },
  badgeText: { fontSize: 13, fontWeight: '900' },
  options: { flexDirection: 'row', gap: 6 },
  option: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flex: 1, minHeight: 38, justifyContent: 'center', paddingHorizontal: 8 },
});
