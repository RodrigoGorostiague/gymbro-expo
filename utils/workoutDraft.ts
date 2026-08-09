import { ActiveWorkoutDraft, Exercise, ExerciseDefinition, Routine, RoutineExercise, RoutineSet, SetType } from '../types';

type IdFactory = () => string;

export interface SessionSetValue {
  weight: string;
  reps: string;
}

export function nextEffectiveSessionSetNumber(sets: readonly RoutineSet[]): number {
  return Math.max(0, ...sets.map((set) => typeof set.tipo === 'number' ? set.tipo : 0)) + 1;
}

/** Mirrors routine set-type selection without touching the routine template. */
export function withSessionSetType(sets: readonly RoutineSet[], setId: string, type: 'C' | 'effective' | 'F'): RoutineSet[] {
  const current = sets.find((set) => set.id === setId);
  if (!current) return [...sets];
  const tipo: SetType = type === 'effective'
    ? (typeof current.tipo === 'number' ? current.tipo : nextEffectiveSessionSetNumber(sets))
    : type;
  return sets.map((set) => set.id === setId ? { ...set, tipo, ...(type === 'F' ? { reps: 0 } : {}) } : set);
}

/** Reconciles runtime inputs with a changed snapshot, dropping removed set keys and seeding additions. */
export function reconcileSessionSetValues(routine: Routine, current: Readonly<Record<string, SessionSetValue>>): Record<string, SessionSetValue> {
  const values: Record<string, SessionSetValue> = {};
  for (const exercise of routine.exercises) {
    for (const set of exercise.sets) {
      const key = `${exercise.id}-${set.id}`;
      values[key] = current[key] ?? {
        weight: set.weight ? String(set.weight) : '',
        reps: set.tipo === 'F' ? '0' : set.reps ? String(set.reps) : '',
      };
    }
  }
  return values;
}

/** A session-owned prescription. It deliberately never returns references into a routine template. */
export function snapshotWorkoutRoutine(routine: Routine): Routine {
  return {
    ...routine,
    muscleGroups: [...(routine.muscleGroups ?? [])],
    exercises: routine.exercises.map((exercise) => ({
      ...exercise,
      muscleGroups: [...(exercise.muscleGroups ?? [])],
      attribution: exercise.attribution ? { ...exercise.attribution, secondary: [...exercise.attribution.secondary], ...(exercise.attribution.weights ? { weights: { ...exercise.attribution.weights } } : {}) } : undefined,
      catalog: exercise.catalog ? { ...exercise.catalog, muscleParticipations: exercise.catalog.muscleParticipations.map((participation) => ({ ...participation })) } : undefined,
      definitionSnapshot: exercise.definitionSnapshot ? { ...exercise.definitionSnapshot, muscleGroups: [...exercise.definitionSnapshot.muscleGroups] } : undefined,
      sets: (exercise.sets ?? []).map((set) => ({ ...set })),
    })),
  };
}

export function moveWorkoutExercise(routine: Routine, from: number, to: number): Routine {
  if (from < 0 || to < 0 || from >= routine.exercises.length || to >= routine.exercises.length || from === to) return routine;
  const exercises = [...routine.exercises];
  const [exercise] = exercises.splice(from, 1);
  exercises.splice(to, 0, exercise);
  return { ...routine, exercises };
}

export function createSessionExercise(exercise: Exercise, definitions: readonly ExerciseDefinition[], nextId: IdFactory): RoutineExercise {
  const definition = definitions.find((candidate) => candidate.id === exercise.id);
  const sourceSets = exercise.defaultSets.length ? exercise.defaultSets : [{ id: 'default', tipo: 1 as const, weight: 0, reps: 8 }];
  return {
    id: nextId(),
    catalogExerciseId: exercise.id,
    definitionId: definition?.id,
    definitionSnapshot: definition ? { id: definition.id, name: definition.name, muscleGroups: [...definition.muscleGroups], loadMode: definition.loadMode, loadUnit: definition.loadUnit, variant: definition.variant } : undefined,
    name: exercise.name,
    muscleGroups: [...exercise.muscleGroups],
    loadMode: exercise.loadMode,
    loadUnit: exercise.loadUnit,
    attribution: exercise.attribution ? { ...exercise.attribution, secondary: [...exercise.attribution.secondary], ...(exercise.attribution.weights ? { weights: { ...exercise.attribution.weights } } : {}) } : undefined,
    catalog: exercise.catalog ? { ...exercise.catalog, muscleParticipations: exercise.catalog.muscleParticipations.map((participation) => ({ ...participation })) } : undefined,
    variant: exercise.variant,
    sets: sourceSets.map((set) => ({ id: nextId(), tipo: set.tipo, weight: set.weight, reps: set.reps })),
  };
}

export function appendSessionExercise(routine: Routine, exercise: Exercise, definitions: readonly ExerciseDefinition[], nextId: IdFactory): Routine {
  return { ...routine, exercises: [...routine.exercises, createSessionExercise(exercise, definitions, nextId)] };
}

/** Updates only an unfinished exercise prescription in the active session snapshot. */
export function updateSessionExerciseSets(
  routine: Routine,
  exerciseId: string,
  completedSets: Readonly<Record<string, boolean>>,
  update: (sets: readonly RoutineSet[]) => RoutineSet[],
  _nextId: IdFactory,
): Routine {
  const exercise = routine.exercises.find((candidate) => candidate.id === exerciseId);
  if (!exercise || exercise.sets.some((set) => completedSets[`${exercise.id}-${set.id}`])) return routine;
  return { ...routine, exercises: routine.exercises.map((candidate) => candidate.id === exerciseId ? { ...candidate, sets: update(candidate.sets) } : candidate) };
}

export function draftWithRoutineSnapshot(draft: ActiveWorkoutDraft, routine: Routine): ActiveWorkoutDraft {
  return { ...draft, routineSnapshot: snapshotWorkoutRoutine(routine) };
}
