import { setLoadBasis } from './setPrescription';
import { Routine, RoutineExercise, RoutineSet } from '../types';
import { normalizeDecimalInput } from './decimalInput';
import { normalizeSessionSetNumbers } from './workoutDraft';

export const routineInputKey = (exerciseId: string, setId: string) =>
  JSON.stringify([exerciseId, setId]);

export interface RoutineEditorDraft {
  version: 1;
  owner: string;
  sourceId: string;
  operationId: string;
  base: Routine | null;
  routine: Routine;
  inputs: Record<
    string,
    { weight: string; reps: string; durationSeconds?: string }
  >;
}

export function seedRoutineDraft(
  owner: string,
  sourceId: string,
  routine: Routine,
  operationId: string,
  base: Routine | null,
): RoutineEditorDraft {
  return {
    version: 1,
    owner,
    sourceId,
    operationId,
    base,
    routine: {
      ...routine,
      exercises: routine.exercises.map((exercise) => ({
        ...exercise,
        sets: normalizeSessionSetNumbers(exercise.sets),
      })),
    },
    inputs: Object.fromEntries(
      routine.exercises.flatMap((exercise) =>
        exercise.sets.map((set) => [
          routineInputKey(exercise.id, set.id),
          {
            weight: String(set.weight),
            reps: String(set.reps),
            ...(set.durationSeconds !== undefined
              ? { durationSeconds: String(set.durationSeconds) }
              : {}),
          },
        ]),
      ),
    ),
  };
}

/** Labels are derived; a series keeps its identity, prescription and text inputs. */
export function editRoutineSets(
  draft: RoutineEditorDraft,
  exerciseId: string,
  edit: (sets: RoutineSet[]) => RoutineSet[],
): RoutineEditorDraft {
  return {
    ...draft,
    routine: {
      ...draft.routine,
      exercises: draft.routine.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: normalizeSessionSetNumbers(edit(exercise.sets)),
            }
          : exercise,
      ),
    },
  };
}

export function appendRoutineExercises(
  draft: RoutineEditorDraft,
  exercises: RoutineExercise[],
): RoutineEditorDraft {
  return {
    ...draft,
    routine: {
      ...draft.routine,
      exercises: [...draft.routine.exercises, ...exercises],
    },
    inputs: {
      ...draft.inputs,
      ...Object.fromEntries(
        exercises.flatMap((exercise) =>
          exercise.sets.map((set) => [
            routineInputKey(exercise.id, set.id),
            {
              weight: String(set.weight),
              reps: String(set.reps),
              ...(set.durationSeconds !== undefined
                ? { durationSeconds: String(set.durationSeconds) }
                : {}),
            },
          ]),
        ),
      ),
    },
  };
}

export function prepareRoutineSave(draft: RoutineEditorDraft): Routine {
  const name = draft.routine.name.trim();
  if (!name || name.length > 120)
    throw new Error('Escribe un nombre de entre 1 y 120 caracteres.');
  if (draft.routine.exercises.length > 100)
    throw new Error('La rutina admite hasta 100 ejercicios.');
  if (!draft.routine.exercises.length)
    throw new Error('Agrega al menos un ejercicio.');
  const exercises = draft.routine.exercises.map((exercise) => {
    if (exercise.sets.length > 100)
      throw new Error(`${exercise.name}: el máximo es 100 series.`);
    if (!exercise.sets.length)
      throw new Error(
        `${exercise.name}: agrega al menos una serie o elimina el ejercicio.`,
      );
    const sets = exercise.sets.map((set) => {
      const input = draft.inputs[routineInputKey(exercise.id, set.id)];
      const weight =
        setLoadBasis(exercise, set) === 'bodyweight'
          ? 0
          : normalizeDecimalInput(input?.weight ?? String(set.weight));
      const timed = set.durationSeconds !== undefined;
      const durationSeconds = timed
        ? normalizeDecimalInput(
            input?.durationSeconds ?? String(set.durationSeconds),
          )
        : undefined;
      if (
        timed &&
        (durationSeconds == null ||
          !Number.isInteger(durationSeconds) ||
          durationSeconds <= 0 ||
          durationSeconds > 86400)
      )
        throw new Error(
          `${exercise.name}: indica una duración en segundos mayor que cero.`,
        );
      const reps = timed
        ? 0
        : set.tipo === 'F' && !input?.reps.trim()
          ? 0
          : normalizeDecimalInput(input?.reps ?? String(set.reps));
      if (weight === null || weight > 10000)
        throw new Error(
          `${exercise.name}, serie ${set.tipo}: revisa la carga.`,
        );
      if (
        reps === null ||
        !Number.isInteger(reps) ||
        reps > 1000 ||
        (reps === 0 && set.tipo !== 'F' && !timed)
      )
        throw new Error(
          `${exercise.name}, serie ${set.tipo}: indica repeticiones enteras mayores que cero.`,
        );
      return {
        ...set,
        weight,
        reps,
        ...(timed ? { durationSeconds: durationSeconds! } : {}),
      };
    });
    return { ...exercise, sets: normalizeSessionSetNumbers(sets) };
  });
  const muscleGroups = draft.routine.muscleGroups.length
    ? draft.routine.muscleGroups
    : [...new Set(exercises.flatMap((exercise) => exercise.muscleGroups))];
  if (!muscleGroups.length)
    throw new Error('Selecciona al menos un grupo muscular.');
  return { ...draft.routine, name, muscleGroups, exercises };
}
