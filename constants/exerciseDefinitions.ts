import { ExerciseDefinition } from '../types';

const systemDefinition = (definition: Omit<ExerciseDefinition, 'source'>): ExerciseDefinition => Object.freeze({
  ...definition,
  source: Object.freeze({ kind: 'system' as const }),
  muscleGroups: Object.freeze([...definition.muscleGroups]) as unknown as ExerciseDefinition['muscleGroups'],
  defaultSets: Object.freeze(definition.defaultSets.map((set) => Object.freeze({ ...set }))) as unknown as ExerciseDefinition['defaultSets'],
});

export const CANONICAL_EXERCISE_DEFINITIONS: readonly ExerciseDefinition[] = Object.freeze([
  systemDefinition({ id: 'system:barbell-bench-press', name: 'Barbell Bench Press', muscleGroups: ['pecho', 'tríceps'], loadMode: 'external-load', loadUnit: 'kg', variant: 'barra', defaultSets: [] }),
  systemDefinition({ id: 'system:barbell-squat', name: 'Barbell Squat', muscleGroups: ['cuadriceps', 'glúteos'], loadMode: 'external-load', loadUnit: 'kg', variant: 'barra', defaultSets: [] }),
  systemDefinition({ id: 'system:barbell-deadlift', name: 'Barbell Deadlift', muscleGroups: ['femorales', 'espalda'], loadMode: 'external-load', loadUnit: 'kg', variant: 'barra', defaultSets: [] }),
  systemDefinition({ id: 'system:pull-up', name: 'Pull-up', muscleGroups: ['dorsales', 'bíceps'], loadMode: 'bodyweight', loadUnit: 'kg', variant: 'libre', defaultSets: [] }),
  systemDefinition({ id: 'system:overhead-press', name: 'Overhead Press', muscleGroups: ['hombros', 'tríceps'], loadMode: 'external-load', loadUnit: 'kg', variant: 'barra', defaultSets: [] }),
  systemDefinition({ id: 'system:romanian-deadlift', name: 'Romanian Deadlift', muscleGroups: ['femorales', 'glúteos'], loadMode: 'external-load', loadUnit: 'kg', variant: 'barra', defaultSets: [] }),
  systemDefinition({ id: 'system:barbell-row', name: 'Barbell Row', muscleGroups: ['espalda', 'dorsales'], loadMode: 'external-load', loadUnit: 'kg', variant: 'barra', defaultSets: [] }),
  systemDefinition({ id: 'system:plank', name: 'Plank', muscleGroups: ['core'], loadMode: 'bodyweight', loadUnit: 'kg', variant: 'libre', defaultSets: [] }),
]);

export const SYSTEM_DEFINITION_BY_ID = new Map(CANONICAL_EXERCISE_DEFINITIONS.map((definition) => [definition.id, definition]));
