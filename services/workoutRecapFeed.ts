import { CatalogImportPlan, Mesocycle, MesocycleEntry, MuscleGroup, Routine, WorkoutRecap, WorkoutRecapComment, WorkoutRecapDetail, WorkoutRecapExercise, WorkoutRecapInput, WorkoutRecapPage, WorkoutRecapReactionState, WorkoutRecapSharePayload, WorkoutSession } from '../types';
import { supabase, supabaseConfigurationError } from './supabase';
import { avatarIdOrDefault } from '../constants/avatars';
import { canonicalMuscleGroups, isCanonicalMuscleGroup } from '../constants/muscleGroups';

const PAGE_SIZE = 20;

function requireClient() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'Supabase is unavailable.');
  return supabase;
}

function asMuscleDistribution(value: unknown): Array<{ id: MuscleGroup; value: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    return isCanonicalMuscleGroup(row.id) && typeof row.value === 'number' && Number.isInteger(row.value) && row.value > 0
      ? [{ id: row.id as MuscleGroup, value: row.value }]
      : [];
  });
}

function asRecap(row: unknown): WorkoutRecap {
  const value = row as Record<string, unknown>;
  return {
    id: String(value.id),
    authorId: typeof value.author_profile_id === 'string' ? value.author_profile_id : undefined,
    authorAlias: String(value.author_alias),
    authorAvatarId: avatarIdOrDefault(value.author_avatar_id),
    authorThemeId: typeof value.author_theme_id === 'string' ? value.author_theme_id : null,
    authorFrameId: typeof value.author_frame_id === 'string' ? value.author_frame_id : undefined,
    authorTitleId: typeof value.author_title_id === 'string' ? value.author_title_id : undefined,
    routineName: String(value.routine_name),
    completedAt: String(value.completed_at),
    durationSeconds: Number(value.duration_seconds),
    exerciseCount: Number(value.exercise_count),
    muscleGroupIds: Array.isArray(value.muscle_group_ids) ? value.muscle_group_ids.filter((id): id is string => typeof id === 'string') : [],
    muscleDistribution: asMuscleDistribution(value.muscle_distribution),
    commentCount: typeof value.comment_count === 'number' && Number.isInteger(value.comment_count) && value.comment_count >= 0 ? value.comment_count : 0,
    metrics: (value.metrics ?? {}) as Record<string, number>,
    caption: typeof value.caption === 'string' ? value.caption : null,
    createdAt: String(value.created_at),
    templateAvailable: value.template_available === true,
    mesocycleAvailable: value.mesocycle_available === true,
    isAuthor: value.is_author === true,
  };
}

