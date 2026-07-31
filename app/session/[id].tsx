import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton, GlassInput } from '../../components/UI';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { WorkoutSession } from '../../types';

type SetDraft = {
  weight: string;
  reps: string;
  completed: boolean;
};

type SessionDraft = {
  date: string;
  time: string;
  durationMinutes: string;
  restSeconds: string;
  sets: Record<string, SetDraft>;
};

function toLocalDateTime(value: string): { date: string; time: string } {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function buildDraft(session: WorkoutSession): SessionDraft {
  const local = toLocalDateTime(session.completedAt);
  const sets: Record<string, SetDraft> = {};
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      sets[`${exercise.exerciseId}:${set.setId}`] = {
        weight: String(set.weight),
        reps: String(set.reps),
        completed: set.completed,
      };
    }
  }
  return {
    ...local,
    durationMinutes: String(session.durationSeconds / 60),
    restSeconds: String(session.restTimerSeconds),
    sets,
  };
}

function parseLocalDateTime(dateValue: string, timeValue: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue)) {
    return null;
  }
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hours, minutes] = timeValue.split(':').map(Number);
  const value = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    value.getFullYear() !== year ||
    value.getMonth() !== month - 1 ||
    value.getDate() !== day ||
    value.getHours() !== hours ||
    value.getMinutes() !== minutes
  ) {
    return null;
  }
  return value;
}

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessions, isLoading, updateSession, deleteSession } = useData();
  const { theme } = useTheme();
  const session = sessions.find((item) => item.id === id);
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (session && !draft) setDraft(buildDraft(session));
  }, [draft, session]);

  const updateSetDraft = (key: string, patch: Partial<SetDraft>) => {
    setDraft((current) => current ? {
      ...current,
      sets: { ...current.sets, [key]: { ...current.sets[key], ...patch } },
    } : current);
  };

  const buildEditedSession = (): WorkoutSession | null => {
    if (!session || !draft) return null;
    const initialDateTime = toLocalDateTime(session.completedAt);
    const dateValue = draft.date.trim();
    const timeValue = draft.time.trim();
    const parsedCompletedAt = parseLocalDateTime(dateValue, timeValue);
    if (!parsedCompletedAt) {
      setError('Ingrese una fecha (YYYY-MM-DD) y una hora (HH:MM) válidas.');
      return null;
    }
    const completedAt =
      dateValue === initialDateTime.date && timeValue === initialDateTime.time
        ? session.completedAt
        : parsedCompletedAt.toISOString();
    if (!draft.durationMinutes.trim()) {
      setError('Ingrese la duración del entrenamiento.');
      return null;
    }
    const durationMinutes = Number(draft.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 0) {
      setError('La duración del entrenamiento debe ser un número no negativo.');
      return null;
    }
    if (!draft.restSeconds.trim()) {
      setError('Ingrese la duración del descanso.');
      return null;
    }
    const restSeconds = Number(draft.restSeconds);
    if (!Number.isInteger(restSeconds) || restSeconds < 0) {
      setError('La duración del descanso debe ser una cantidad entera no negativa de segundos.');
      return null;
    }

    const exercises = session.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => {
        const key = `${exercise.exerciseId}:${set.setId}`;
        const editedSet = draft.sets[key];
        if (!editedSet.weight.trim()) {
          throw new Error(`${exercise.name}: ingrese un peso para cada serie.`);
        }
        if (!editedSet.reps.trim()) {
          throw new Error(`${exercise.name}: ingrese las repeticiones de cada serie.`);
        }
        const weight = Number(editedSet.weight);
        const reps = Number(editedSet.reps);
        if (!Number.isFinite(weight) || weight < 0) {
          throw new Error(`${exercise.name}: el peso debe ser un número no negativo.`);
        }
        if (!Number.isInteger(reps) || reps < 0) {
          throw new Error(`${exercise.name}: las repeticiones deben ser una cantidad entera no negativa.`);
        }
        return { ...set, weight, reps, completed: editedSet.completed };
      }),
    }));

    return {
      ...session,
      completedAt,
      durationSeconds: Math.round(durationMinutes * 60),
      restTimerSeconds: restSeconds,
      exercises,
    };
  };

  const handleSave = async () => {
    setError('');
    let edited: WorkoutSession | null;
    try {
      edited = buildEditedSession();
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Revise los valores de las series.');
      return;
    }
    if (!edited || !session) return;

    setIsSaving(true);
    try {
      await updateSession(session.id, edited);
      Alert.alert('Sesión actualizada', 'La sesión de entrenamiento del historial se guardó.', [
        { text: 'Aceptar', onPress: () => router.back() },
      ]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la sesión de entrenamiento. Inténtelo de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!session) return;
    Alert.alert(
      '¿Eliminar la sesión de entrenamiento completada?',
      'Esto elimina permanentemente la entrada del historial local. Las gemas y las recompensas no cambiarán.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setError('');
            setIsDeleting(true);
            try {
              await deleteSession(session.id);
              router.back();
            } catch (deleteError) {
              setError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar la sesión de entrenamiento. Inténtelo de nuevo.');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <ThemeBackground>
        <SafeAreaView style={[styles.safe, styles.center]}>
          <Text style={{ color: theme.textMuted }}>Cargando sesión de entrenamiento...</Text>
        </SafeAreaView>
      </ThemeBackground>
    );
  }

  if (!session || !draft) {
    return (
      <ThemeBackground>
        <SafeAreaView style={styles.safe}>
          <AppNavBar onBack={() => router.back()} />
          <GlassCard>
            <Text style={[styles.missingTitle, { color: theme.text }]}>No se encontró la sesión de entrenamiento</Text>
            <Text style={[styles.help, { color: theme.textMuted }]}>Es posible que ya se haya eliminado.</Text>
          </GlassCard>
        </SafeAreaView>
      </ThemeBackground>
    );
  }

  const busy = isSaving || isDeleting;

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppNavBar onBack={() => router.back()} backLabel="← Progreso" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.title, { color: theme.text }]}>{session.routineName}</Text>
            <Text style={[styles.help, { color: theme.textMuted }]}>Los cambios se aplican únicamente a esta sesión de entrenamiento del historial.</Text>

            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
            ) : null}

            <GlassCard style={styles.card}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Detalles de la sesión</Text>
              <View style={styles.row}>
                <View style={styles.field}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Fecha</Text>
                  <GlassInput
                    accessibilityLabel="Fecha de finalización"
                    editable={!busy}
                    value={draft.date}
                    placeholder="YYYY-MM-DD"
                    autoCapitalize="none"
                    onChangeText={(date) => setDraft({ ...draft, date })}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Hora</Text>
                  <GlassInput
                    accessibilityLabel="Hora de finalización"
                    editable={!busy}
                    value={draft.time}
                    placeholder="HH:MM"
                    keyboardType="numbers-and-punctuation"
                    onChangeText={(time) => setDraft({ ...draft, time })}
                  />
                </View>
              </View>
              <Text style={[styles.label, { color: theme.textMuted }]}>Duración del entrenamiento (minutos)</Text>
              <GlassInput
                accessibilityLabel="Duración del entrenamiento en minutos"
                editable={!busy}
                value={draft.durationMinutes}
                keyboardType="decimal-pad"
                onChangeText={(durationMinutes) => setDraft({ ...draft, durationMinutes })}
              />
              <Text style={[styles.label, styles.spacedLabel, { color: theme.textMuted }]}>Duración del descanso (segundos)</Text>
              <GlassInput
                accessibilityLabel="Duración del descanso en segundos"
                editable={!busy}
                value={draft.restSeconds}
                keyboardType="number-pad"
                onChangeText={(restSeconds) => setDraft({ ...draft, restSeconds })}
              />
            </GlassCard>

            {session.exercises.map((exercise, exerciseIndex) => (
              <GlassCard key={exercise.exerciseId} style={styles.card}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{exerciseIndex + 1}. {exercise.name}</Text>
                {exercise.sets.map((set, setIndex) => {
                  const key = `${exercise.exerciseId}:${set.setId}`;
                  const setDraft = draft.sets[key];
                  return (
                    <View key={set.setId} style={[styles.set, { borderColor: theme.glassBorder }]}>
                      <View style={styles.setHeader}>
                        <Text style={[styles.setTitle, { color: theme.text }]}>Serie {setIndex + 1}</Text>
                        <View style={styles.switchRow}>
                          <Text style={[styles.label, { color: theme.textMuted }]}>Completada</Text>
                          <Switch
                            accessibilityLabel={`${exercise.name}, serie ${setIndex + 1}, completada`}
                            disabled={busy}
                            value={setDraft.completed}
                            trackColor={{ false: theme.glassBorder, true: theme.primary }}
                            thumbColor={theme.text}
                            onValueChange={(completed) => updateSetDraft(key, { completed })}
                          />
                        </View>
                      </View>
                      <View style={styles.row}>
                        <View style={styles.field}>
                          <Text style={[styles.label, { color: theme.textMuted }]}>Peso (kg)</Text>
                          <GlassInput
                            accessibilityLabel={`${exercise.name}, serie ${setIndex + 1}, peso`}
                            editable={!busy}
                            value={setDraft.weight}
                            keyboardType="decimal-pad"
                            onChangeText={(weight) => updateSetDraft(key, { weight })}
                          />
                        </View>
                        <View style={styles.field}>
                          <Text style={[styles.label, { color: theme.textMuted }]}>Repeticiones</Text>
                          <GlassInput
                            accessibilityLabel={`${exercise.name}, serie ${setIndex + 1}, repeticiones`}
                            editable={!busy}
                            value={setDraft.reps}
                            keyboardType="number-pad"
                            onChangeText={(reps) => updateSetDraft(key, { reps })}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </GlassCard>
            ))}

            <GlassButton title="Guardar cambios" onPress={handleSave} loading={isSaving} disabled={busy} />
            <View style={styles.buttonGap} />
            <GlassButton title="Eliminar sesión" onPress={confirmDelete} variant="danger" loading={isDeleting} disabled={busy} />
            <Text style={[styles.rewardNote, { color: theme.textMuted }]}>Editar o eliminar el historial no modifica las gemas ni las recompensas.</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 16 },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '900' },
  help: { fontSize: 13, marginTop: 4, marginBottom: 16 },
  error: { color: '#FFB4AB', fontSize: 14, fontWeight: '700', marginBottom: 12 },
  card: { marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 14 },
  row: { flexDirection: 'row', gap: 10 },
  field: { flex: 1 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  spacedLabel: { marginTop: 12 },
  set: { borderTopWidth: 1, paddingTop: 12, marginTop: 4, marginBottom: 12 },
  setHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  setTitle: { fontSize: 15, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonGap: { height: 10 },
  rewardNote: { fontSize: 12, textAlign: 'center', marginTop: 14 },
  missingTitle: { fontSize: 20, fontWeight: '800' },
});
