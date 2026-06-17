import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton, GlassInput } from '../../components/UI';
import { useData } from '../../context/DataContext';

export default function CreateRoutineScreen() {
  const { addRoutine } = useData();
  const [name, setName] = useState('');

  const handleCreate = () => {
    if (!name.trim()) return;
    const routine = addRoutine(name.trim());
    router.replace(`/routine/${routine.id}`);
  };

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppScreenHeader title="Nueva Rutina" subtitle="Nombre del mesociclo" />
        <GlassCard>
          <GlassInput
            placeholder="Ej: Push Day, Piernas, Full Body..."
            value={name}
            onChangeText={setName}
            autoFocus
          />
        </GlassCard>
        <View style={styles.actions}>
          <GlassButton title="Crear rutina" onPress={handleCreate} />
          <View style={styles.spacer} />
          <GlassButton title="Cancelar" onPress={() => router.back()} variant="secondary" />
        </View>
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    padding: 20,
  },
  actions: {
    marginTop: 24,
  },
  spacer: {
    height: 12,
  },
});
