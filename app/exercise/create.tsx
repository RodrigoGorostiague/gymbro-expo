import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { HapticPressable } from '../../components/HapticPressable';
import { MuscleGroupSelector } from '../../components/MuscleGroupSelector';
import { GlassButton, GlassInput } from '../../components/UI';
import { MUSCLE_GROUP_LABELS } from '../../constants/muscleGroups';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { CatalogSet, Exercise, ExerciseLoadMode, ExerciseVariant, LoadUnit, MuscleGroup, SetType } from '../../types';
import { generateId } from '../../utils/storage';

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

const LOAD_MODES: { value: ExerciseLoadMode; label: string }[] = [
  { value: 'external-load', label: 'Carga externa' },
  { value: 'bodyweight', label: 'Peso corporal' },
  { value: 'assisted', label: 'Con asistencia' },
];

export default function ExerciseFormScreen() {
  const { theme } = useTheme();
  const { exerciseId, muscleGroups: muscleGroupsParam, returnToRoutineId } = useLocalSearchParams<{
    exerciseId?: string;
    muscleGroups?: string;
    returnToRoutineId?: string;
  }>();
  const {
    addExercise,
    createVariant,
    deleteVariant,
    getExercise,
    renameVariant,
    updateExercise,
    variants,
  } = useData();
  const existingExercise = useMemo(() => (exerciseId ? getExercise(exerciseId) : undefined), [exerciseId, getExercise]);
  const [name, setName] = useState('');
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>(parsePrefilledGroups(muscleGroupsParam));
  const [primaryMuscle, setPrimaryMuscle] = useState<MuscleGroup | null>(null);
  const [loadMode, setLoadMode] = useState<ExerciseLoadMode>('external-load');
  const [loadUnit, setLoadUnit] = useState<LoadUnit>('kg');
  const [variant, setVariant] = useState<ExerciseVariant>('libre');
  const [defaultSets, setDefaultSets] = useState<CatalogSet[]>([]);
  const [newVariantName, setNewVariantName] = useState('');
  const [editingVariant, setEditingVariant] = useState<ExerciseVariant | null>(null);
  const [editingVariantName, setEditingVariantName] = useState('');
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    if (!existingExercise) return;
    setName(existingExercise.name);
    setMuscleGroups(existingExercise.muscleGroups);
    setPrimaryMuscle(existingExercise.attribution?.primary ?? [...new Set(existingExercise.muscleGroups)].sort()[0] ?? null);
    setLoadMode(existingExercise.loadMode ?? 'external-load');
    setLoadUnit(existingExercise.loadUnit ?? 'kg');
    setVariant(existingExercise.variant);
    setDefaultSets(existingExercise.defaultSets);
  }, [existingExercise]);

  useEffect(() => {
    if (variants.length > 0 && !variants.includes(variant)) setVariant(variants[0]);
  }, [variant, variants]);

  const updateSet = (setId: string, patch: Partial<CatalogSet>) => {
    setDefaultSets((current) => current.map((set) => (set.id === setId ? { ...set, ...patch } : set)));
  };

  const addSet = () => {
    setDefaultSets((current) => [...current, { id: generateId(), tipo: current.length + 1, weight: 0, reps: 0 }]);
  };

  const showMutationError = (error: unknown) => {
    Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Inténtalo nuevamente.');
  };

  const runMutation = async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
    if (isMutating) return undefined;
    setIsMutating(true);
    try {
      return await operation();
    } catch (error) {
      showMutationError(error);
      return undefined;
    } finally {
      setIsMutating(false);
    }
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Validación', 'El nombre no puede estar vacío.');
      return;
    }
    if (muscleGroups.length === 0) {
      Alert.alert('Validación', 'Selecciona al menos un grupo muscular.');
      return;
    }
    if (!primaryMuscle || !muscleGroups.includes(primaryMuscle)) {
      Alert.alert('Validación', 'Selecciona el grupo muscular principal.');
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

    const storedWeights = existingExercise?.attribution?.weights;
    const weights = storedWeights && Object.fromEntries(
      Object.entries(storedWeights).filter(([muscle]) => muscleGroups.includes(muscle as MuscleGroup)),
    );
    const payload: Omit<Exercise, 'id'> = { name: name.trim(), muscleGroups, loadMode, loadUnit,
      attribution: { primary: primaryMuscle, secondary: muscleGroups.filter((muscle) => muscle !== primaryMuscle),
        ...(weights && Object.keys(weights).length > 0 ? { weights } : {}) },
      variant, defaultSets: normalizedSets };

    if (existingExercise) {
      const updated = await runMutation(async () => {
        await updateExercise({ ...existingExercise, ...payload });
        return true;
      });
      if (!updated) return;
      router.back();
      return;
    }

    const createdExercise = await runMutation(() => addExercise(payload));
    if (!createdExercise) return;

    if (returnToRoutineId) {
      router.dismissTo({
        pathname: `/routine/${returnToRoutineId}`,
        params: { addExerciseId: createdExercise.id },
      });
      return;
    }

    router.back();
  };

  const addVariant = async () => {
    const created = await runMutation(() => createVariant(newVariantName));
    if (!created) return;
    setNewVariantName('');
    setVariant(created);
  };

  const saveVariantRename = async () => {
    if (!editingVariant) return;
    const source = editingVariant;
    const renamed = await runMutation(() => renameVariant(source, editingVariantName));
    if (!renamed) return;
    if (variant === source) setVariant(renamed);
    setEditingVariant(null);
    setEditingVariantName('');
  };

  const confirmVariantDelete = (item: ExerciseVariant) => {
    Alert.alert('Eliminar variante', `¿Eliminar "${item}" del catálogo global?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const deleted = await runMutation(async () => {
            await deleteVariant(item);
            return true;
          });
          if (!deleted) return;
          if (variant === item) {
            const nextVariant = variants.find((candidate) => candidate !== item);
            if (nextVariant) setVariant(nextVariant);
          }
          if (editingVariant === item) setEditingVariant(null);
        },
      },
    ]);
  };

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppNavBar onBack={() => { if (!isMutating) router.back(); }} trailing={<Text style={[styles.headerTitle, { color: theme.primary }]}>{existingExercise ? 'Editar' : 'Nuevo'}</Text>} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, { color: theme.text }]}>{existingExercise ? 'Editar ejercicio' : 'Crear ejercicio'}</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>Nombre, grupos musculares, variante y series por defecto.</Text>

            <GlassCard style={styles.section}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Nombre</Text>
               <GlassInput value={name} onChangeText={setName} placeholder="Ej.: Press de banca" autoFocus={!existingExercise} />
            </GlassCard>

            <GlassCard style={styles.section}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Grupos musculares</Text>
              <MuscleGroupSelector value={muscleGroups} onChange={setMuscleGroups} />
              <Text style={[styles.label, { color: theme.textMuted, marginTop: 14 }]}>Grupo muscular principal</Text>
              <View style={styles.rowWrap}>{muscleGroups.map((muscle) => <HapticPressable key={muscle}
                onPress={() => setPrimaryMuscle(muscle)} style={[styles.optionChip, { borderColor: theme.glassBorder,
                  backgroundColor: primaryMuscle === muscle ? theme.primary : theme.glass }]}>
                <Text style={{ color: primaryMuscle === muscle ? theme.onPrimary : theme.text, fontWeight: '700' }}>{MUSCLE_GROUP_LABELS[muscle]}</Text>
              </HapticPressable>)}</View>
            </GlassCard>

            <GlassCard style={styles.section}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Modo de carga</Text>
              <View style={styles.rowWrap}>{LOAD_MODES.map((item) => <HapticPressable key={item.value}
                onPress={() => setLoadMode(item.value)} style={[styles.optionChip, { borderColor: theme.glassBorder,
                  backgroundColor: loadMode === item.value ? theme.primary : theme.glass }]}>
                <Text style={{ color: loadMode === item.value ? theme.onPrimary : theme.text, fontWeight: '700' }}>{item.label}</Text>
              </HapticPressable>)}</View>
              <Text style={[styles.label, { color: theme.textMuted, marginTop: 14 }]}>Unidad</Text>
              <View style={styles.rowWrap}>{(['kg', 'lb'] as const).map((unit) => <HapticPressable key={unit}
                onPress={() => setLoadUnit(unit)} style={[styles.optionChip, { borderColor: theme.glassBorder,
                  backgroundColor: loadUnit === unit ? theme.primary : theme.glass }]}>
                <Text style={{ color: loadUnit === unit ? theme.onPrimary : theme.text, fontWeight: '700' }}>{unit}</Text>
              </HapticPressable>)}</View>
            </GlassCard>

            <GlassCard style={styles.section}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Variante</Text>
              <View style={styles.rowWrap}>
                {variants.map((item) => {
                  const selected = item === variant;
                  return (
                    <HapticPressable key={item} disabled={isMutating} onPress={() => setVariant(item)} style={[styles.optionChip, { backgroundColor: selected ? theme.primary : theme.glass, borderColor: theme.glassBorder, opacity: isMutating ? 0.7 : 1 }]}>
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

               {defaultSets.length === 0 ? <Text style={{ color: theme.textMuted }}>Sin series. Puedes guardar así o agregar algunas.</Text> : null}

              {defaultSets.map((set) => {
                const isFailure = set.tipo === 'F';
                return (
                  <View key={set.id} style={styles.setRow}>
                    <GlassInput style={styles.typeInput} value={String(set.tipo)} placeholder="Tipo" autoCapitalize="characters" onChangeText={(text) => updateSet(set.id, { tipo: text as unknown as SetType, reps: text.trim().toUpperCase() === 'F' ? 0 : set.reps })} />
                    <GlassInput style={styles.setInput} keyboardType="numeric" value={set.weight ? String(set.weight) : ''} placeholder={loadUnit} onChangeText={(text) => updateSet(set.id, { weight: parseFloat(text) || 0 })} />
                     <GlassInput style={styles.setInput} keyboardType="numeric" editable={!isFailure} value={isFailure ? '' : set.reps ? String(set.reps) : ''} placeholder={isFailure ? '—' : 'repeticiones'} onChangeText={(text) => updateSet(set.id, { reps: parseInt(text, 10) || 0 })} />
                    <HapticPressable onPress={() => setDefaultSets((current) => current.filter((item) => item.id !== set.id))}><Text style={{ color: theme.textMuted }}>✕</Text></HapticPressable>
                  </View>
                );
              })}
            </GlassCard>

            <GlassCard style={[styles.section, styles.variantManager]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Administrar variantes</Text>
              <Text style={[styles.managerHint, { color: theme.textMuted }]}>Estos cambios se aplican al catálogo global de ambos perfiles.</Text>

              <View style={styles.createVariantRow}>
                <GlassInput
                  style={styles.variantInput}
                  value={newVariantName}
                  onChangeText={setNewVariantName}
                  placeholder="Nueva variante"
                  editable={!isMutating}
                  maxLength={80}
                />
                <HapticPressable disabled={isMutating} onPress={addVariant}>
                  <Text style={[styles.link, { color: theme.primary, opacity: isMutating ? 0.6 : 1 }]}>Crear</Text>
                </HapticPressable>
              </View>

              {variants.map((item) => (
                <View key={item} style={[styles.variantRow, { borderColor: theme.glassBorder }]}>
                  {editingVariant === item ? (
                    <GlassInput
                      style={styles.variantInput}
                      value={editingVariantName}
                      onChangeText={setEditingVariantName}
                      editable={!isMutating}
                      autoFocus
                      maxLength={80}
                    />
                  ) : (
                    <Text style={[styles.variantName, { color: theme.text }]}>{item}</Text>
                  )}
                  {editingVariant === item ? (
                    <>
                      <HapticPressable disabled={isMutating} onPress={saveVariantRename}>
                        <Text style={[styles.inlineAction, { color: theme.primary }]}>Guardar</Text>
                      </HapticPressable>
                      <HapticPressable disabled={isMutating} onPress={() => setEditingVariant(null)}>
                        <Text style={[styles.inlineAction, { color: theme.textMuted }]}>Cancelar</Text>
                      </HapticPressable>
                    </>
                  ) : (
                    <>
                      <HapticPressable
                        disabled={isMutating}
                        onPress={() => {
                          setEditingVariant(item);
                          setEditingVariantName(item);
                        }}
                      >
                        <Text style={[styles.inlineAction, { color: theme.primary }]}>Renombrar</Text>
                      </HapticPressable>
                      <HapticPressable disabled={isMutating} onPress={() => confirmVariantDelete(item)}>
                        <Text style={[styles.inlineAction, { color: '#C0392B' }]}>Eliminar</Text>
                      </HapticPressable>
                    </>
                  )}
                </View>
              ))}
            </GlassCard>

            <GlassButton title={existingExercise ? 'Guardar cambios' : 'Crear ejercicio'} onPress={save} disabled={isMutating} loading={isMutating} />
            <View style={styles.spacer} />
            <GlassButton title="Cancelar" onPress={() => router.back()} variant="secondary" disabled={isMutating} />
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
  managerHint: { fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 14 },
  variantManager: { marginTop: 10 },
  createVariantRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  variantRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  variantInput: { flex: 1, paddingVertical: 9 },
  variantName: { flex: 1, fontSize: 15, fontWeight: '700' },
  inlineAction: { fontSize: 13, fontWeight: '800' },
  link: { fontSize: 14, fontWeight: '800' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  typeInput: { width: 74, paddingVertical: 10 },
  setInput: { flex: 1, paddingVertical: 10 },
  spacer: { height: 12 },
});
