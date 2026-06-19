import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { MuscleGroupSelector } from '../../components/MuscleGroupSelector';
import { GlassButton, GlassInput } from '../../components/UI';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { MuscleGroup } from '../../types';

export default function CreateRoutineScreen() {
  const { theme } = useTheme();
  const { addRoutine } = useData();
  const [name, setName] = useState('');
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [nameError, setNameError] = useState('');
  const [muscleGroupsError, setMuscleGroupsError] = useState('');

  const handleCreate = () => {
    const trimmedName = name.trim();

    setNameError(trimmedName ? '' : 'Ingresá un nombre para la rutina.');
    setMuscleGroupsError(
      muscleGroups.length > 0 ? '' : 'Seleccioná al menos un grupo muscular.',
    );

    if (!trimmedName || muscleGroups.length === 0) return;

    const routine = addRoutine(trimmedName, muscleGroups);
    router.replace(`/routine/${routine.id}`);
  };

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <AppScreenHeader title="Nueva Rutina" subtitle="Nombre y grupos musculares" />

            <GlassCard>
              <GlassInput
                placeholder="Ej: Push Day, Piernas, Full Body..."
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (text.trim()) setNameError('');
                }}
                autoFocus
              />
              {nameError ? (
                <Text style={[styles.errorText, { color: theme.secondary }]}>{nameError}</Text>
              ) : null}
            </GlassCard>

            <GlassCard style={styles.sectionCard}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Grupos musculares</Text>
              <MuscleGroupSelector
                value={muscleGroups}
                onChange={(next) => {
                  setMuscleGroups(next);
                  if (next.length > 0) setMuscleGroupsError('');
                }}
              />
              {muscleGroupsError ? (
                <Text style={[styles.errorText, { color: theme.secondary }]}>
                  {muscleGroupsError}
                </Text>
              ) : null}
            </GlassCard>

            <View style={styles.actions}>
              <GlassButton title="Crear rutina" onPress={handleCreate} />
              <View style={styles.spacer} />
              <GlassButton title="Cancelar" onPress={() => router.back()} variant="secondary" />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    padding: 20,
  },
  scroll: {
    paddingBottom: 40,
  },
  sectionCard: {
    marginTop: 14,
  },
  label: {
    fontSize: 13,
    marginBottom: 10,
  },
  errorText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
  },
  actions: {
    marginTop: 24,
  },
  spacer: {
    height: 12,
  },
});
