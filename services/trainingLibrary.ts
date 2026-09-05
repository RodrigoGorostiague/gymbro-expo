import { Mesocycle, Routine } from '../types';
import { supabase, supabaseConfigurationError } from './supabase';

export interface TrainingLibrary {
  routines: Routine[];
  mesocycles: Mesocycle[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isRoutine(value: unknown): value is Routine {
  return isRecord(value)
    && typeof value.id === 'string' && value.id.trim().length > 0
    && typeof value.name === 'string' && value.name.trim().length > 0
    && typeof value.createdAt === 'string'
    && Array.isArray(value.muscleGroups) && value.muscleGroups.length > 0
    && Array.isArray(value.exercises)
    && value.exercises.every((exercise) => isRecord(exercise)
      && typeof exercise.id === 'string' && exercise.id.trim().length > 0
      && typeof exercise.name === 'string' && exercise.name.trim().length > 0
      && Array.isArray(exercise.muscleGroups)
      && Array.isArray(exercise.sets));
}

function isMesocycle(value: unknown, routineIds: ReadonlySet<string>): value is Mesocycle {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()
    || typeof value.name !== 'string' || !value.name.trim()
    || !['draft', 'scheduled', 'active', 'completed', 'paused', 'cancelled', 'archived'].includes(value.status as string)
    || !Number.isInteger(value.durationWeeks) || (value.durationWeeks as number) < 1
    || typeof value.createdAt !== 'string' || !Array.isArray(value.weeks)) return false;
  return value.weeks.every((week) => isRecord(week) && typeof week.id === 'string'
    && Number.isInteger(week.weekNumber) && (week.weekNumber as number) > 0
    && Array.isArray(week.entries) && week.entries.length <= 7
    && week.entries.every((entry) => isRecord(entry) && typeof entry.id === 'string' && entry.id.trim()
      && (entry.kind === 'rest' || (isRecord(entry.ref) && typeof entry.ref.routineId === 'string'
        && routineIds.has(entry.ref.routineId) && typeof entry.ref.routineName === 'string'
        && ['local', 'shared'].includes(entry.ref.source as string)))));
}

function requireTrainingClient() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'La planificación remota no está configurada.');
  return supabase;
}

export async function loadTrainingLibrary(): Promise<TrainingLibrary> {
  const { data, error } = await requireTrainingClient().rpc('load_training_library');
  if (error) throw new Error(`No se pudo cargar la planificación: ${error.message}`);
  const value = data as Partial<TrainingLibrary> | null;
  if (!Array.isArray(value?.routines) || !Array.isArray(value.mesocycles)) {
    throw new Error('La planificación remota tiene un formato inválido. Inténtalo nuevamente.');
  }
  const routines = value.routines;
  const routineIds = new Set<string>();
  const mesocycleIds = new Set<string>();
  if (!routines.every((routine) => isRoutine(routine) && !routineIds.has(routine.id) && !!routineIds.add(routine.id))
    || !value.mesocycles.every((mesocycle) => isMesocycle(mesocycle, routineIds)
      && !mesocycleIds.has(mesocycle.id) && !!mesocycleIds.add(mesocycle.id))) {
    throw new Error('La planificación remota tiene contenido inválido. Inténtalo nuevamente.');
  }
  return {
    routines,
    mesocycles: value.mesocycles.map((mesocycle) => mesocycle.status === 'paused' && (typeof mesocycle.pausedAt !== 'string' || Number.isNaN(Date.parse(mesocycle.pausedAt)))
      ? { ...mesocycle, status: 'active', pausedAt: undefined, pausedOn: undefined }
      : mesocycle),
  };
}

export async function saveTrainingLibrary(input: { routines?: Routine[]; mesocycles?: Mesocycle[] }): Promise<void> {
  const { error } = await requireTrainingClient().rpc('save_training_library', {
    routines_input: input.routines ?? null,
    mesocycles_input: input.mesocycles ?? null,
  });
  if (error) throw new Error(`No se pudo guardar la planificación: ${error.message}`);
}

export function saveTrainingRoutines(routines: Routine[]): Promise<void> {
  return saveTrainingLibrary({ routines });
}

export function saveTrainingMesocycles(mesocycles: Mesocycle[]): Promise<void> {
  return saveTrainingLibrary({ mesocycles });
}
