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
