import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { HistoricalOption } from '../../utils/analytics';
import { HapticPressable } from '../HapticPressable';

export function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return <HapticPressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${label}${selected ? ', seleccionado' : ''}`} onPress={onPress} style={[styles.chip, { borderColor: selected ? theme.primary : theme.glassBorder, backgroundColor: selected ? theme.primary : theme.glass }]}><Text style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: '700' }}>{label}</Text></HapticPressable>;
}

export function EntityPanel({ kind, options, search, setSearch, selected, setSelected }: { kind: 'exercise' | 'routine'; options: readonly HistoricalOption[]; search: string; setSearch: (value: string) => void; selected: string | null; setSelected: (value: string) => void }) {
  const { theme } = useTheme();
  const visible = options.filter((item) => item.labels.some((label) => label.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  return <View><TextInput accessibilityLabel={`Buscar ${kind === 'exercise' ? 'ejercicio' : 'rutina'}`} accessibilityHint="Busca también elementos históricos" value={search} onChangeText={setSearch} placeholder="Buscar opciones del historial" placeholderTextColor={theme.textMuted} style={[styles.search, { color: theme.text, borderColor: theme.glassBorder }]} /><View style={styles.wrap}>{visible.map((item) => <FilterChip key={item.id} label={`${item.label}${item.historical ? ' · histórico' : ''}`} selected={selected === item.id} onPress={() => setSelected(item.id)} />)}</View>{visible.length === 0 ? <Text style={[styles.body, { color: theme.textMuted }]}>No hay opciones que coincidan con la búsqueda.</Text> : null}</View>;
}

export function EmptyFilter({ onClear }: { onClear: () => void }) {
  const { theme } = useTheme();
  return <View><Text style={[styles.body, { color: theme.textMuted }]}>No hay datos compatibles para este filtro. Puede haber actividad sin identidad o dimensiones conocidas.</Text><HapticPressable accessibilityRole="button" onPress={onClear} style={[styles.action, { backgroundColor: theme.primary }]}><Text style={{ color: theme.onPrimary, fontWeight: '800' }}>Borrar filtro</Text></HapticPressable></View>;
}

const styles = StyleSheet.create({
  body: { fontSize: 13, lineHeight: 19 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 14 },
  search: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, marginBottom: 4 },
  chip: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 },
  action: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 14, marginTop: 14 },
});
