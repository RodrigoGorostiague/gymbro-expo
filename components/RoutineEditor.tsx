import { RoutineBodyMap } from './TrainingBodyMap';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from './AppNavBar';
import { EffortTargetControl } from './EffortTargetControl';
import { RoutineExercisePicker } from './RoutineExercisePicker';
import { GlassCard, ThemeBackground } from './GlassCard';
import { HapticPressable } from './HapticPressable';
import { MuscleGroupSelector } from './MuscleGroupSelector';
import { GlassButton, GlassInput } from './UI';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Exercise, Routine, RoutineSet } from '../types';
import {
  routineSetLabels,
  setLoadBasis,
  moveSetBlock,
} from '../utils/setPrescription';
import { matchesActiveWorkout } from '../utils/activeWorkoutReentry';
import { generateId } from '../utils/storage';
import {
  createSessionExercise,
  moveWorkoutExercise,
} from '../utils/workoutDraft';
import {
  routineInputKey,
  appendRoutineExercises,
  editRoutineSets,
  prepareRoutineSave,
  RoutineEditorDraft,
  seedRoutineDraft,
} from '../utils/routineEditor';
import { removeRoutineDraft } from '../services/routineEditorDraft';
import { useRoutineEditorDraft } from '../hooks/useRoutineEditorDraft';
import { useDirtyExitGuard } from '../hooks/useDirtyExitGuard';

export function RoutineEditor({
  sourceId = 'new',
  addExerciseId,
}: {
  sourceId?: string;
  addExerciseId?: string;
}) {
  const { user } = useAuth();
  const { dataState } = useData();
  if (!user) return null;
  if (dataState === 'loading' && sourceId !== 'new')
    return (
      <ThemeBackground>
        <SafeAreaView style={styles.safe}>
          <AppNavBar onBack={() => router.back()} />
          <Text>Cargando tu biblioteca…</Text>
        </SafeAreaView>
      </ThemeBackground>
    );
  return (
    <Editor
      key={`${user}:${sourceId}`}
      owner={user}
      sourceId={sourceId}
      addExerciseId={addExerciseId}
    />
  );
}