export function asSharePayload(value: unknown): WorkoutRecapSharePayload | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as WorkoutRecapSharePayload;
  const isRecord = (candidate: unknown): candidate is Record<string, unknown> => !!candidate && typeof candidate === 'object' && !Array.isArray(candidate);
  const hasOnly = (candidate: Record<string, unknown>, keys: readonly string[]) => Object.keys(candidate).every((key) => keys.includes(key));
  const hasRequired = (candidate: Record<string, unknown>, keys: readonly string[]) => keys.every((key) => key in candidate);
  const validLabel = (candidate: unknown, max: number, required = true) => typeof candidate === 'string' && (required ? candidate.trim().length > 0 : true) && candidate.length <= max;
  const validMuscles = (candidate: unknown) => Array.isArray(candidate) && candidate.length >= 1 && candidate.length <= 32 && candidate.every((muscle) => validLabel(muscle, 120));
  const validEffortTarget = (target: unknown) => isRecord(target)
    && ((target.kind === 'rir' && Number.isInteger(target.value) && (target.value as number) >= 0 && (target.value as number) <= 5)
      || (target.kind === 'rpe' && Number.isInteger(target.value) && (target.value as number) >= 6 && (target.value as number) <= 10));
  const validSet = (set: unknown) => isRecord(set) && hasOnly(set, ['tipo', 'weight', 'reps', 'effortTarget', 'backoffGroup']) && hasRequired(set, ['tipo', 'weight', 'reps'])
    && (set.tipo === 'C' || set.tipo === 'F' || (typeof set.tipo === 'number' && Number.isInteger(set.tipo) && set.tipo >= 0 && set.tipo <= 10))
    && typeof set.weight === 'number' && Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 10000
    && typeof set.reps === 'number' && Number.isInteger(set.reps) && set.reps >= 0 && set.reps <= 1000
    && (set.effortTarget === undefined || validEffortTarget(set.effortTarget))
    && (set.backoffGroup === undefined || (typeof set.backoffGroup === 'number' && Number.isInteger(set.backoffGroup) && set.backoffGroup >= 0 && set.backoffGroup <= 99));
  const validRoutine = (routine: unknown): routine is NonNullable<WorkoutRecapSharePayload['routine']> => {
    if (!routine || typeof routine !== 'object') return false;
    const value = routine as Record<string, unknown>;
    return hasOnly(value, ['name', 'muscleGroups', 'exercises']) && hasRequired(value, ['name', 'muscleGroups', 'exercises']) && validLabel(value.name, 120) && validMuscles(value.muscleGroups) && Array.isArray(value.exercises) && value.exercises.length >= 1 && value.exercises.length <= 100
      && value.exercises.every((exercise) => isRecord(exercise) && hasOnly(exercise, ['name', 'muscleGroups', 'loadMode', 'loadUnit', 'variant', 'sets']) && hasRequired(exercise, ['name', 'muscleGroups', 'loadMode', 'loadUnit', 'variant', 'sets']) && validLabel(exercise.name, 120) && validMuscles(exercise.muscleGroups) && (exercise.loadMode === 'external-load' || exercise.loadMode === 'bodyweight' || exercise.loadMode === 'assisted') && (exercise.loadUnit === 'kg' || exercise.loadUnit === 'lb') && validLabel(exercise.variant, 120) && Array.isArray(exercise.sets) && exercise.sets.length >= 1 && exercise.sets.length <= 100 && exercise.sets.every(validSet));
  };
  const validMesocycle = (mesocycle: unknown) => {
    if (!isRecord(mesocycle) || !hasOnly(mesocycle, ['name', 'goal', 'durationWeeks', 'weeks', 'routines']) || !hasRequired(mesocycle, ['name', 'goal', 'durationWeeks', 'weeks', 'routines']) || !validLabel(mesocycle.name, 120) || !validLabel(mesocycle.goal, 500, false) || typeof mesocycle.durationWeeks !== 'number' || !Number.isInteger(mesocycle.durationWeeks) || mesocycle.durationWeeks < 1 || mesocycle.durationWeeks > 52 || !Array.isArray(mesocycle.routines) || mesocycle.routines.length < 1 || mesocycle.routines.length > 100 || !mesocycle.routines.every(validRoutine) || !Array.isArray(mesocycle.weeks) || mesocycle.weeks.length < 1 || mesocycle.weeks.length > 52) return false;
    const routines = mesocycle.routines as unknown[];
    return mesocycle.weeks.every((week) => Array.isArray(week) && week.length <= 7 && week.every((entry) => entry === null || (isRecord(entry) && hasOnly(entry, ['routineIndex', 'dayLabel']) && hasRequired(entry, ['routineIndex']) && typeof entry.routineIndex === 'number' && Number.isInteger(entry.routineIndex) && entry.routineIndex >= 0 && entry.routineIndex < routines.length && (entry.dayLabel === undefined || validLabel(entry.dayLabel, 120, false)))));
  };
  const validPerformedSets = (performances: unknown) => Array.isArray(performances) && performances.length <= 100 && performances.every((performance) => isRecord(performance) && hasOnly(performance, ['exerciseIndex', 'sets']) && hasRequired(performance, ['exerciseIndex', 'sets']) && typeof performance.exerciseIndex === 'number' && Number.isInteger(performance.exerciseIndex) && performance.exerciseIndex >= 0 && performance.exerciseIndex <= 99 && Array.isArray(performance.sets) && performance.sets.length <= 100 && performance.sets.every((set) => isRecord(set) && hasOnly(set, ['weight', 'reps', 'completed']) && hasRequired(set, ['weight', 'reps', 'completed']) && typeof set.weight === 'number' && Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 10000 && typeof set.reps === 'number' && Number.isInteger(set.reps) && set.reps >= 0 && set.reps <= 1000 && typeof set.completed === 'boolean'));
  if (!hasOnly(payload as unknown as Record<string, unknown>, ['version', 'routine', 'mesocycle', 'performedSets']) || !hasRequired(payload as unknown as Record<string, unknown>, ['version']) || payload.version !== 1 || (payload.routine !== undefined && !validRoutine(payload.routine))) return null;
  if (payload.mesocycle !== undefined && (!payload.routine || !validMesocycle(payload.mesocycle))) return null;
  if (payload.performedSets !== undefined && !validPerformedSets(payload.performedSets)) return null;
  return payload;
}

