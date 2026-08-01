import { CatalogImportPlan, Mesocycle, MesocycleEntry, Routine, WorkoutRecap, WorkoutRecapDetail, WorkoutRecapExercise, WorkoutRecapInput, WorkoutRecapPage, WorkoutRecapSharePayload, WorkoutSession } from '../types';
import { supabase, supabaseConfigurationError } from './supabase';

const PAGE_SIZE = 20;

function requireClient() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'Supabase is unavailable.');
  return supabase;
}

function asRecap(row: unknown): WorkoutRecap {
  const value = row as Record<string, unknown>;
  return {
    id: String(value.id),
    authorAlias: String(value.author_alias),
    routineName: String(value.routine_name),
    completedAt: String(value.completed_at),
    durationSeconds: Number(value.duration_seconds),
    exerciseCount: Number(value.exercise_count),
    muscleGroupIds: Array.isArray(value.muscle_group_ids) ? value.muscle_group_ids.filter((id): id is string => typeof id === 'string') : [],
    metrics: (value.metrics ?? {}) as Record<string, number>,
    caption: typeof value.caption === 'string' ? value.caption : null,
    createdAt: String(value.created_at),
    templateAvailable: value.template_available === true,
    mesocycleAvailable: value.mesocycle_available === true,
    isAuthor: value.is_author === true,
  };
}

function asSharePayload(value: unknown): WorkoutRecapSharePayload | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as WorkoutRecapSharePayload;
  const isRecord = (candidate: unknown): candidate is Record<string, unknown> => !!candidate && typeof candidate === 'object' && !Array.isArray(candidate);
  const hasOnly = (candidate: Record<string, unknown>, keys: readonly string[]) => Object.keys(candidate).every((key) => keys.includes(key)) && keys.every((key) => key in candidate);
  const validLabel = (candidate: unknown, max: number, required = true) => typeof candidate === 'string' && (required ? candidate.trim().length > 0 : true) && candidate.length <= max;
  const validMuscles = (candidate: unknown) => Array.isArray(candidate) && candidate.length >= 1 && candidate.length <= 32 && candidate.every((muscle) => validLabel(muscle, 120));
  const validSet = (set: unknown) => isRecord(set) && hasOnly(set, ['tipo', 'weight', 'reps'])
    && (set.tipo === 'C' || set.tipo === 'F' || (typeof set.tipo === 'number' && Number.isInteger(set.tipo) && set.tipo >= 0 && set.tipo <= 10))
    && typeof set.weight === 'number' && Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 10000
    && typeof set.reps === 'number' && Number.isInteger(set.reps) && set.reps >= 0 && set.reps <= 1000;
  const validRoutine = (routine: unknown): routine is NonNullable<WorkoutRecapSharePayload['routine']> => {
    if (!routine || typeof routine !== 'object') return false;
    const value = routine as Record<string, unknown>;
    return hasOnly(value, ['name', 'muscleGroups', 'exercises']) && validLabel(value.name, 120) && validMuscles(value.muscleGroups) && Array.isArray(value.exercises) && value.exercises.length >= 1 && value.exercises.length <= 100
      && value.exercises.every((exercise) => isRecord(exercise) && hasOnly(exercise, ['name', 'muscleGroups', 'loadMode', 'loadUnit', 'variant', 'sets']) && validLabel(exercise.name, 120) && validMuscles(exercise.muscleGroups) && (exercise.loadMode === 'external-load' || exercise.loadMode === 'bodyweight' || exercise.loadMode === 'assisted') && (exercise.loadUnit === 'kg' || exercise.loadUnit === 'lb') && validLabel(exercise.variant, 120) && Array.isArray(exercise.sets) && exercise.sets.length >= 1 && exercise.sets.length <= 100 && exercise.sets.every(validSet));
  };
  const validMesocycle = (mesocycle: unknown) => {
    if (!isRecord(mesocycle) || !hasOnly(mesocycle, ['name', 'goal', 'durationWeeks', 'weeks', 'routines']) || !validLabel(mesocycle.name, 120) || !validLabel(mesocycle.goal, 500, false) || typeof mesocycle.durationWeeks !== 'number' || !Number.isInteger(mesocycle.durationWeeks) || mesocycle.durationWeeks < 1 || mesocycle.durationWeeks > 52 || !Array.isArray(mesocycle.routines) || mesocycle.routines.length < 1 || mesocycle.routines.length > 100 || !mesocycle.routines.every(validRoutine) || !Array.isArray(mesocycle.weeks) || mesocycle.weeks.length < 1 || mesocycle.weeks.length > 52) return false;
    const routines = mesocycle.routines as unknown[];
    return mesocycle.weeks.every((week) => Array.isArray(week) && week.length <= 7 && week.every((entry) => entry === null || (isRecord(entry) && hasOnly(entry, ['routineIndex', 'dayLabel']) && typeof entry.routineIndex === 'number' && Number.isInteger(entry.routineIndex) && entry.routineIndex >= 0 && entry.routineIndex < routines.length && (entry.dayLabel === undefined || validLabel(entry.dayLabel, 120, false)))));
  };
  const validPerformedSets = (performances: unknown) => Array.isArray(performances) && performances.length <= 100 && performances.every((performance) => isRecord(performance) && hasOnly(performance, ['exerciseIndex', 'sets']) && typeof performance.exerciseIndex === 'number' && Number.isInteger(performance.exerciseIndex) && performance.exerciseIndex >= 0 && performance.exerciseIndex <= 99 && Array.isArray(performance.sets) && performance.sets.length <= 100 && performance.sets.every((set) => isRecord(set) && hasOnly(set, ['weight', 'reps', 'completed']) && typeof set.weight === 'number' && Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 10000 && typeof set.reps === 'number' && Number.isInteger(set.reps) && set.reps >= 0 && set.reps <= 1000 && typeof set.completed === 'boolean'));
  if (!hasOnly(payload as unknown as Record<string, unknown>, ['version', 'routine', 'mesocycle', 'performedSets']) || payload.version !== 1 || (payload.routine !== undefined && !validRoutine(payload.routine))) return null;
  if (payload.mesocycle !== undefined && (!payload.routine || !validMesocycle(payload.mesocycle))) return null;
  if (payload.performedSets !== undefined && !validPerformedSets(payload.performedSets)) return null;
  return payload;
}