function Editor({
  owner,
  sourceId,
  addExerciseId,
}: {
  owner: string;
  sourceId: string;
  addExerciseId?: string;
}) {
  const {
    exercises: catalog,
    definitions,
    getRoutine,
    saveRoutineDraft,
    activeWorkoutDraft,
    dataState,
    retryData,
  } = useData();
  const { theme } = useTheme();
  const {
    draft,
    status,
    error,
    restored,
    change: changeDraft,
    retry,
    flush,
  } = useRoutineEditorDraft(owner, sourceId, () => {
    const base = sourceId === 'new' ? null : getRoutine(sourceId);
    if (sourceId !== 'new' && !base) return null;
    const operationId = generateId();
    const routine = base ?? {
      id: operationId,
      version: 1,
      name: '',
      muscleGroups: [],
      exercises: [],
      createdAt: new Date().toISOString(),
    };
    return seedRoutineDraft(
      owner,
      sourceId,
      routine,
      operationId,
      base ?? null,
    );
  });
  const [picker, setPicker] = useState<false | 'add' | string>(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showGroups, setShowGroups] = useState(false);
  const [undo, setUndo] = useState<RoutineEditorDraft | null>(null);
  const change: typeof changeDraft = (edit) => {
    if (savingRef.current) return;
    setUndo(null);
    changeDraft(edit);
  };
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Routine | null>(null);
  const [destination, setDestination] = useState<
    'editor' | 'execute' | 'share'
  >('editor');
  const savingRef = useRef(false);
  const autoAdded = useRef<string | null>(null);
  useDirtyExitGuard(
    status === 'writing' || (status === 'error' && !!draft),
    saving,
  );
  useEffect(() => {
    if (!draft || !addExerciseId || autoAdded.current === addExerciseId) return;
    const exercise = catalog.find((item) => item.id === addExerciseId);
    if (!exercise) return;
    autoAdded.current = addExerciseId;
    change((current) =>
      appendRoutineExercises(current, [
        createSessionExercise(exercise, definitions ?? [], generateId),
      ]),
    );
    router.setParams({ addExerciseId: undefined });
  }, [draft, addExerciseId, catalog, definitions, change]);
  useEffect(() => {
    if (!saved || saving || status === 'writing') return;
    if (destination === 'execute')
      router.replace(`/routine/execute/${saved.id}`);
    else if (destination === 'share')
      router.replace({
        pathname: '/community/share-plan',
        params: { kind: 'routine', id: saved.id, name: saved.name },
      });
    else router.replace(`/routine/${saved.id}`);
  }, [saved, saving, status, destination]);
  const destructive = (
    edit: (value: RoutineEditorDraft) => RoutineEditorDraft,
  ) =>
    changeDraft((current) => {
      setUndo(current);
      return edit(current);
    });
  const setEdit = (
    exerciseId: string,
    edit: (sets: RoutineSet[]) => RoutineSet[],
    undoable = false,
  ) =>
    (undoable ? destructive : change)((current) =>
      editRoutineSets(current, exerciseId, edit),
    );
  const duplicateSet = (exerciseId: string, setId?: string, backoff = false) =>
    change((current) => {
      const exercise = current.routine.exercises.find(
        (item) => item.id === exerciseId,
      )!;
      const source =
        exercise.sets.find((set) => set.id === setId) ?? exercise.sets.at(-1);
      const id = generateId();
      const next: RoutineSet = {
        ...(source ?? { weight: 0, reps: 8 }),
        id,
        tipo: setId && source ? source.tipo : 1,
        backoffGroupId: backoff ? generateId() : undefined,
        dropGroupId: setId ? source?.dropGroupId : undefined,
        completed: undefined,
      };
      const position = setId
        ? exercise.sets.findIndex((set) => set.id === setId) + 1
        : exercise.sets.length;
      const result = editRoutineSets(current, exerciseId, (sets) => [
        ...sets.slice(0, position),
        next,
        ...sets.slice(position),
      ]);
      return {
        ...result,
        inputs: {
          ...result.inputs,
          [routineInputKey(exerciseId, id)]: source
            ? {
                ...(current.inputs[routineInputKey(exercise.id, source.id)] ?? {
                  weight: String(source.weight),
                  reps: String(source.reps),
                }),
              }
            : { weight: '0', reps: '8' },
        },
      };
    });
  const toggleDrop = (exerciseId: string, setId?: string) =>
    change((current) => {
      const exercise = current.routine.exercises.find(
        (item) => item.id === exerciseId,
      )!;
      const source = setId
        ? exercise.sets.find((set) => set.id === setId)
        : exercise.sets.at(-1);
      if (setId && source?.dropGroupId) {
        return editRoutineSets(current, exerciseId, (sets) =>
          sets.map((set) =>
            set.dropGroupId === source.dropGroupId
              ? { ...set, dropGroupId: undefined }
              : set,
          ),
        );
      }
      const groupId = generateId();
      const ids = setId ? [setId, generateId()] : [generateId(), generateId()];
      const members = ids.map((id) => ({
        ...(source ?? { weight: 0, reps: 8 }),
        id,
        tipo: 1,
        backoffGroupId: undefined,
        dropGroupId: groupId,
        completed: undefined,
      }));
      const index = setId
        ? exercise.sets.findIndex((set) => set.id === setId)
        : exercise.sets.length;
      const next = editRoutineSets(current, exerciseId, (sets) => [
        ...sets.slice(0, index),
        ...members,
        ...sets.slice(index + (setId ? 1 : 0)),
      ]);
      const input = source
        ? current.inputs[routineInputKey(exerciseId, source.id)]
        : { weight: '0', reps: '8' };
      return {
        ...next,
        inputs: {
          ...next.inputs,
          ...Object.fromEntries(
            ids.map((id) => [routineInputKey(exerciseId, id), { ...input }]),
          ),
        },
      };
    });
  const discardDraft = () =>
    Alert.alert(
      'Descartar borrador',
      'Se perderán los cambios locales y se abrirá la última versión guardada.',
      [
        { text: 'Seguir editando', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () => {
            const base = sourceId === 'new' ? null : getRoutine(sourceId);
            if (sourceId !== 'new' && !base) return;
            const operationId = generateId();
            change(() =>
              seedRoutineDraft(
                owner,
                sourceId,
                base ?? {
                  id: operationId,
                  version: 1,
                  name: '',
                  muscleGroups: [],
                  exercises: [],
                  createdAt: new Date().toISOString(),
                },
                operationId,
                base ?? null,
              ),
            );
          },
        },
      ],
    );
  const selectExercises = (items: Exercise[]) => {
    const additions = items.map((exercise) =>
      createSessionExercise(exercise, definitions ?? [], generateId),
    );
    if (picker === 'add')
      change((current) => appendRoutineExercises(current, additions));
    else
      destructive((current) => {
        const appended = appendRoutineExercises(current, additions);
        return {
          ...appended,
          routine: {
            ...current.routine,
            exercises: current.routine.exercises.map((exercise) =>
              exercise.id === picker ? additions[0] : exercise,
            ),
          },
        };
      });
    setPicker(false);
  };
  const save = async (next: 'editor' | 'execute' | 'share' = 'editor') => {
    if (!draft || savingRef.current) return;
    let routine: Routine;
    try {
      routine = prepareRoutineSave(draft);
    } catch (failure) {
      Alert.alert('Revisa la rutina', (failure as Error).message);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setDestination(next);
    try {
      await flush();
      const result = await saveRoutineDraft(
        routine,
        draft.base,
        draft.operationId,
      );
      // Keep a clean recovery point even if removing the old local entry fails.
      changeDraft(() =>
        seedRoutineDraft(owner, sourceId, result, generateId(), result),
      );
      await removeRoutineDraft(owner, sourceId);
      if (result.id === sourceId && next === 'editor')
        Alert.alert(
          'Rutina guardada',
          'Los cambios ya están guardados en tu biblioteca.',
        );
      else setSaved(result);
    } catch (failure) {
      Alert.alert(
        'No se pudo guardar',
        `${failure instanceof Error ? failure.message : 'Inténtalo nuevamente.'}\nTu borrador se conserva.`,
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const button = (
    label: string,
    onPress: () => void,
    selected = false,
    disabled = false,
  ) => (
    <HapticPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled || saving}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? theme.primary : theme.glassBorder,
          backgroundColor: selected ? theme.primary : theme.glass,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: selected ? theme.onPrimary : theme.text,
          fontWeight: '700',
        }}
      >
        {label}
      </Text>
    </HapticPressable>
  );
  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppNavBar
          onBack={() => router.back()}
          trailing={
            draft && sourceId !== 'new' ? (
              <View style={styles.row}>
                {button('Compartir', () => void save('share'))}
                {matchesActiveWorkout(activeWorkoutDraft, {
                  owner,
                  routineId: sourceId,
                }) ? (
                  <HapticPressable
                    accessibilityLabel={`Continuar ${draft.routine.name}`}
                    onPress={() => router.push(`/routine/execute/${sourceId}`)}
                  >
                    <Text style={{ color: theme.primary }}>Continuar</Text>
                  </HapticPressable>
                ) : (
                  button('Guardar y entrenar', () => void save('execute'))
                )}
              </View>
            ) : undefined
          }
        />
        {!draft ? (
          <View style={styles.section}>
            <Text style={{ color: theme.text }}>
              {error ?? 'Recuperando borrador…'}
            </Text>
            {error && (
              <>
                <GlassButton title="Reintentar recuperación" onPress={retry} />
                <GlassButton
                  title="Actualizar biblioteca"
                  onPress={retryData}
                />
                <GlassButton
                  title="Descartar borrador local"
                  variant="secondary"
                  onPress={() =>
                    Alert.alert(
                      'Descartar borrador local',
                      'Se eliminará el borrador de este dispositivo. La rutina guardada no cambia.',
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Descartar',
                          style: 'destructive',
                          onPress: () => {
                            void removeRoutineDraft(owner, sourceId)
                              .then(retry)
                              .catch(() =>
                                Alert.alert(
                                  'No se pudo descartar',
                                  'Inténtalo nuevamente.',
                                ),
                              );
                          },
                        },
                      ],
                    )
                  }
                />
              </>
            )}
          </View>
        ) : (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scroll}
            >
              {dataState === 'error' && (
                <View>
                  <Text style={{ color: theme.textMuted }}>
                    Biblioteca sin conexión. Puedes seguir editando el borrador
                    local.
                  </Text>
                  {button('Reconectar biblioteca', retryData)}
                </View>
              )}
              <Text style={[styles.title, { color: theme.text }]}>
                {sourceId === 'new' ? 'Crear rutina' : 'Editar rutina'}
              </Text>
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: theme.textMuted }}
              >
                {status === 'writing'
                  ? 'Guardando borrador…'
                  : status === 'saved'
                    ? `${restored ? 'Borrador recuperado · ' : ''}Borrador en este dispositivo`
                    : 'No se pudo guardar el borrador'}
              </Text>
              {button('Descartar borrador', discardDraft)}
              {error && (
                <View>
                  <Text style={{ color: theme.text }}>{error}</Text>
                  {button('Reintentar guardado local', retry)}
                </View>
              )}
              <GlassCard style={styles.section}>
                <GlassInput
                  accessibilityLabel="Nombre de la rutina"
                  placeholder="Nombre de la rutina"
                  value={draft.routine.name}
                  editable={!saving}
                  onChangeText={(name) =>
                    change((current) => ({
                      ...current,
                      routine: { ...current.routine, name },
                    }))
                  }
                />
                <View style={styles.row}>
                  {button(
                    showGroups ? 'Ocultar grupos' : 'Grupos musculares',
                    () => setShowGroups(!showGroups),
                  )}
                  <Text style={{ flex: 1, color: theme.textMuted }}>
                    {draft.routine.muscleGroups.length
                      ? `${draft.routine.muscleGroups.length} seleccionados`
                      : 'Se deducen de tus ejercicios'}
                  </Text>
                </View>
                {showGroups && (
                  <MuscleGroupSelector
                    value={draft.routine.muscleGroups}
                    onChange={(muscleGroups) => {
                      if (!saving)
                        change((current) => ({
                          ...current,
                          routine: { ...current.routine, muscleGroups },
                        }));
                    }}
                  />
                )}
              </GlassCard>
              {draft.routine.exercises.length > 0 && <RoutineBodyMap routine={draft.routine} />}
        {!draft.routine.exercises.length && (
                <GlassCard style={styles.section}>
                  <Text style={{ color: theme.text, fontWeight: '800' }}>
                    Empieza por los ejercicios
                  </Text>
                  <Text style={{ color: theme.textMuted }}>
                    Selecciona varios de una vez. Puedes ajustar el orden y las
                    series después.
                  </Text>
                </GlassCard>
              )}
              {draft.routine.exercises.map((exercise, index) => (
                <GlassCard key={exercise.id} style={styles.section}>
                  <HapticPressable
                    accessibilityRole="button"
                    accessibilityLabel={`${!(expanded[exercise.id] ?? index === 0) ? 'Expandir' : 'Contraer'} ${exercise.name}`}
                    accessibilityState={{
                      expanded: expanded[exercise.id] ?? index === 0,
                    }}
                    onPress={() =>
                      setExpanded((current) => ({
                        ...current,
                        [exercise.id]: !(current[exercise.id] ?? index === 0),
                      }))
                    }
                    style={styles.row}
                  >
                    <Text style={{ color: theme.primary, fontWeight: '900' }}>
                      {index + 1}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.exerciseTitle, { color: theme.text }]}
                      >
                        {exercise.name}
                      </Text>
                      <Text style={{ color: theme.textMuted }}>
                        {exercise.sets.length} series · {exercise.variant}
                      </Text>
                    </View>
                    <Text style={{ color: theme.text }}>
                      {!(expanded[exercise.id] ?? index === 0) ? '+' : '−'}
                    </Text>
                  </HapticPressable>
                  {(expanded[exercise.id] ?? index === 0) && (
                    <>
                      <View style={styles.row}>
                        {button(
                          '↑',
                          () =>
                            change((current) => ({
                              ...current,
                              routine: moveWorkoutExercise(
                                current.routine,
                                index,
                                index - 1,
                              ),
                            })),
                          false,
                          index === 0,
                        )}
                        {button(
                          '↓',
                          () =>
                            change((current) => ({
                              ...current,
                              routine: moveWorkoutExercise(
                                current.routine,
                                index,
                                index + 1,
                              ),
                            })),
                          false,
                          index === draft.routine.exercises.length - 1,
                        )}
                        {button('Reemplazar', () => setPicker(exercise.id))}
                        {button('Eliminar ejercicio', () =>
                          destructive((current) => ({
                            ...current,
                            routine: {
                              ...current.routine,
                              exercises: current.routine.exercises.filter(
                                (item) => item.id !== exercise.id,
                              ),
                            },
                          })),
                        )}
                      </View>
                      <Text style={{ color: theme.textMuted }}>
                        Medida de las series
                      </Text>
                      <View style={styles.row}>
                        {button(
                          'Repeticiones',
                          () =>
                            setEdit(exercise.id, (sets) =>
                              sets.map((set) => ({
                                ...set,
                                durationSeconds: undefined,
                              })),
                            ),
                          exercise.sets.every(
                            (set) => set.durationSeconds === undefined,
                          ),
                        )}
                        {button(
                          'Tiempo',
                          () =>
                            setEdit(exercise.id, (sets) =>
                              sets.map((set) => ({
                                ...set,
                                durationSeconds: set.durationSeconds ?? 30,
                              })),
                            ),
                          exercise.sets.length > 0 &&
                            exercise.sets.every(
                              (set) => set.durationSeconds !== undefined,
                            ),
                        )}
                      </View>
                      <Text style={{ color: theme.textMuted }}>
                        Carga de las series
                      </Text>
                      <View style={styles.row}>
                        {(
                          [
                            ['external', 'Carga externa'],
                            ['bodyweight', 'Peso corporal'],
                            ['added', 'Con lastre'],
                            ['assisted', 'Asistido'],
                          ] as const
                        ).map(([basis, label]) => (
                          <React.Fragment key={basis}>
                            {button(
                              label,
                              () =>
                                setEdit(exercise.id, (sets) =>
                                  sets.map((set) => ({
                                    ...set,
                                    loadBasis: basis,
                                  })),
                                ),
                              exercise.sets.length > 0 &&
                                exercise.sets.every(
                                  (set) =>
                                    setLoadBasis(exercise, set) === basis,
                                ),
                            )}
                          </React.Fragment>
                        ))}
                      </View>
                      {exercise.sets.map((set, setIndex) => (
                        <View
                          key={set.id}
                          style={[
                            styles.set,
                            { borderColor: theme.glassBorder },
                          ]}
                        >
                          <View style={styles.row}>
                            <Text style={{ flex: 1, color: theme.textMuted }}>
                              {set.tipo === 'C'
                                ? 'Calentamiento'
                                : set.tipo === 'F'
                                  ? 'Al fallo'
                                  : `Serie ${routineSetLabels(exercise.sets)[set.id]}`}
                              {set.dropGroupId
                                ? ' · Drop set · sin descanso interno'
                                : set.backoffGroupId
                                  ? ' · Backoff · descanso normal'
                                  : ''}
                            </Text>
                            {button('Eliminar serie', () =>
                              setEdit(
                                exercise.id,
                                (sets) =>
                                  sets.filter((item) => item.id !== set.id),
                                true,
                              ),
                            )}
                          </View>
                          <View style={styles.row}>
                            {(['C', 'effective', 'F'] as const).map((type) => {
                              const selected =
                                type === 'effective'
                                  ? typeof set.tipo === 'number'
                                  : type === set.tipo;
                              return (
                                <HapticPressable
                                  key={type}
                                  accessibilityRole="radio"
                                  accessibilityState={{ selected }}
                                  accessibilityLabel={
                                    type === 'C'
                                      ? 'Calentamiento'
                                      : type === 'F'
                                        ? 'Fallo muscular'
                                        : 'Serie efectiva'
                                  }
                                  disabled={saving}
                                  onPress={() =>
                                    setEdit(exercise.id, (sets) =>
                                      sets.map((item) =>
                                        item.id === set.id
                                          ? {
                                              ...item,
                                              tipo:
                                                type === 'effective' ? 1 : type,
                                              ...(type !== 'effective'
                                                ? {
                                                    dropGroupId: undefined,
                                                    backoffGroupId: undefined,
                                                  }
                                                : {}),
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                  style={[
                                    styles.type,
                                    {
                                      borderColor: selected
                                        ? theme.primary
                                        : theme.glassBorder,
                                      backgroundColor: selected
                                        ? theme.primary
                                        : theme.glass,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={{
                                      color: selected
                                        ? theme.onPrimary
                                        : theme.text,
                                    }}
                                  >
                                    {type === 'effective'
                                      ? typeof set.tipo === 'number'
                                        ? set.tipo
                                        : 'E'
                                      : type}
                                  </Text>
                                </HapticPressable>
                              );
                            })}
                          </View>
                          <View style={styles.row}>
                            {setLoadBasis(exercise, set) === 'bodyweight' ? (
                              <Text style={{ flex: 1, color: theme.textMuted }}>
                                Peso corporal · sin carga adicional
                              </Text>
                            ) : (
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.textMuted }}>
                                  {setLoadBasis(exercise, set) === 'added'
                                    ? 'Lastre'
                                    : setLoadBasis(exercise, set) === 'assisted'
                                      ? 'Asistencia'
                                      : 'Carga'}{' '}
                                  ({exercise.loadUnit ?? 'kg'})
                                </Text>
                                <GlassInput
                                  accessibilityLabel={`Carga de ${exercise.name}, serie ${set.tipo}`}
                                  editable={!saving}
                                  keyboardType="decimal-pad"
                                  value={
                                    draft.inputs[
                                      routineInputKey(exercise.id, set.id)
                                    ]?.weight ?? String(set.weight)
                                  }
                                  onChangeText={(weight) =>
                                    change((current) => ({
                                      ...current,
                                      inputs: {
                                        ...current.inputs,
                                        [routineInputKey(exercise.id, set.id)]:
                                          {
                                            ...current.inputs[
                                              routineInputKey(
                                                exercise.id,
                                                set.id,
                                              )
                                            ],
                                            weight,
                                          },
                                      },
                                    }))
                                  }
                                />
                              </View>
                            )}
                            {set.durationSeconds !== undefined ? (
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.textMuted }}>
                                  Duración (segundos)
                                </Text>
                                <GlassInput
                                  accessibilityLabel={`Duración de ${exercise.name}, serie ${set.tipo}`}
                                  editable={!saving}
                                  keyboardType="number-pad"
                                  value={
                                    draft.inputs[
                                      routineInputKey(exercise.id, set.id)
                                    ]?.durationSeconds ??
                                    String(set.durationSeconds)
                                  }
                                  onChangeText={(durationSeconds) =>
                                    change((current) => ({
                                      ...current,
                                      inputs: {
                                        ...current.inputs,
                                        [routineInputKey(exercise.id, set.id)]:
                                          {
                                            ...current.inputs[
                                              routineInputKey(
                                                exercise.id,
                                                set.id,
                                              )
                                            ],
                                            durationSeconds,
                                          },
                                      },
                                    }))
                                  }
                                />
                              </View>
                            ) : (
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.textMuted }}>
                                  Repeticiones
                                  {set.tipo === 'F' ? ' (opcional)' : ''}
                                </Text>
                                <GlassInput
                                  accessibilityLabel={`Repeticiones de ${exercise.name}, serie ${set.tipo}`}
                                  editable={!saving}
                                  keyboardType="number-pad"
                                  value={
                                    draft.inputs[
                                      routineInputKey(exercise.id, set.id)
                                    ]?.reps ?? String(set.reps)
                                  }
                                  onChangeText={(reps) =>
                                    change((current) => ({
                                      ...current,
                                      inputs: {
                                        ...current.inputs,
                                        [routineInputKey(exercise.id, set.id)]:
                                          {
                                            ...current.inputs[
                                              routineInputKey(
                                                exercise.id,
                                                set.id,
                                              )
                                            ],
                                            reps,
                                          },
                                      },
                                    }))
                                  }
                                />
                              </View>
                            )}
                          </View>
                          {set.dropGroupId && (
                            <Text style={{ color: theme.textMuted }}>
                              Reduce la carga en cada parte; descansa al
                              terminar el bloque.
                            </Text>
                          )}
                          <EffortTargetControl
                            disabled={saving}
                            value={set.effortTarget}
                            onChange={(effortTarget) =>
                              setEdit(exercise.id, (sets) =>
                                sets.map((item) =>
                                  item.id === set.id
                                    ? { ...item, effortTarget }
                                    : item,
                                ),
                              )
                            }
                          />
                          <View style={styles.row}>
                            {button('Duplicar', () =>
                              duplicateSet(exercise.id, set.id),
                            )}
                            {button(
                              '↑ serie',
                              () =>
                                setEdit(exercise.id, (sets) =>
                                  moveSetBlock(sets, set.id, -1),
                                ),
                              false,
                              setIndex === 0,
                            )}
                            {button(
                              '↓ serie',
                              () =>
                                setEdit(exercise.id, (sets) =>
                                  moveSetBlock(sets, set.id, 1),
                                ),
                              false,
                              setIndex === exercise.sets.length - 1,
                            )}
                            {button(
                              'Backoff',
                              () =>
                                setEdit(exercise.id, (sets) =>
                                  sets.map((item) =>
                                    item.id === set.id
                                      ? {
                                          ...item,
                                          tipo: 1,
                                          backoffGroupId: item.backoffGroupId
                                            ? undefined
                                            : generateId(),
                                          dropGroupId: undefined,
                                        }
                                      : item,
                                  ),
                                ),
                              !!set.backoffGroupId,
                            )}
                            {button(
                              'Drop set',
                              () => toggleDrop(exercise.id, set.id),
                              !!set.dropGroupId,
                            )}
                          </View>
                        </View>
                      ))}
                      {!exercise.sets.length && (
                        <Text style={{ color: theme.textMuted }}>
                          Sin series. Agrega una para poder guardar la rutina.
                        </Text>
                      )}
                      <View style={styles.row}>
                        {button('+ Serie', () => duplicateSet(exercise.id))}
                        {button('+ Backoff', () =>
                          duplicateSet(exercise.id, undefined, true),
                        )}
                        {button('+ Drop set', () => toggleDrop(exercise.id))}
                      </View>
                    </>
                  )}
                </GlassCard>
              ))}
            </ScrollView>
            <View style={[styles.footer, { borderColor: theme.glassBorder }]}>
              {undo && (
                <View style={styles.row}>
                  <Text style={{ color: theme.textMuted, flex: 1 }}>
                    Elemento eliminado o reemplazado
                  </Text>
                  {button('Deshacer', () => {
                    change(() => undo);
                    setUndo(null);
                  })}
                </View>
              )}
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <GlassButton
                    title="+ Ejercicios"
                    variant="secondary"
                    disabled={saving}
                    onPress={() => setPicker('add')}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <GlassButton
                    title="Guardar rutina"
                    loading={saving}
                    disabled={status === 'loading'}
                    onPress={() => void save()}
                  />
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}
        {picker && (
          <RoutineExercisePicker
            exercises={catalog}
            replacing={picker !== 'add'}
            onClose={() => setPicker(false)}
            onSelect={selectExercises}
          />
        )}
      </SafeAreaView>
    </ThemeBackground>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  scroll: { paddingBottom: 20, gap: 8 },
  title: { fontSize: 26, fontWeight: '900' },
  exerciseTitle: { fontSize: 17, fontWeight: '800' },
  section: { marginTop: 8, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
  },
  type: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  set: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 10,
    marginTop: 10,
  },
  footer: { paddingVertical: 12, gap: 8, borderTopWidth: 1 },
});
