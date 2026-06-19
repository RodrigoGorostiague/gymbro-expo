import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { HapticPressable } from '../../components/HapticPressable';
import { MuscleGroupSelector } from '../../components/MuscleGroupSelector';
import { GlassButton, GlassInput } from '../../components/UI';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { CatalogSet, Exercise, ExerciseVariant, MuscleGroup, SetType } from '../../types';
import { generateId } from '../../utils/storage';

const VARIANTS: ExerciseVariant[] = ['barra', 'mancuernas', 'libre'];

const parseSetType = (value: string): SetType | null => {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'C' || normalized === 'F') return normalized;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parsePrefilledGroups = (value?: string | string[]): MuscleGroup[] => {
  if (!value) return [];
  const source = Array.isArray(value) ? value.join(',') : value;
  return source.split(',').filter(Boolean) as MuscleGroup[];
};

export default function ExerciseFormScreen() {
  const { theme } = useTheme();
  const { exerciseId, muscleGroups: muscleGroupsParam, returnToRoutineId } = useLocalSearchParams<{
    exerciseId?: string;
    muscleGroups?: string;
    returnToRoutineId?: string;
  }>();
  const { addExercise, getExercise, updateExercise } = useData();
  const existingExercise = useMemo(() => (exerciseId ? getExercise(exerciseId) : undefined), [exerciseId, getExercise]);
  const [name, setName] = useState('');
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>(parsePrefilledGroups(muscleGroupsParam));
  const [variant, setVariant] = useState<ExerciseVariant>('libre');
  const [defaultSets, setDefaultSets] = useState<CatalogSet[]>([]);

  useEffect(() => {
    if (!existingExercise) return;
    setName(existingExercise.name);
    setMuscleGroups(existingExercise.muscleGroups);
    setVariant(existingExercise.variant);
    setDefaultSets(existingExercise.defaultSets);
  }, [existingExercise]);

  const updateSet = (setId: string, patch: Partial<CatalogSet>) => {
    setDefaultSets((current) => current.map((set) => (set.id === setId ? { ...set, ...patch } : set)));
  };

  const addSet = () => {
    setDefaultSets((current) => [...current, { id: generateId(), tipo: current.length + 1, weight: 0, reps: 0 }]);
  };

  const save = () => {
    if (!name.trim()) {
      Alert.alert('Validación', 'El nombre no puede estar vacío.');
      return;
    }
    if (muscleGroups.length === 0) {
      Alert.alert('Validación', 'Seleccioná al menos un grupo muscular.');
      return;
    }

    const normalizedSets: CatalogSet[] = [];
    for (const set of defaultSets) {
      const tipo = parseSetType(String(set.tipo));
      if (!tipo) {
        Alert.alert('Validación', 'Cada serie debe tener tipo C, F o un número positivo.');
        return;
      }
      normalizedSets.push({ ...set, tipo, reps: tipo === 'F' ? 0 : set.reps });
    }

    const payload: Omit<Exercise, 'id'> = { name: name.trim(), muscleGroups, variant, defaultSets: normalizedSets };

    if (existingExercise) {
      updateExercise({ ...existingExercise, ...payload });
      router.back();
      return;
    }

    const createdExercise = addExercise(payload);

    if (returnToRoutineId) {
      router.dismissTo({
        pathname: `/routine/${returnToRoutineId}`,
        params: { addExerciseId: createdExercise.id },
      });
      return;
    }

    router.back();
  };

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppNavBar onBack={() => router.back()} trailing={<Text style={[styles.headerTitle, { color: theme.primary }]}>{existingExercise ? 'Editar' : 'Nuevo'}</Text>} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, { color: theme.text }]}>{existingExercise ? 'Editar ejercicio' : 'Crear ejercicio'}</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>Nombre, grupos musculares, variante y series por defecto.</Text>

            <GlassCard style={styles.section}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Nombre</Text>
              <GlassInput value={name} onChangeText={setName} placeholder="Ej: Press banca" autoFocus={!existingExercise} />
            </GlassCard>

            <GlassCard style={styles.section}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Grupos musculares</Text>
              <MuscleGroupSelector value={muscleGroups} onChange={setMuscleGroups} />
            </GlassCard>

            <GlassCard style={styles.section}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Variante</Text>
              <View style={styles.rowWrap}>
                {VARIANTS.map((item) => {
                  const selected = item === variant;
                  return (
                    <HapticPressable key={item} onPress={() => setVariant(item)} style={[styles.optionChip, { backgroundColor: selected ? theme.primary : theme.glass, borderColor: theme.glassBorder }]}>
                      <Text style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: '700' }}>{item}</Text>
                    </HapticPressable>
                  );
                })}
              </View>
            </GlassCard>

            <GlassCard style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Series por defecto</Text>
                <HapticPressable onPress={addSet}><Text style={[styles.link, { color: theme.primary }]}>+ Serie</Text></HapticPressable>
              </View>

              {defaultSets.length === 0 ? <Text style={{ color: theme.textMuted }}>Sin series. Podés guardar así o agregar algunas.</Text> : null}

              {defaultSets.map((set) => {
                const isFailure = set.tipo === 'F';
                return (
                  <View key={set.id} style={styles.setRow}>
                    <GlassInput style={styles.typeInput} value={String(set.tipo)} placeholder="Tipo" autoCapitalize="characters" onChangeText={(text) => updateSet(set.id, { tipo: text as unknown as SetType, reps: text.trim().toUpperCase() === 'F' ? 0 : set.reps })} />
                    <GlassInput style={styles.setInput} keyboardType="numeric" value={set.weight ? String(set.weight) : ''} placeholder="kg" onChangeText={(text) => updateSet(set.id, { weight: parseFloat(text) || 0 })} />
                    <GlassInput style={styles.setInput} keyboardType="numeric" editable={!isFailure} value={isFailure ? '' : set.reps ? String(set.reps) : ''} placeholder={isFailure ? '—' : 'reps'} onChangeText={(text) => updateSet(set.id, { reps: parseInt(text, 10) || 0 })} />
                    <HapticPressable onPress={() => setDefaultSets((current) => current.filter((item) => item.id !== set.id))}><Text style={{ color: theme.textMuted }}>✕</Text></HapticPressable>
                  </View>
                );
              })}
            </GlassCard>

            <GlassButton title={existingExercise ? 'Guardar cambios' : 'Crear ejercicio'} onPress={save} />
            <View style={styles.spacer} />
            <GlassButton title="Cancelar" onPress={() => router.back()} variant="secondary" />
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  link: { fontSize: 14, fontWeight: '800' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  typeInput: { width: 74, paddingVertical: 10 },
  setInput: { flex: 1, paddingVertical: 10 },
  spacer: { height: 12 },
});