function routinePayload(routine: Routine): NonNullable<WorkoutRecapSharePayload['routine']> {
  return {
    name: routine.name.trim(),
    muscleGroups: [...routine.muscleGroups],
    exercises: routine.exercises.map((exercise) => ({
      name: exercise.name.trim(), muscleGroups: [...exercise.muscleGroups],
      loadMode: exercise.loadMode ?? exercise.definitionSnapshot?.loadMode ?? 'external-load',
      loadUnit: exercise.loadUnit ?? exercise.definitionSnapshot?.loadUnit ?? 'kg',
      variant: exercise.variant,
      sets: exercise.sets.map(({ tipo, weight, reps }) => ({ tipo, weight, reps })),
    })),
  };
}

export function recapSharePayload(
  session: WorkoutSession,
  routine: Routine | undefined,
  mesocycle: Mesocycle | undefined,
  routines: readonly Routine[],
  policy: { shareRoutineTemplate: boolean; shareMesocycleTemplate: boolean; sharePerformedSetDetails: boolean },
): WorkoutRecapSharePayload | undefined {
  if (!routine || !policy.shareRoutineTemplate) return undefined;
  const payload: WorkoutRecapSharePayload = { version: 1, routine: routinePayload(routine) };
  if (session.lineage && mesocycle && policy.shareMesocycleTemplate) {
    const linked = new Map<string, number>();
    const included: NonNullable<WorkoutRecapSharePayload['routine']>[] = [];
    const indexFor = (routineId: string) => {
      const existing = linked.get(routineId); if (existing !== undefined) return existing;
      const candidate = routines.find(({ id }) => id === routineId); if (!candidate) return -1;
      const index = included.length; linked.set(routineId, index); included.push(routinePayload(candidate)); return index;
    };
    const weeks = mesocycle.weeks.map((week) => week.entries.slice(0, 7).map((entry) => {
      if (!('ref' in entry)) return null;
      const routineIndex = indexFor(entry.ref.routineId);
      return routineIndex < 0 ? null : { routineIndex, ...(entry.dayLabel ? { dayLabel: entry.dayLabel } : {}) };
    }));
    if (included.length) payload.mesocycle = { name: mesocycle.name.trim(), goal: mesocycle.goal.trim(), durationWeeks: mesocycle.durationWeeks, weeks, routines: included };
  }
  if (policy.sharePerformedSetDetails) payload.performedSets = session.exercises.map((exercise, exerciseIndex) => ({ exerciseIndex, sets: exercise.sets.map(({ weight, reps, completed }) => ({ weight, reps, completed })) }));
  return payload;
}

