import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { HapticPressable } from '../../components/HapticPressable';
import { GlassButton, GlassInput } from '../../components/UI';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { MesocycleStatus } from '../../types';
import { generateId } from '../../utils/storage';

const STATUS_OPTIONS: { value: MesocycleStatus; label: string }[] = [
  { value: 'draft', label: 'Borrador' },
  { value: 'active', label: 'Activo' },
  { value: 'completed', label: 'Completado' },
  { value: 'archived', label: 'Archivado' },
];

const buildWeeks = (durationWeeks: number) => Array.from({ length: durationWeeks }, (_, index) => ({
  id: generateId(),
  weekNumber: index + 1,
  sessions: [],
}));

const normalizeStartDate = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('La fecha de inicio debe usar el formato YYYY-MM-DD.');
  }
  return trimmed;
};

export default function CreateMesocycleScreen() {
  const { theme } = useTheme();
  const { addMesocycle } = useData();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [status, setStatus] = useState<MesocycleStatus>('draft');
  const [durationWeeks, setDurationWeeks] = useState('4');
  const [startDate, setStartDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const parsedWeeks = useMemo(() => Number.parseInt(durationWeeks, 10), [durationWeeks]);

  const save = async () => {
    if (isSaving) return;
    if (!name.trim()) {
      Alert.alert('Validación', 'El nombre no puede estar vacío.');
      return;
    }
    if (!Number.isInteger(parsedWeeks) || parsedWeeks <= 0) {
      Alert.alert('Validación', 'La duración debe ser un número entero mayor a 0.');
      return;
    }

    try {
      setIsSaving(true);
      const created = await addMesocycle({
        name: name.trim(),
        goal: goal.trim(),
        status,
        durationWeeks: parsedWeeks,
        startDate: normalizeStartDate(startDate),
        weeks: buildWeeks(parsedWeeks),
      });
      router.replace(`/mesocycle/${created.id}`);
    } catch (error) {
      Alert.alert(
        'No se pudo guardar',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppNavBar
          onBack={() => {
            if (!isSaving) router.back();
          }}
          trailing={<Text style={[styles.headerTitle, { color: theme.primary }]}>Nuevo bloque</Text>}
        />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, { color: theme.text }]}>Crear mesociclo</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>Define el bloque base antes de entrar a la planificación semanal.</Text>

            <GlassCard style={styles.section}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Nombre</Text>
              <GlassInput value={name} onChangeText={setName} placeholder="Ej.: Bloque de hipertrofia" autoFocus />
            </GlassCard>

            <GlassCard style={styles.section}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Objetivo</Text>
              <GlassInput value={goal} onChangeText={setGoal} placeholder="Ej.: Mejorar volumen de empuje" multiline numberOfLines={3} style={styles.textArea} />
            </GlassCard>

            <GlassCard style={styles.section}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Estado</Text>
              <View style={styles.rowWrap}>
                {STATUS_OPTIONS.map((option) => {
                  const selected = option.value === status;
                  return (
                    <HapticPressable
                      key={option.value}
                      onPress={() => setStatus(option.value)}
                      style={[
                        styles.optionChip,
                        {
                          borderColor: theme.glassBorder,
                          backgroundColor: selected ? theme.primary : theme.glass,
                        },
                      ]}
                    >
                      <Text style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: '700' }}>
                        {option.label}
                      </Text>
                    </HapticPressable>
                  );
                })}
              </View>
            </GlassCard>

            <GlassCard style={styles.section}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Duración (semanas)</Text>
              <GlassInput value={durationWeeks} onChangeText={setDurationWeeks} keyboardType="number-pad" placeholder="4" />
            </GlassCard>

            <GlassCard style={styles.section}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Fecha de inicio (opcional)</Text>
              <GlassInput value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
              <Text style={[styles.hint, { color: theme.textMuted }]}>Usa el formato YYYY-MM-DD para dejar la fecha lista para la próxima etapa del plan.</Text>
            </GlassCard>

            <GlassCard style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Lo que sigue</Text>
              <Text style={[styles.hint, { color: theme.textMuted }]}>Este slice crea el bloque base y te lleva a una vista resumen. La edición detallada de semanas y sesiones queda para el siguiente slice.</Text>
            </GlassCard>

            <GlassButton title="Crear mesociclo" onPress={save} disabled={isSaving} loading={isSaving} />
            <View style={styles.spacer} />
            <GlassButton title="Cancelar" onPress={() => router.back()} variant="secondary" disabled={isSaving} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  scroll: { paddingBottom: 36 },
  headerTitle: { fontSize: 14, fontWeight: '800' },
  title: { fontSize: 26, fontWeight: '900', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 16 },
  section: { marginBottom: 14 },
  label: { fontSize: 13, marginBottom: 10 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  spacer: { height: 12 },
});
