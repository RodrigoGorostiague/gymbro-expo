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
  { value: 'fullBody', label: 'Full Body' },
];

export const MUSCLE_GROUP_LABELS = Object.fromEntries(
  MUSCLE_GROUP_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<MuscleGroup, string>;