export function recapImportPlan(recapId: string, recipient: string, payload: WorkoutRecapSharePayload, includeMesocycle = false): CatalogImportPlan {
  const templates = includeMesocycle && payload.mesocycle ? payload.mesocycle.routines : payload.routine ? [payload.routine] : [];
  if (!templates.length) throw new Error('This recap does not include an importable template.');
  const definitions = templates.flatMap((routine, routineIndex) => routine.exercises.map((exercise, exerciseIndex) => ({
    id: `recap:${recapId}:definition:${routineIndex}:${exerciseIndex}`, source: { kind: 'custom' as const, owner: recipient, originId: `recap:${recapId}:definition:${routineIndex}:${exerciseIndex}` }, name: exercise.name, muscleGroups: exercise.muscleGroups, loadMode: exercise.loadMode, loadUnit: exercise.loadUnit, variant: exercise.variant, defaultSets: exercise.sets.map((set, setIndex) => ({ ...set, id: `set:${setIndex + 1}` })),
  })));
  const routines = templates.map((routine, routineIndex) => ({
    id: `recap:${recapId}:routine:${routineIndex}`, name: routine.name, muscleGroups: routine.muscleGroups, createdAt: new Date().toISOString(), exercises: routine.exercises.map((exercise, exerciseIndex) => ({ id: `exercise:${exerciseIndex}`, name: exercise.name, muscleGroups: exercise.muscleGroups, loadMode: exercise.loadMode, loadUnit: exercise.loadUnit, variant: exercise.variant, definitionId: `recap:${recapId}:definition:${routineIndex}:${exerciseIndex}`, catalogExerciseId: `recap:${recapId}:definition:${routineIndex}:${exerciseIndex}`, sets: exercise.sets.map((set, setIndex) => ({ ...set, id: `set:${setIndex + 1}` })) })),
  }));
  const mesocycles: Mesocycle[] = includeMesocycle && payload.mesocycle ? [{
    id: `recap:${recapId}:mesocycle:0`, name: payload.mesocycle.name, goal: payload.mesocycle.goal, status: 'draft' as const, durationWeeks: payload.mesocycle.durationWeeks, createdAt: new Date().toISOString(),
    weeks: payload.mesocycle.weeks.map((entries, index) => ({ id: `week:${index}`, weekNumber: index + 1, entries: entries.map((entry, order): MesocycleEntry => entry === null ? { id: `rest:${index}:${order}`, kind: 'rest' } : { id: `session:${index}:${order}`, order, ...(entry.dayLabel ? { dayLabel: entry.dayLabel } : {}), ref: { routineId: `recap:${recapId}:routine:${entry.routineIndex}`, routineName: payload.mesocycle!.routines[entry.routineIndex]?.name ?? 'Shared routine', source: 'local' } }) })),
  }] : [];
  return { recipient, definitions, routines, mesocycles };
}

function asExercises(value: unknown): WorkoutRecapExercise[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((exercise) => {
    if (!exercise || typeof exercise !== 'object') return [];
    const row = exercise as Record<string, unknown>;
    if (typeof row.name !== 'string') return [];
    return [{
      name: row.name,
      muscleGroupIds: Array.isArray(row.muscle_group_ids)
        ? row.muscle_group_ids.filter((id): id is string => typeof id === 'string')
        : [],
    }];
  });
}

