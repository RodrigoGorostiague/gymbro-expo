import { MuscleGroup } from '../types';

export const MUSCLE_GROUP_OPTIONS: { value: MuscleGroup; label: string }[] = [
  { value: 'pecho', label: 'Pecho' },
  { value: 'espalda', label: 'Espalda' },
  { value: 'cuadriceps', label: 'Cuádriceps' },
  { value: 'femorales', label: 'Femorales' },
  { value: 'gemelos', label: 'Gemelos' },
  { value: 'hombros', label: 'Hombros' },
  { value: 'bíceps', label: 'Bíceps' },
  { value: 'tríceps', label: 'Tríceps' },
  { value: 'core', label: 'Core' },
  { value: 'glúteos', label: 'Glúteos' },
  { value: 'trapecio', label: 'Trapecio' },
  { value: 'antebrazos', label: 'Antebrazos' },
  { value: 'aductores', label: 'Aductores' },
  { value: 'abductores', label: 'Abductores' },
  { value: 'dorsales', label: 'Dorsales' },
  { value: 'fullBody', label: 'Cuerpo completo' },
];

export const MUSCLE_GROUP_LABELS = Object.fromEntries(
  MUSCLE_GROUP_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<MuscleGroup, string>;

export const CANONICAL_MUSCLE_GROUP_IDS = MUSCLE_GROUP_OPTIONS.map(({ value }) => value) as readonly MuscleGroup[];

export function isCanonicalMuscleGroup(value: unknown): value is MuscleGroup {
  return typeof value === 'string' && CANONICAL_MUSCLE_GROUP_IDS.includes(value as MuscleGroup);
}

function normalizedMuscleGroupName(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

const MUSCLE_GROUP_BY_NORMALIZED_NAME = new Map(
  MUSCLE_GROUP_OPTIONS.flatMap(({ value, label }) => [
    [normalizedMuscleGroupName(value), value],
    [normalizedMuscleGroupName(label), value],
  ]),
);

export function canonicalMuscleGroups(values: readonly unknown[]): MuscleGroup[] {
  const groups = values.flatMap((value) => typeof value === 'string'
    ? [MUSCLE_GROUP_BY_NORMALIZED_NAME.get(normalizedMuscleGroupName(value))]
    : []).filter((value): value is MuscleGroup => value !== undefined);
  return [...new Set(groups.length ? groups : ['fullBody'])];
}
