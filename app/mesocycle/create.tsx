import { buildGuidedWeeks, REST_DAY } from '../../utils/planningPreview';
import { deriveScheduleDateLabel } from '../../utils/mesocycles';
import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { DateTimeField } from '../../components/DateTimeField';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { HapticPressable } from '../../components/HapticPressable';
import { GlassButton, GlassInput } from '../../components/UI';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { Mesocycle, MesocycleStatus } from '../../types';
import { generateId } from '../../utils/storage';
import { findOverlappingMesocycle } from '../../utils/mesocycleAnalytics';

const STATUS_OPTIONS: { value: MesocycleStatus; label: string }[] = [
  { value: 'draft', label: 'Borrador' },
  { value: 'scheduled', label: 'Programado' },
  { value: 'active', label: 'Activo' },
];

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
  const { addMesocycle, mesocycles, routines = [] } = useData();
  const [planningDays, setPlanningDays] = useState<Array<string | null>>(Array(7).fill(null));
  const [selectedDay, setSelectedDay] = useState(0);
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
    if (!Number.isInteger(parsedWeeks) || parsedWeeks <= 0 || parsedWeeks > 52) {
      Alert.alert('Validación', 'La duración debe ser un número entero entre 1 y 52 semanas.');
      return;
    }

    try {
      const normalizedStartDate = normalizeStartDate(startDate);
      const candidate = {
        name: name.trim(),
        goal: goal.trim(),
        status,
        durationWeeks: parsedWeeks,
        startDate: normalizedStartDate,
        weeks: buildGuidedWeeks(parsedWeeks, planningDays, routines, generateId),
      };
      const overlap = findOverlappingMesocycle<Mesocycle>({ ...candidate, id: '__new_mesocycle__', createdAt: '' }, mesocycles);
      if (overlap) {
        Alert.alert('Fechas superpuestas', `Este bloque coincide con "${overlap.name}". Elegí otra fecha o completa/cancela el bloque existente.`);
        return;
      }
      setIsSaving(true);
      const created = await addMesocycle(candidate);
      router.replace(`/mesocycle/summary/${created.id}`);
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
              <DateTimeField value={startDate} onChange={setStartDate} mode="date" placeholder="Sin fecha definida" testID="mesocycle-create-start-date-picker" />
              <Text style={[styles.hint, { color: theme.textMuted }]}>Elegí la fecha desde el selector. Al guardar validaremos que no se superponga con otro bloque vigente.</Text>
            </GlassCard>

            <GlassCard style={styles.section}>
              <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: '900' }}>Diseña tu semana base</Text>
              <Text style={{ color: theme.textMuted }}>Opcional. Elige cada día; se repetirá durante el bloque y podrás ajustar el calendario después. Los días sin asignar no son descansos implícitos.</Text>
              <View style={{ gap: 8 }}>{planningDays.map((day, index) => <HapticPressable key={index} accessibilityRole="radio" accessibilityState={{ selected: selectedDay === index }} accessibilityLabel={`Día ${index + 1}, ${day === REST_DAY ? 'Descanso' : routines.find((routine) => routine.id === day)?.name ?? 'Sin asignar'}`} onPress={() => setSelectedDay(index)} style={{ minHeight: 48, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: selectedDay === index ? theme.primary : theme.glassBorder }}><Text style={{ color: theme.text, fontWeight: '800' }}>{deriveScheduleDateLabel(startDate, index, 'es')?.weekday ?? `Día ${index + 1}`} · {day === REST_DAY ? 'Descanso' : routines.find((routine) => routine.id === day)?.name ?? 'Sin asignar'}</Text></HapticPressable>)}</View>
              <Text style={{ color: theme.primary, fontWeight: '800' }}>Asignar al día {selectedDay + 1}</Text>
              <View style={{ gap: 8 }}>{[[REST_DAY, 'Descanso'], ...routines.map((routine) => [routine.id, routine.name])].map(([id, label]) => <GlassButton key={id} title={label} variant="secondary" onPress={() => setPlanningDays((current) => current.map((day, index) => index === selectedDay ? id : day))} />)}<GlassButton title="Dejar sin asignar" variant="secondary" onPress={() => setPlanningDays((current) => current.map((day, index) => index === selectedDay ? null : day))} /></View>
            </GlassCard>
            <GlassCard style={styles.section}>
              <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: '900' }}>Vista previa de tu bloque</Text>
              <Text style={{ color: theme.textMuted }}>{name.trim() || 'Tu próximo bloque'} · {Number.isInteger(parsedWeeks) && parsedWeeks > 0 && parsedWeeks <= 52 ? `${parsedWeeks} semanas` : 'Revisa la duración'} · {startDate || 'Inicio por definir'}</Text>
              <Text style={{ color: theme.textMuted }}>{routines.length ? `${planningDays.filter((day) => day && day !== REST_DAY).length} días de entrenamiento · ${planningDays.filter((day) => day === REST_DAY).length} descansos explícitos por semana. Puedes ajustar cada semana después.` : 'Primero puedes crear una rutina; no necesitas un mesociclo para empezar a entrenar.'}</Text>
              {!routines.length ? <GlassButton title="Crear una rutina primero" variant="secondary" onPress={() => router.push('/routine/create')} /> : null}
              <Text style={{ color: theme.textMuted }}>1. Define el bloque · 2. Distribuye rutinas y descansos · 3. Revisa el calendario antes de entrenar.</Text>
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
  week: { borderTopWidth: 1, gap: 8, marginTop: 14, paddingTop: 12 },
  weekTitle: { fontSize: 15, fontWeight: '800' },
  routineChoices: { gap: 6 },
  routineChoice: { borderWidth: 1, borderRadius: 10, padding: 9 },
  spacer: { height: 12 },
});
