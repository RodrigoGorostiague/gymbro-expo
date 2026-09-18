import { Mesocycle, Routine } from '../types';
import { supabase, supabaseConfigurationError } from './supabase';

export interface RevisedCollection<T> {
  revision: number;
  items: T[];
}

export interface TrainingLibrary {
  routines: Routine[];
  mesocycles: Mesocycle[];
  routinesRevision: number;
  mesocyclesRevision: number;
}

export interface SaveCollectionInput<T> {
  expectedRevision: number;
  items: T[];
}

export class TrainingLibraryConflictError<T> extends Error {
  readonly name = 'TrainingLibraryConflictError';

  constructor(
    readonly collection: 'routines' | 'mesocycles',
    readonly expectedRevision: number,
    readonly attemptedItems: T[],
    readonly current: RevisedCollection<T>,
  ) {
    super('La planificación cambió en otro dispositivo. Recarga y concilia tus cambios antes de guardar.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
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

function isMesocycle(value: unknown, routineIds?: ReadonlySet<string>): value is Mesocycle {
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
        && (!routineIds || routineIds.has(entry.ref.routineId)) && typeof entry.ref.routineName === 'string'
        && ['local', 'shared'].includes(entry.ref.source as string)))));
}

function requireTrainingClient() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'La planificación remota no está configurada.');
  return supabase;
}

function parseCollection<T>(
  value: unknown,
  isItem: (candidate: unknown) => candidate is T,
): RevisedCollection<T> | null {
  if (!isRecord(value) || !isRevision(value.revision) || !Array.isArray(value.items)) return null;
  const ids = new Set<string>();
  if (!value.items.every((item) => isItem(item)
    && !ids.has((item as { id: string }).id)
    && !!ids.add((item as { id: string }).id))) return null;
  return { revision: value.revision, items: value.items };
}

function normalizeMesocycles(items: Mesocycle[]): Mesocycle[] {
  return items.map((mesocycle) => mesocycle.status === 'paused' && (typeof mesocycle.pausedAt !== 'string' || Number.isNaN(Date.parse(mesocycle.pausedAt)))
    ? { ...mesocycle, status: 'active', pausedAt: undefined, pausedOn: undefined }
    : mesocycle);
}

export async function loadTrainingLibrary(): Promise<TrainingLibrary> {
  const client = requireTrainingClient();
  const [routineResponse, mesocycleResponse] = await Promise.all([
    client.rpc('load_routines_v2'),
    client.rpc('load_mesocycles_v2'),
  ]);
  if (routineResponse.error) throw new Error(`No se pudo cargar la planificación: ${routineResponse.error.message}`);
  if (mesocycleResponse.error) throw new Error(`No se pudo cargar la planificación: ${mesocycleResponse.error.message}`);

  const routines = parseCollection(routineResponse.data, isRoutine);
  if (!routines) throw new Error('La planificación remota tiene contenido inválido. Inténtalo nuevamente.');
  const routineIds = new Set(routines.items.map(({ id }) => id));
  const mesocycles = parseCollection(mesocycleResponse.data, (value): value is Mesocycle => isMesocycle(value, routineIds));
  if (!mesocycles) throw new Error('La planificación remota tiene contenido inválido. Inténtalo nuevamente.');

  return {
    routines: routines.items,
    mesocycles: normalizeMesocycles(mesocycles.items),
    routinesRevision: routines.revision,
    mesocyclesRevision: mesocycles.revision,
  };
}

async function saveCollection<T>(
  collection: 'routines' | 'mesocycles',
  rpcName: 'save_routines_v2' | 'save_mesocycles_v2',
  input: SaveCollectionInput<T>,
  isItem: (candidate: unknown) => candidate is T,
): Promise<RevisedCollection<T>> {
  const { data, error } = await requireTrainingClient().rpc(rpcName, { input });
  if (error) throw new Error(`No se pudo guardar la planificación: ${error.message}`);
  if (!isRecord(data) || (data.status !== 'saved' && data.status !== 'conflict')) {
    throw new Error('La respuesta remota de planificación tiene un formato inválido. Inténtalo nuevamente.');
  }
  const value = parseCollection(data.status === 'saved' ? data.collection : data.current, isItem);
  if (!value) throw new Error('La respuesta remota de planificación tiene contenido inválido. Inténtalo nuevamente.');
  if (data.status === 'conflict') {
    throw new TrainingLibraryConflictError(collection, input.expectedRevision, input.items, value);
  }
  return value;
}

export function saveTrainingRoutines(input: SaveCollectionInput<Routine>): Promise<RevisedCollection<Routine>> {
  return saveCollection('routines', 'save_routines_v2', input, isRoutine);
}

export async function saveTrainingMesocycles(input: SaveCollectionInput<Mesocycle>): Promise<RevisedCollection<Mesocycle>> {
  const saved = await saveCollection('mesocycles', 'save_mesocycles_v2', input, isMesocycle);
  return { ...saved, items: normalizeMesocycles(saved.items) };
}
