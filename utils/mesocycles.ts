import { Mesocycle, MesocycleEntry, PlannedSession, PlannedSessionPlanningState, PlannedSessionRef, Routine, WorkoutAttempt, WorkoutLineage } from '../types';
import { generateId } from './ids';
import { isValidPerformance } from './workoutAttempts';

export type PlannedSessionAdherenceStatus = 'not-started' | 'partial' | 'completed' | 'skipped' | 'rescheduled' | 'cancelled';
export interface PlannedSessionAdherence {
  plannedSessionId: string;
  status: PlannedSessionAdherenceStatus;
  fullyCompleted: boolean;
  completedExercises: number;
  plannedExercises: number;
  validSets: number;
  plannedSets: number;
  displayPercent: number | null;
  authoritativeAttemptId?: string;
}
export interface MesocycleWeekAdherence { weekNumber: number; plannedSessions: number; completedSessions: number; sessionStates: PlannedSessionAdherence[]; }
export interface MesocycleAdherence { plannedSessions: number; completedSessions: number; weeks: MesocycleWeekAdherence[]; }
export interface MesocycleMuscleProgress { plannedSets: number; completedSets: number; repetitions: number; volume: number; }
export interface MesocycleExerciseProgress { name: string; firstLoad: number | null; lastLoad: number | null; firstReps: number | null; lastReps: number | null; firstVolume: number; lastVolume: number; points: Array<{ at: string; load: number; reps: number; volume: number }>; }
export interface MesocycleTrainingProgress {
  plannedEffectiveSets: number;
  completedEffectiveSets: number;
  repetitions: number;
  volume: number;
  muscles: Record<string, MesocycleMuscleProgress>;
  exercises: MesocycleExerciseProgress[];
}
export type MesocycleDayGuidance =
  | { state: 'pre-start' | 'unplanned' | 'completed' }
  | { state: 'rest'; entryId: string; weekNumber: number }
  | { state: 'routine'; entryId: string; weekNumber: number; ref: PlannedSessionRef }
  | null;

const isRoutine = (entry: MesocycleEntry): entry is PlannedSession => !('kind' in entry && entry.kind === 'rest');

export function plannedSessionPlanningState(entry: PlannedSession): PlannedSessionPlanningState {
  return entry.planningState ?? 'pending';
}

export function isExecutablePlannedSession(entry: PlannedSession): boolean {
  const state = plannedSessionPlanningState(entry);
  return state === 'pending' || state === 'in_progress';
}

export function transitionPlannedSession(entry: PlannedSession, to: PlannedSessionPlanningState, at: string, reason?: string): PlannedSession {
  const from = plannedSessionPlanningState(entry);
  return { ...entry, planningState: to, planningTransition: { from, to, at, reason } };
}

export interface RecoveryDestination {
  weekNumber: number;
  /** Omit to use the next unplanned day in a week with fewer than seven entries. */
  entryId?: string;
}

export function eligibleRecoveryDestinations(mesocycle: Mesocycle): RecoveryDestination[] {
  return mesocycle.weeks
    .filter((week) => week.weekNumber > 0 && week.weekNumber <= mesocycle.durationWeeks)
    .sort((left, right) => left.weekNumber - right.weekNumber)
    .flatMap((week) => [
      ...week.entries.flatMap((entry) => !isRoutine(entry) ? [{ weekNumber: week.weekNumber, entryId: entry.id }] : []),
      ...(week.entries.length < 7 ? [{ weekNumber: week.weekNumber }] : []),
    ]);
}

