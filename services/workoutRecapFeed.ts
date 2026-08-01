import { WorkoutRecap, WorkoutRecapDetail, WorkoutRecapExercise, WorkoutRecapInput, WorkoutRecapPage, WorkoutSession } from '../types';
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
  };
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
  return { ...asRecap(detail), exercises: asExercises(detail.exercises) };
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