export function recapInputFromSession(session: WorkoutSession, caption?: string): WorkoutRecapInput {
  const routineName = session.routineName.trim();
  if (!routineName || !Number.isFinite(session.durationSeconds) || session.durationSeconds < 0) {
    throw new Error('This completed workout cannot be shared.');
  }
  const exercises = session.exercises.flatMap((exercise) => {
    if (!exercise.sets.some((set) => set.completed)) return [];
    const name = exercise.name.trim();
    if (!name) return [];
    return [{ name, muscleGroupIds: [...new Set(exercise.muscleGroupIds ?? [])].sort() }];
  });
  const volume = session.exercises.reduce(
    (total, exercise) => total + exercise.sets.reduce(
      (exerciseTotal, set) => exerciseTotal + (set.completed ? set.weight * set.reps : 0),
      0,
    ),
    0,
  );
  const trimmedCaption = caption?.trim();
  if (trimmedCaption && trimmedCaption.length > 280) throw new Error('The caption can contain at most 280 characters.');
  return {
    routineName,
    completedAt: session.completedAt,
    durationSeconds: Math.floor(session.durationSeconds),
    exerciseCount: exercises.length,
    metrics: { volume },
    exercises,
    ...(trimmedCaption ? { caption: trimmedCaption } : {}),
  };
}

export async function createWorkoutRecap(input: WorkoutRecapInput, publicationKey: string): Promise<string> {
  if (!publicationKey.trim()) throw new Error('This completed workout cannot be shared.');
  const { data, error } = await requireClient().rpc('create_workout_recap', {
    input: {
      routine_name: input.routineName,
      completed_at: input.completedAt,
      duration_seconds: input.durationSeconds,
      exercise_count: input.exerciseCount,
      metrics: input.metrics,
      exercise_details: { exercises: input.exercises.map((exercise) => ({ name: exercise.name, muscle_group_ids: exercise.muscleGroupIds })) },
      publication_key: publicationKey,
      ...(input.caption ? { caption: input.caption } : {}),
      ...(input.sharePayload ? { share_payload: input.sharePayload } : {}),
    },
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function getWorkoutRecapDetail(recapId: string): Promise<WorkoutRecapDetail | null> {
  const { data, error } = await requireClient().rpc('get_workout_recap_detail', { recap_id: recapId });
  if (error) throw new Error(error.message);
  if (!data) return null;
  const detail = data as Record<string, unknown>;
  return { ...asRecap(detail), exercises: asExercises(detail.exercises), sharePayload: asSharePayload(detail.share_payload) };
}

export async function publishAutomaticWorkoutRecaps(
  sessions: readonly WorkoutSession[],
  enabled: boolean,
): Promise<string[]> {
  if (!enabled) return [];
  const results = await Promise.all(sessions.map(async (session) => {
    if (!session.recapPublicationKey) return null;
    try {
      await createWorkoutRecap(recapInputFromSession(session), session.recapPublicationKey);
      return null;
    } catch {
      return session.id;
    }
  }));
  return results.filter((id): id is string => id !== null);
}

export async function deleteWorkoutRecap(recapId: string): Promise<void> {
  const { error } = await requireClient().rpc('delete_workout_recap', { recap_id: recapId });
  if (error) throw new Error(error.message);
}

export async function getWorkoutRecapPage(cursor: string | null = null): Promise<WorkoutRecapPage> {
  const { data, error } = await requireClient().rpc('list_workout_recaps', { cursor, page_size: PAGE_SIZE });
  if (error) throw new Error(error.message);
  const page = (data ?? {}) as { recaps?: unknown[]; next_cursor?: unknown };
  return {
    recaps: Array.isArray(page.recaps) ? page.recaps.map(asRecap) : [],
    nextCursor: typeof page.next_cursor === 'string' && page.next_cursor ? page.next_cursor : null,
  };
}

export async function subscribeToWorkoutRecapChanges(onChange: () => void): Promise<() => void> {
  const client = requireClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(error.message);
  const session = data.session;
  if (!session) return () => undefined;

  await client.realtime.setAuth(session.access_token);
  const channel = client.channel(`workout-recap-feed:${session.user.id}`);
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'workout_recaps' }, () => onChange()).subscribe();
  return () => { void client.removeChannel(channel); };
}