/** Replaces one empty/rest day with a recovery copy without mutating attempts or either input plan. */
export function reschedulePlannedSessionWithRecovery(
  mesocycle: Mesocycle,
  source: { weekNumber: number; entryId: string },
  destination: RecoveryDestination,
  attempts: readonly WorkoutAttempt[],
  at: string,
  recoveryId = generateId(),
): Mesocycle {
  const sourceWeek = mesocycle.weeks.find((week) => week.weekNumber === source.weekNumber && week.weekNumber > 0 && week.weekNumber <= mesocycle.durationWeeks);
  const sourceEntry = sourceWeek?.entries.find((entry) => entry.id === source.entryId);
  if (!sourceWeek || !sourceEntry || !isRoutine(sourceEntry) || plannedSessionPlanningState(sourceEntry) !== 'pending') {
    throw new Error('Recovery source must be a pending planned session within the mesocycle duration.');
  }
  if (attempts.some((attempt) => attempt.lineage?.mesocycleId === mesocycle.id && attempt.lineage.weekNumber === source.weekNumber && attempt.lineage.plannedSessionId === source.entryId)) {
    throw new Error('Recovery source already has a historical attempt.');
  }
  if (sourceEntry.recoveredByPlannedSessionId) throw new Error('Recovery source already has a linked recovery slot.');

  const destinationWeek = mesocycle.weeks.find((week) => week.weekNumber === destination.weekNumber && week.weekNumber > 0 && week.weekNumber <= mesocycle.durationWeeks);
  const destinationIndex = destination.entryId === undefined ? -1 : destinationWeek?.entries.findIndex((entry) => entry.id === destination.entryId) ?? -1;
  const destinationEntry = destinationIndex >= 0 ? destinationWeek?.entries[destinationIndex] : undefined;
  if (!destinationWeek || (destination.entryId === undefined ? destinationWeek.entries.length >= 7 : !destinationEntry || isRoutine(destinationEntry))) {
    throw new Error('Recovery destination is not an eligible empty or rest slot within the mesocycle duration.');
  }
  if (flattenMesocycleEntries(mesocycle).some(({ entry }) => entry.id === recoveryId)) throw new Error('Recovery slot id already exists in this mesocycle.');

  const recovery: PlannedSession = {
    id: recoveryId,
    ref: { ...sourceEntry.ref },
    ...(sourceEntry.routineSnapshot ? { routineSnapshot: snapshotPlannedRoutine(sourceEntry.routineSnapshot) } : {}),
    order: destinationIndex >= 0 ? destinationIndex + 1 : destinationWeek.entries.length + 1,
    ...(sourceEntry.progressionNote ? { progressionNote: sourceEntry.progressionNote } : {}),
    ...(sourceEntry.note ? { note: sourceEntry.note } : {}),
    planningState: 'pending',
    recoveryForPlannedSessionId: sourceEntry.id,
    isExtraordinary: true,
  };
  const rescheduled = { ...transitionPlannedSession(sourceEntry, 'rescheduled', at), recoveredByPlannedSessionId: recoveryId };

  return {
    ...mesocycle,
    weeks: mesocycle.weeks.map((week) => {
      if (week.weekNumber === source.weekNumber && week.weekNumber === destination.weekNumber) {
        return { ...week, entries: week.entries.map((entry, index) => entry.id === source.entryId ? rescheduled : index === destinationIndex ? recovery : entry).concat(destinationIndex < 0 ? [recovery] : []) };
      }
      if (week.weekNumber === source.weekNumber) return { ...week, entries: week.entries.map((entry) => entry.id === source.entryId ? rescheduled : entry) };
      if (week.weekNumber === destination.weekNumber) return { ...week, entries: destinationIndex < 0 ? [...week.entries, recovery] : week.entries.map((entry, index) => index === destinationIndex ? recovery : entry) };
      return week;
    }),
  };
}

