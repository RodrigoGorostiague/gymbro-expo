import { Mesocycle, Routine } from '../types';
import { supabase, supabaseConfigurationError } from './supabase';

export interface TrainingLibrary {
  routines: Routine[];
  mesocycles: Mesocycle[];
}

function requireTrainingClient() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'La planificación remota no está configurada.');
  return supabase;
}

export async function loadTrainingLibrary(): Promise<TrainingLibrary> {
  const { data, error } = await requireTrainingClient().rpc('load_training_library');
  if (error) throw new Error(`No se pudo cargar la planificación: ${error.message}`);
  const value = data as Partial<TrainingLibrary> | null;
  return {
    routines: Array.isArray(value?.routines) ? value.routines : [],
    mesocycles: Array.isArray(value?.mesocycles) ? value.mesocycles : [],
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