function routinePayload(routine: Routine): NonNullable<WorkoutRecapSharePayload['routine']> {
  return {
    name: routine.name.trim(),
    muscleGroups: canonicalMuscleGroups(routine.muscleGroups),
    exercises: routine.exercises.map((exercise) => ({
      name: exercise.name.trim(), muscleGroups: canonicalMuscleGroups(exercise.muscleGroups),
      loadMode: exercise.loadMode ?? exercise.definitionSnapshot?.loadMode ?? 'external-load',
      loadUnit: exercise.loadUnit ?? exercise.definitionSnapshot?.loadUnit ?? 'kg',
      variant: exercise.variant,
      sets: (() => {
        const groups = new Map<string, number>();
        return exercise.sets.map(({ tipo, weight, reps, effortTarget, backoffGroupId }) => ({
          tipo,
          weight,
          reps,
          ...(effortTarget ? { effortTarget } : {}),
          ...(backoffGroupId ? { backoffGroup: groups.get(backoffGroupId) ?? (groups.set(backoffGroupId, groups.size), groups.size - 1) } : {}),
        }));
      })(),
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
      const plannedSnapshot = mesocycle.weeks.flatMap((week) => week.entries).reduce<Routine | undefined>((found, entry) => {
        if (found || !('ref' in entry) || entry.ref.routineId !== routineId) return found;
        return entry.routineSnapshot;
      }, undefined);
      const candidate = routines.find(({ id }) => id === routineId)
        ?? (routine.id === routineId ? routine : undefined)
        ?? plannedSnapshot;
      if (!candidate) return -1;
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

function importedSets(sets: NonNullable<WorkoutRecapSharePayload['routine']>['exercises'][number]['sets'], prefix: string) {
  const groups = new Map<number, string>();
  return sets.map(({ backoffGroup, ...set }, setIndex) => ({
    ...set,
    id: `${prefix}:set:${setIndex + 1}`,
    ...(backoffGroup === undefined ? {} : { backoffGroupId: groups.get(backoffGroup) ?? (groups.set(backoffGroup, `${prefix}:backoff:${groups.size}`), groups.get(backoffGroup)!) }),
  }));
}

export function recapImportPlan(recapId: string, recipient: string, payload: WorkoutRecapSharePayload, includeMesocycle = false): CatalogImportPlan {
  const templates = includeMesocycle && payload.mesocycle ? payload.mesocycle.routines : payload.routine ? [payload.routine] : [];
  if (!templates.length) throw new Error('This recap does not include an importable template.');
  const definitions = templates.flatMap((routine, routineIndex) => routine.exercises.map((exercise, exerciseIndex) => ({
    id: `recap:${recapId}:definition:${routineIndex}:${exerciseIndex}`, source: { kind: 'custom' as const, owner: recipient, originId: `recap:${recapId}:definition:${routineIndex}:${exerciseIndex}` }, name: exercise.name, muscleGroups: exercise.muscleGroups, loadMode: exercise.loadMode, loadUnit: exercise.loadUnit, variant: exercise.variant, defaultSets: importedSets(exercise.sets, `recap:${recapId}:routine:${routineIndex}:exercise:${exerciseIndex}`),
  })));
  const routines = templates.map((routine, routineIndex) => ({
    id: `recap:${recapId}:routine:${routineIndex}`, name: routine.name, muscleGroups: routine.muscleGroups, createdAt: new Date().toISOString(), exercises: routine.exercises.map((exercise, exerciseIndex) => ({ id: `exercise:${exerciseIndex}`, name: exercise.name, muscleGroups: exercise.muscleGroups, loadMode: exercise.loadMode, loadUnit: exercise.loadUnit, variant: exercise.variant, definitionId: `recap:${recapId}:definition:${routineIndex}:${exerciseIndex}`, catalogExerciseId: `recap:${recapId}:definition:${routineIndex}:${exerciseIndex}`, sets: importedSets(exercise.sets, `recap:${recapId}:routine:${routineIndex}:exercise:${exerciseIndex}`) })),
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
      sets: Array.isArray(row.sets) ? row.sets.flatMap((set) => {
        if (!set || typeof set !== 'object') return [];
        const value = set as Record<string, unknown>;
        if (typeof value.weight !== 'number' || !Number.isFinite(value.weight)
          || typeof value.reps !== 'number' || !Number.isInteger(value.reps)
          || typeof value.completed !== 'boolean') return [];
        return [{ weight: value.weight, reps: value.reps, completed: value.completed }];
      }) : [],
    }];
  });
}

function asComment(value: unknown): WorkoutRecapComment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.author_alias !== 'string' || typeof row.body !== 'string' || typeof row.created_at !== 'string') return null;
  return { id: row.id, authorAlias: row.author_alias, authorAvatarId: avatarIdOrDefault(row.author_avatar_id), authorThemeId: typeof row.author_theme_id === 'string' ? row.author_theme_id : null, body: row.body, createdAt: row.created_at, isAuthor: row.is_author === true };
}

function asReactionState(value: unknown): WorkoutRecapReactionState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid recap reaction response.');
  const row = value as Record<string, unknown>;
  if (typeof row.reacted !== 'boolean' || typeof row.reaction_count !== 'number' || !Number.isInteger(row.reaction_count) || row.reaction_count < 0) throw new Error('Invalid recap reaction response.');
  return { reacted: row.reacted, reactionCount: row.reaction_count };
}

function asPreviousComparable(value: unknown): WorkoutRecapDetail['previousComparable'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.completed_at !== 'string' || typeof row.duration_seconds !== 'number' || typeof row.exercise_count !== 'number') return null;
  const metrics = row.metrics && typeof row.metrics === 'object' && !Array.isArray(row.metrics) ? Object.fromEntries(Object.entries(row.metrics).filter(([, metric]) => typeof metric === 'number' && Number.isFinite(metric))) as Record<string, number> : {};
  return { id: row.id, completedAt: row.completed_at, durationSeconds: row.duration_seconds, exerciseCount: row.exercise_count, metrics };
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
    return [{
      name,
      muscleGroupIds: [...new Set(exercise.muscleGroupIds ?? [])].sort(),
      sets: exercise.sets.map(({ weight, reps, completed }) => ({ weight, reps, completed })),
    }];
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

function recapPayload(input: WorkoutRecapInput, publicationKey: string) {
  return {
    routine_name: input.routineName,
    completed_at: input.completedAt,
    duration_seconds: input.durationSeconds,
    exercise_count: input.exerciseCount,
    metrics: input.metrics,
    exercise_details: { exercises: input.exercises.map((exercise) => ({
      name: exercise.name,
      muscle_group_ids: exercise.muscleGroupIds,
      sets: exercise.sets,
    })) },
    publication_key: publicationKey,
    ...(input.caption ? { caption: input.caption } : {}),
    ...(input.sharePayload ? { share_payload: input.sharePayload } : {}),
  };
}

async function submitWorkoutRecap(input: WorkoutRecapInput, publicationKey: string): Promise<string> {
  const { data, error } = await requireClient().rpc('create_workout_recap', { input: recapPayload(input, publicationKey) });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function createWorkoutRecap(input: WorkoutRecapInput, publicationKey: string): Promise<string> {
  if (!publicationKey.trim()) throw new Error('This completed workout cannot be shared.');
  try {
    return await submitWorkoutRecap(input, publicationKey);
  } catch (error) {
    if (!input.sharePayload) throw error;
    const { sharePayload: _sharePayload, ...summary } = input;
    return submitWorkoutRecap(summary, publicationKey);
  }
}

export async function getWorkoutRecapDetail(recapId: string): Promise<WorkoutRecapDetail | null> {
  const { data, error } = await requireClient().rpc('get_workout_recap_detail', { recap_id: recapId });
  if (error) throw new Error(error.message);
  if (!data) return null;
  const detail = data as Record<string, unknown>;
  return { ...asRecap(detail), exercises: asExercises(detail.exercises), sharePayload: asSharePayload(detail.share_payload), reactionCount: typeof detail.reaction_count === 'number' && Number.isInteger(detail.reaction_count) && detail.reaction_count >= 0 ? detail.reaction_count : 0, viewerHasReacted: detail.viewer_has_reacted === true, comments: Array.isArray(detail.comments) ? detail.comments.flatMap((value) => { const comment = asComment(value); return comment ? [comment] : []; }) : [], previousComparable: asPreviousComparable(detail.previous_comparable) };
}

export async function setWorkoutRecapReaction(recapId: string, reacted: boolean): Promise<WorkoutRecapReactionState> {
  const { data, error } = await requireClient().rpc('set_workout_recap_reaction', { recap_id: recapId, reacted });
  if (error) throw new Error(error.message);
  return asReactionState(data);
}

export async function createWorkoutRecapComment(recapId: string, body: string): Promise<WorkoutRecapComment> {
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > 500) throw new Error('Comments must contain between 1 and 500 characters.');
  const { data, error } = await requireClient().rpc('create_workout_recap_comment', { recap_id: recapId, body_input: trimmed });
  if (error) throw new Error(error.message);
  const comment = asComment(data);
  if (!comment) throw new Error('Invalid recap comment response.');
  return comment;
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
  const recaps = Array.isArray(page.recaps) ? page.recaps.map(asRecap) : [];
  const { data: reactions, error: reactionError } = await requireClient().rpc('get_workout_recap_reaction_states', { recap_ids: recaps.map(({ id }) => id) });
  if (reactionError) throw new Error(reactionError.message);
  const states = reactions && typeof reactions === 'object' && !Array.isArray(reactions) ? reactions as Record<string, unknown> : {};
  return {
    recaps: recaps.map((recap) => {
      const state = states[recap.id] as Record<string, unknown> | undefined;
      return { ...recap, reactionCount: typeof state?.reaction_count === 'number' ? state.reaction_count : 0, viewerHasReacted: state?.viewer_has_reacted === true };
    }),
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