export function snapshotPlannedRoutine(routine: Routine): Routine {
  return {
    ...routine,
    muscleGroups: [...routine.muscleGroups],
    exercises: routine.exercises.map((exercise) => ({
      ...exercise,
      muscleGroups: [...(exercise.muscleGroups ?? [])],
      attribution: exercise.attribution ? {
        primary: exercise.attribution.primary,
        secondary: [...exercise.attribution.secondary],
        ...(exercise.attribution.weights ? { weights: { ...exercise.attribution.weights } } : {}),
      } : undefined,
      catalog: exercise.catalog ? {
        movementPattern: exercise.catalog.movementPattern,
        equipment: exercise.catalog.equipment,
        muscleParticipations: exercise.catalog.muscleParticipations.map((participation) => ({ ...participation })),
      } : undefined,
      sets: (exercise.sets ?? []).map((set) => ({ ...set })),
    })),
  };
}
export function deriveFirstEntryStartDate(entries: readonly MesocycleEntry[], today = new Date()): string | undefined {
  if (!entries.length) return undefined;
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, '0');
  const day = `${today.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
const parseLocalDate = (value?: string): Date | null => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null;
};

export interface ScheduleDateLabel { weekday: string; date: string; }
export interface RoutineScheduleMetadata { available: boolean; muscleGroups: string[]; exerciseCount: number; }
export type ScheduleState = 'upcoming' | 'today' | 'past';
export type MesocycleScheduleProjectionEntry =
  | { kind: 'routine'; entryId: string; weekNumber: number; dayOffset: number; dateLabel: ScheduleDateLabel | null; scheduleState: ScheduleState | null; planningState: PlannedSessionPlanningState; planningTransition?: PlannedSession['planningTransition']; recoveryForPlannedSessionId?: string; recoveredByPlannedSessionId?: string; isExtraordinary: boolean; routine: RoutineScheduleMetadata; progress: PlannedSessionAdherence }
  | { kind: 'rest'; entryId: string; weekNumber: number; dayOffset: number; dateLabel: ScheduleDateLabel | null; scheduleState: ScheduleState | null; progress: { status: 'rest'; displayPercent: null } };
export function deriveScheduleDateLabel(
  startDate: string | undefined,
  flattenedOffset: number,
  locale?: string | string[],
): ScheduleDateLabel | null {
  const start = parseLocalDate(startDate);
  if (!start || !Number.isInteger(flattenedOffset) || flattenedOffset < 0) return null;
  const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + flattenedOffset, 12);
  return {
    weekday: date.toLocaleDateString(locale, { weekday: 'long' }),
    date: date.toLocaleDateString(locale, { month: 'long', day: 'numeric' }),
  };
}
const deriveScheduleState = (startDate: string | undefined, dayOffset: number, today: Date): ScheduleState | null => {
  const start = parseLocalDate(startDate);
  if (!start || Number.isNaN(today.getTime())) return null;
  const scheduled = new Date(start.getFullYear(), start.getMonth(), start.getDate() + dayOffset, 12);
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  if (scheduled.getTime() === current.getTime()) return 'today';
  return scheduled.getTime() > current.getTime() ? 'upcoming' : 'past';
};

export interface MesocycleSequenceEntry { weekNumber: number; dayOffset: number; entry: MesocycleEntry; }
export function flattenMesocycleEntries(mesocycle: Mesocycle): MesocycleSequenceEntry[] {
  return [...mesocycle.weeks].sort((a, b) => a.weekNumber - b.weekNumber)
    .flatMap((week) => week.entries.slice(0, 7).map((entry, dayIndex) => ({
      weekNumber: week.weekNumber,
      dayOffset: (week.weekNumber - 1) * 7 + dayIndex,
      entry,
    })));
}

export function projectMesocycleRoutineIds(
  mesocycles: readonly Mesocycle[],
  routineReplacements: Readonly<Record<string, string>>,
): Mesocycle[] {
  return mesocycles.map((mesocycle) => ({
    ...mesocycle,
    weeks: mesocycle.weeks.map((week) => ({
      ...week,
      entries: week.entries.map((entry) => {
        if (!isRoutine(entry)) return { ...entry };
        const routineId = routineReplacements[entry.ref.routineId];
        if (!routineId) throw new Error(`Imported mesocycle references unknown routine: ${entry.ref.routineId}`);
        const { shareId: _shareId, ...localRef } = entry.ref;
        return {
          ...entry,
          ref: { ...localRef, routineId, source: 'local' },
        };
      }),
    })),
  }));
}

export function deriveMesocycleDayGuidance(mesocycle: Mesocycle, today = new Date()): MesocycleDayGuidance {
  const start = parseLocalDate(mesocycle.startDate);
  const entries = flattenMesocycleEntries(mesocycle);
  if (!start || !entries.length) return null;
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const offset = Math.round((current.getTime() - start.getTime()) / 86_400_000);
  if (offset < 0) return { state: 'pre-start' };
  const currentEntry = entries.find((entry) => entry.dayOffset === offset);
  if (!currentEntry) return offset < mesocycle.durationWeeks * 7 ? { state: 'unplanned' } : { state: 'completed' };
  return isRoutine(currentEntry.entry)
    ? isExecutablePlannedSession(currentEntry.entry)
      ? { state: 'routine', entryId: currentEntry.entry.id, weekNumber: currentEntry.weekNumber, ref: currentEntry.entry.ref }
      : { state: 'unplanned' }
    : { state: 'rest', entryId: currentEntry.entry.id, weekNumber: currentEntry.weekNumber };
}

const lineageKey = (mesocycleId: string, weekNumber: number, plannedSessionId: string) => `${mesocycleId}:${weekNumber}:${plannedSessionId}`;
const validLineage = (attempt: WorkoutAttempt): attempt is WorkoutAttempt & { lineage: WorkoutLineage } => !!attempt.lineage && attempt.lineage.mesocycleId.trim().length > 0 && Number.isInteger(attempt.lineage.weekNumber) && attempt.lineage.weekNumber > 0 && attempt.lineage.plannedSessionId.trim().length > 0;
const notStartedProgress = (plannedSessionId: string): PlannedSessionAdherence => ({
  plannedSessionId,
  status: 'not-started',
  fullyCompleted: false,
  completedExercises: 0,
  plannedExercises: 0,
  validSets: 0,
  plannedSets: 0,
  displayPercent: null,
});
const progressFromAttempt = (plannedSessionId: string, attempt: WorkoutAttempt): PlannedSessionAdherence => {
  const exercises = attempt.exercises.map((exercise) => {
    const validSets = exercise.sets.filter(({ result }) => result.performed && result.performance && isValidPerformance(result.performance)).length;
    return { validSets, plannedSets: exercise.sets.length };
  });
  return {
    plannedSessionId,
    status: attempt.completion.status === 'partial' ? 'partial' : 'completed',
    fullyCompleted: attempt.completion.status === 'fully-completed',
    completedExercises: exercises.filter(({ validSets, plannedSets }) => plannedSets > 0 && validSets === plannedSets).length,
    plannedExercises: exercises.length,
    validSets: exercises.reduce((total, exercise) => total + exercise.validSets, 0),
    plannedSets: exercises.reduce((total, exercise) => total + exercise.plannedSets, 0),
    displayPercent: attempt.completion.displayPercent,
    authoritativeAttemptId: attempt.id,
  };
};

function latestMesocycleAttempts(mesocycle: Mesocycle, attempts: readonly WorkoutAttempt[]): Map<string, WorkoutAttempt> {
  const latest = new Map<string, WorkoutAttempt>();
  attempts.forEach((attempt) => {
    if (!validLineage(attempt) || attempt.lineage.mesocycleId !== mesocycle.id) return;
    const key = lineageKey(attempt.lineage.mesocycleId, attempt.lineage.weekNumber, attempt.lineage.plannedSessionId);
    const current = latest.get(key);
    if (!current || attempt.completedAt > current.completedAt || (attempt.completedAt === current.completedAt && attempt.id > current.id)) latest.set(key, attempt);
  });
  return latest;
}

function participationWeights(exercise: Routine['exercises'][number] | WorkoutAttempt['exercises'][number]): Array<{ id: string; weight: number }> {
  const catalog = 'catalog' in exercise ? exercise.catalog?.muscleParticipations : undefined;
  if (catalog?.length) return catalog.map((item) => ({ id: item.muscleGroupId, weight: item.relevance }));
  if (!exercise.attribution) return [];
  return [
    { id: exercise.attribution.primary, weight: exercise.attribution.weights?.[exercise.attribution.primary] ?? 1 },
    ...exercise.attribution.secondary.map((id) => ({ id, weight: exercise.attribution?.weights?.[id] ?? 0.4 })),
  ];
}

/** Uses one authoritative attempt per planned calendar slot, never the reusable routine identity. */
export function deriveMesocycleTrainingProgress(mesocycle: Mesocycle, attempts: readonly WorkoutAttempt[] = [], routines: readonly Routine[] = []): MesocycleTrainingProgress {
  const latest = latestMesocycleAttempts(mesocycle, attempts);
  const routinesById = new Map(routines.map((routine) => [routine.id, routine]));
  const result: MesocycleTrainingProgress = { plannedEffectiveSets: 0, completedEffectiveSets: 0, repetitions: 0, volume: 0, muscles: {}, exercises: [] };
  const exposures = new Map<string, Array<{ at: string; name: string; load: number; reps: number; volume: number }>>();
  const addMuscle = (id: string, planned = 0, completed = 0, repetitions = 0, volume = 0) => {
    const item = result.muscles[id] ?? { plannedSets: 0, completedSets: 0, repetitions: 0, volume: 0 };
    item.plannedSets += planned; item.completedSets += completed; item.repetitions += repetitions; item.volume += volume;
    result.muscles[id] = item;
  };

  for (const { weekNumber, entry } of flattenMesocycleEntries(mesocycle)) {
    if (!isRoutine(entry) || !isExecutablePlannedSession(entry)) continue;
    const routine = entry.routineSnapshot ?? routinesById.get(entry.ref.routineId);
    if (routine) for (const exercise of routine.exercises) {
      const effective = (exercise.sets ?? []).filter((set) => set.tipo !== 'C').length;
      result.plannedEffectiveSets += effective;
      for (const participation of participationWeights(exercise)) addMuscle(participation.id, effective * participation.weight);
    }
    const attempt = latest.get(lineageKey(mesocycle.id, weekNumber, entry.id));
    if (!attempt) continue;
    for (const exercise of attempt.exercises) {
      let exerciseVolume = 0; let exerciseReps = 0; let maxLoad = 0;
      let completed = 0;
      for (const { plan, result: set } of exercise.sets) {
        if (!plan || !set) continue;
        if (plan.type === 'C' || !set.performed || !set.performance || !isValidPerformance(set.performance)) continue;
        completed += 1;
        const load = set.performance.mode === 'external-load'
          ? set.performance.load * (set.performance.unit === 'lb' ? 0.45359237 : 1)
          : 0;
        const volume = load * set.performance.reps;
        exerciseReps += set.performance.reps; exerciseVolume += volume; maxLoad = Math.max(maxLoad, load);
      }
      result.completedEffectiveSets += completed; result.repetitions += exerciseReps; result.volume += exerciseVolume;
      for (const participation of participationWeights(exercise)) addMuscle(participation.id, 0, completed * participation.weight, exerciseReps * participation.weight, exerciseVolume * participation.weight);
      if (completed) {
        const key = exercise.exerciseId ?? exercise.recordedName;
        const values = exposures.get(key) ?? [];
        values.push({ at: attempt.completedAt, name: exercise.recordedName, load: maxLoad, reps: exerciseReps, volume: exerciseVolume });
        exposures.set(key, values);
      }
    }
  }
  result.exercises = [...exposures.values()].map((values) => {
    const sorted = values.sort((left, right) => left.at.localeCompare(right.at));
    const first = sorted[0]; const last = sorted.at(-1)!;
    return { name: last.name, firstLoad: first.load || null, lastLoad: last.load || null, firstReps: first.reps || null, lastReps: last.reps || null, firstVolume: first.volume, lastVolume: last.volume, points: sorted.map(({ at, load, reps, volume }) => ({ at, load, reps, volume })) };
  }).sort((left, right) => right.lastVolume - left.lastVolume);
  return result;
}
export function deriveMesocycleAdherence(mesocycle: Mesocycle, attempts: readonly WorkoutAttempt[] = []): MesocycleAdherence {
  const latest = latestMesocycleAttempts(mesocycle, attempts);
  const weeks = mesocycle.weeks.map((week) => {
    const sessionStates = week.entries.filter(isRoutine).map((entry) => {
      const attempt = latest.get(lineageKey(mesocycle.id, week.weekNumber, entry.id));
      if (attempt) return progressFromAttempt(entry.id, attempt);
      if (isExecutablePlannedSession(entry)) return notStartedProgress(entry.id);
      return { ...notStartedProgress(entry.id), status: plannedSessionPlanningState(entry) as Extract<PlannedSessionAdherenceStatus, 'skipped' | 'rescheduled' | 'cancelled'> };
    });
    const executableStates = sessionStates.filter((item) => item.status === 'not-started' || item.status === 'partial' || item.status === 'completed');
    return { weekNumber: week.weekNumber, plannedSessions: executableStates.length, completedSessions: executableStates.filter((item) => item.status === 'completed').length, sessionStates };
  });
  return { plannedSessions: weeks.reduce((n, week) => n + week.plannedSessions, 0), completedSessions: weeks.reduce((n, week) => n + week.completedSessions, 0), weeks };
}

/** A mesocycle closes only after every planned session reaches the reward-eligible completion threshold. */
export function completeMesocycleWhenAllSessionsComplete(mesocycle: Mesocycle, attempts: readonly WorkoutAttempt[] = []): Mesocycle {
  if (mesocycle.status !== 'active') return mesocycle;
  const { plannedSessions, completedSessions } = deriveMesocycleAdherence(mesocycle, attempts);
  return plannedSessions > 0 && completedSessions >= plannedSessions
    ? { ...mesocycle, status: 'completed' }
    : mesocycle;
}

/** Explains why a user cannot manually close a plan yet. Server validation remains authoritative. */
export function mesocycleCompletionBlockReason(mesocycle: Mesocycle, attempts: readonly WorkoutAttempt[] = [], today = new Date()): string | null {
  const hasFinalizedSession = attempts.some((attempt) => validLineage(attempt) && attempt.lineage.mesocycleId === mesocycle.id);
  if (!hasFinalizedSession) return 'Completá al menos un entrenamiento del mesociclo antes de cerrarlo.';
  const hasFutureRoutine = flattenMesocycleEntries(mesocycle).some(({ dayOffset, entry }) => (
    isRoutine(entry) && isExecutablePlannedSession(entry) && deriveScheduleState(mesocycle.startDate, dayOffset, today) === 'upcoming'
  ));
  return hasFutureRoutine ? 'No podés cerrar el mesociclo mientras haya entrenamientos programados para fechas futuras.' : null;
}

export function deriveMesocycleScheduleProjection(
  mesocycle: Mesocycle,
  routines: readonly Routine[] = [],
  attempts: readonly WorkoutAttempt[] = [],
  locale?: string | string[],
  today = new Date(),
): MesocycleScheduleProjectionEntry[] {
  const routinesById = new Map(routines.map((routine) => [routine.id, routine]));
  const progressBySession = new Map(
    deriveMesocycleAdherence(mesocycle, attempts).weeks.flatMap((week) =>
      week.sessionStates.map((progress) => [lineageKey(mesocycle.id, week.weekNumber, progress.plannedSessionId), progress] as const)),
  );
  return flattenMesocycleEntries(mesocycle).map(({ weekNumber, dayOffset, entry }) => {
    const dateLabel = deriveScheduleDateLabel(mesocycle.startDate, dayOffset, locale);
    const scheduleState = deriveScheduleState(mesocycle.startDate, dayOffset, today);
    if (!isRoutine(entry)) {
      return { kind: 'rest', entryId: entry.id, weekNumber, dayOffset, dateLabel, scheduleState, progress: { status: 'rest', displayPercent: null } };
    }
    const routine = routinesById.get(entry.ref.routineId);
    return {
      kind: 'routine',
      entryId: entry.id,
      weekNumber,
      dayOffset,
      dateLabel,
      scheduleState,
      planningState: plannedSessionPlanningState(entry),
      planningTransition: entry.planningTransition,
      recoveryForPlannedSessionId: entry.recoveryForPlannedSessionId,
      recoveredByPlannedSessionId: entry.recoveredByPlannedSessionId,
      isExtraordinary: entry.isExtraordinary === true,
      routine: routine
        ? { available: true, muscleGroups: [...routine.muscleGroups], exerciseCount: routine.exercises.length }
        : { available: false, muscleGroups: [], exerciseCount: 0 },
      progress: progressBySession.get(lineageKey(mesocycle.id, weekNumber, entry.id)) ?? notStartedProgress(entry.id),
    };
  });
}

export function buildMesocycleDraft(mesocycle: Mesocycle): Mesocycle {
  const byNumber = new Map(mesocycle.weeks.map((week) => [week.weekNumber, week]));
  return { ...mesocycle, weeks: Array.from({ length: Math.max(mesocycle.durationWeeks, 1) }, (_, index) => byNumber.get(index + 1) ?? { id: generateId(), weekNumber: index + 1, entries: [] }) };
}
export function countPlannedSessions(mesocycle: Mesocycle): number { return flattenMesocycleEntries(mesocycle).filter(({ entry }) => isRoutine(entry) && isExecutablePlannedSession(entry)).length; }
export function clonePlannedWeekEntries(entries: readonly MesocycleEntry[]): MesocycleEntry[] { return entries.map((entry, index) => {
  if (!isRoutine(entry)) return { ...entry, id: generateId() };
  const { planningTransition: _planningTransition, recoveryForPlannedSessionId: _recoveryFor, recoveredByPlannedSessionId: _recoveredBy, ...clone } = entry;
  return { ...clone, id: generateId(), order: index + 1, ref: { ...entry.ref }, planningState: 'pending', ...(entry.routineSnapshot ? { routineSnapshot: snapshotPlannedRoutine(entry.routineSnapshot) } : {}) };
}); }
