import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MUSCLE_GROUP_OPTIONS } from '../constants/muscleGroups';
import { useTheme } from '../context/ThemeContext';
import { MuscleGroup } from '../types';
import { HapticPressable } from './HapticPressable';

interface MuscleGroupSelectorProps {
  value: MuscleGroup[];
  onChange: (value: MuscleGroup[]) => void;
}

export function MuscleGroupSelector({ value, onChange }: MuscleGroupSelectorProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.wrap}>
      {MUSCLE_GROUP_OPTIONS.map((option) => {
        const selected = value.includes(option.value);
        return (
          <HapticPressable
            key={option.value}
            onPress={() =>
              onChange(
                selected ? value.filter((item) => item !== option.value) : [...value, option.value],
              )
            }
            style={[
              styles.chip,
              {
                backgroundColor: selected ? theme.primary : theme.glass,
                borderColor: selected ? theme.primary : theme.glassBorder,
              },
            ]}
          >
            <Text style={[styles.label, { color: selected ? theme.onPrimary : theme.text }]}>
              {option.label}
            </Text>
          </HapticPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
});
