import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { MuscleGroup } from '../types';
import { isSelectableMuscleParent } from '../utils/catalogMuscleGroups';
import { HapticPressable } from './HapticPressable';

interface MuscleGroupSelectorProps {
  value: MuscleGroup[];
  onChange: (value: MuscleGroup[]) => void;
}

export function MuscleGroupSelector({ value, onChange }: MuscleGroupSelectorProps) {
  const { theme } = useTheme();
  const { catalogMuscleGroups = [] } = useData();
  const [query, setQuery] = useState('');
  const visibleGroups = catalogMuscleGroups.filter((group) => (
    isSelectableMuscleParent(group) && group.displayName.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'))
  ));

  return (
    <View style={styles.wrap}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar grupo muscular"
        placeholderTextColor={theme.textMuted}
        style={[styles.search, { color: theme.text, borderColor: theme.glassBorder }]}
      />
      {visibleGroups.map((group) => {
        const selected = value.includes(group.id);
        return (
          <HapticPressable
            key={group.id}
            onPress={() =>
              onChange(
                selected ? value.filter((item) => item !== group.id) : [...value, group.id],
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
              {group.displayName}
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
  search: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
