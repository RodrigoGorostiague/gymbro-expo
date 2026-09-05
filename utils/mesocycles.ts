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
export const MAX_MESOCYCLE_WEEKS = 52;

export function canDeleteMesocycle(mesocycle: Mesocycle, attempts: readonly WorkoutAttempt[]): boolean {
  return mesocycle.status === 'draft'
    && !attempts.some((attempt) => attempt.lineage?.mesocycleId === mesocycle.id);
}

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

/** Lifecycle metadata may evolve without forking the immutable training prescription. */
export function isMesocycleLifecycleOnlyEdit(current: Mesocycle, edited: Mesocycle): boolean {
  const prescription = (mesocycle: Mesocycle) => {
    const {
      status: _status,
      pausedAt: _pausedAt,
      pausedOn: _pausedOn,
      scheduleShiftDays: _scheduleShiftDays,
      lifecycleHistory: _lifecycleHistory,
      ...content
    } = mesocycle;
    return {
      ...content,
      weeks: content.weeks.map((week) => ({
        ...week,
        entries: week.entries.map((entry) => {
          if (!isRoutine(entry)) return entry;
          const { planningState: _planningState, planningTransition: _planningTransition, ...session } = entry;
          return session;
        }),
      })),
    };
  };
  return JSON.stringify(prescription(current)) === JSON.stringify(prescription(edited));
}

export interface RecoveryDestination {
  weekNumber: number;
  /** Omit to use the next unplanned day in a week with fewer than seven entries. */
  entryId?: string;
}

export function eligibleRecoveryDestinations(mesocycle: Mesocycle, today = new Date()): RecoveryDestination[] {
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  return mesocycle.weeks
    .filter((week) => week.weekNumber > 0 && week.weekNumber <= mesocycle.durationWeeks)
    .sort((left, right) => left.weekNumber - right.weekNumber)
    .flatMap((week) => {
      const rests = week.entries.flatMap((entry, index) => {
        const date = derivePlannedEntryDate(mesocycle, entry.id, (week.weekNumber - 1) * 7 + index);
        return !isRoutine(entry) && (!date || date >= current) ? [{ weekNumber: week.weekNumber, entryId: entry.id }] : [];
      });
      const emptyDate = derivePlannedEntryDate(mesocycle, '__empty__', (week.weekNumber - 1) * 7 + week.entries.length);
      return [...rests, ...(week.entries.length < 7 && (!emptyDate || emptyDate >= current) ? [{ weekNumber: week.weekNumber }] : [])];
    });
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
    scheduleShiftDays: mesocycle.scheduleShiftDays,
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
const localDateFromInstant = (value: string): Date | null => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
};
const formatLocalDate = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addCalendarDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
const calendarDayDifference = (from: Date, to: Date): number => {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(0, Math.round((toUtc - fromUtc) / 86_400_000));
};

function hasAttempt(attempts: readonly WorkoutAttempt[], mesocycleId: string, weekNumber: number, entryId: string): boolean {
  return attempts.some((attempt) => attempt.lineage?.mesocycleId === mesocycleId
    && attempt.lineage.weekNumber === weekNumber && attempt.lineage.plannedSessionId === entryId);
}

function shiftedDaysForEntry(mesocycle: Mesocycle, entryId: string, dayOffset: number): number {
  const entry = mesocycle.weeks.flatMap((week) => week.entries).find((candidate) => candidate.id === entryId);
  const resumed = (mesocycle.lifecycleHistory ?? []).filter((event) => event.type === 'resumed');
  if (!entry || resumed.length === 0) return mesocycle.scheduleShiftDays ?? 0;
  if (isRoutine(entry)) return resumed.reduce((total, event) => event.shiftedPlannedSessionIds.includes(entryId) ? total + event.shiftDays : total, entry.scheduleShiftDays ?? 0);
  const start = parseLocalDate(mesocycle.startDate);
  if (!start) return 0;
  return resumed.reduce((total, event) => {
    const pausedDate = parseLocalDate(event.pauseStartedDate);
    return pausedDate && addCalendarDays(start, dayOffset + total) >= pausedDate ? total + event.shiftDays : total;
  }, 0);
}

export function derivePlannedEntryDate(mesocycle: Mesocycle, entryId: string, dayOffset: number): Date | null {
  const start = parseLocalDate(mesocycle.startDate);
  return start ? addCalendarDays(start, dayOffset + shiftedDaysForEntry(mesocycle, entryId, dayOffset)) : null;
}

export function pauseMesocycle(mesocycle: Mesocycle, at: string): Mesocycle {
  if (mesocycle.status !== 'active') throw new Error('Only an active mesocycle can be paused.');
  const localDate = localDateFromInstant(at);
  if (!localDate) throw new Error('Pause timestamp is invalid.');
  const pausedOn = formatLocalDate(localDate);
  return { ...mesocycle, status: 'paused', pausedAt: at, pausedOn, lifecycleHistory: [...(mesocycle.lifecycleHistory ?? []), { type: 'paused', at, localDate: pausedOn }] };
}

export function scheduleMesocycle(mesocycle: Mesocycle): Mesocycle {
  if (mesocycle.status !== 'draft') throw new Error('Only a draft mesocycle can be scheduled.');
  return { ...mesocycle, status: 'scheduled' };
}

export function activateMesocycle(mesocycle: Mesocycle): Mesocycle {
  if (mesocycle.status !== 'draft' && mesocycle.status !== 'scheduled') throw new Error('Only a draft or scheduled mesocycle can be activated.');
  return { ...mesocycle, status: 'active' };
}

/** Resumes by whole local calendar days; same-day pauses shift zero days, independently of DST. */
export function resumeMesocycle(mesocycle: Mesocycle, attempts: readonly WorkoutAttempt[], at: string): Mesocycle {
  if (mesocycle.status !== 'paused' || !mesocycle.pausedAt) throw new Error('Only a paused mesocycle can be resumed.');
  const pausedDate = parseLocalDate(mesocycle.pausedOn) ?? localDateFromInstant(mesocycle.pausedAt);
  const resumedDate = localDateFromInstant(at);
  if (!pausedDate || !resumedDate || resumedDate < pausedDate) throw new Error('Resume timestamp must not precede the pause.');
  const shiftDays = calendarDayDifference(pausedDate, resumedDate);
  const shiftedPlannedSessionIds = flattenMesocycleEntries(mesocycle).flatMap(({ weekNumber, dayOffset, entry }) => {
    if (!isRoutine(entry) || !isExecutablePlannedSession(entry) || hasAttempt(attempts, mesocycle.id, weekNumber, entry.id)) return [];
    const scheduled = derivePlannedEntryDate(mesocycle, entry.id, dayOffset);
    return scheduled && scheduled >= pausedDate ? [entry.id] : [];
  });
  return {
    ...mesocycle,
    status: 'active',
    pausedAt: undefined,
    pausedOn: undefined,
    scheduleShiftDays: (mesocycle.scheduleShiftDays ?? 0) + shiftDays,
    lifecycleHistory: [...(mesocycle.lifecycleHistory ?? []), { type: 'resumed', at, localDate: formatLocalDate(resumedDate), pauseStartedAt: mesocycle.pausedAt, pauseStartedDate: formatLocalDate(pausedDate), shiftDays, shiftedPlannedSessionIds }],
  };
}

export function extendMesocycle(mesocycle: Mesocycle, additionalWeeks: number, weekId: () => string = generateId): Mesocycle {
  if (!Number.isInteger(additionalWeeks) || additionalWeeks < 1) throw new Error('Extension must add at least one whole week.');
  if (mesocycle.durationWeeks + additionalWeeks > MAX_MESOCYCLE_WEEKS) throw new Error(`A mesocycle cannot exceed ${MAX_MESOCYCLE_WEEKS} weeks.`);
  if (mesocycle.status === 'completed' || mesocycle.status === 'cancelled' || mesocycle.status === 'archived') throw new Error('A terminal mesocycle cannot be extended.');
  const weeks = buildMesocycleDraft(mesocycle).weeks;
  return { ...mesocycle, durationWeeks: mesocycle.durationWeeks + additionalWeeks, weeks: [...weeks, ...Array.from({ length: additionalWeeks }, (_, index) => ({ id: weekId(), weekNumber: mesocycle.durationWeeks + index + 1, entries: [] }))] };
}

export function cancelMesocycle(mesocycle: Mesocycle, attempts: readonly WorkoutAttempt[], at: string): Mesocycle {
  if (!['scheduled', 'active', 'paused'].includes(mesocycle.status)) throw new Error('This mesocycle cannot be cancelled from its current state.');
  const cancelledDate = localDateFromInstant(at);
  if (!cancelledDate) throw new Error('Cancellation timestamp is invalid.');
  return {
    ...mesocycle,
    status: 'cancelled',
    pausedAt: undefined,
    pausedOn: undefined,
    lifecycleHistory: [...(mesocycle.lifecycleHistory ?? []), { type: 'cancelled', at }],
    weeks: mesocycle.weeks.map((week) => ({ ...week, entries: week.entries.map((entry, dayIndex) => {
      if (!isRoutine(entry) || !isExecutablePlannedSession(entry) || hasAttempt(attempts, mesocycle.id, week.weekNumber, entry.id)) return entry;
      const scheduled = derivePlannedEntryDate(mesocycle, entry.id, (week.weekNumber - 1) * 7 + dayIndex);
      return !scheduled || scheduled >= cancelledDate ? transitionPlannedSession(entry, 'cancelled', at, 'Mesocycle cancelled') : entry;
    }) })),
  };
}

export interface PlannedSessionDestination { weekNumber: number; entryId?: string }

function destinationPosition(mesocycle: Mesocycle, destination: PlannedSessionDestination) {
  const week = mesocycle.weeks.find((candidate) => candidate.weekNumber === destination.weekNumber && candidate.weekNumber <= mesocycle.durationWeeks);
  const index = destination.entryId === undefined ? -1 : week?.entries.findIndex((entry) => entry.id === destination.entryId) ?? -1;
  const entry = index >= 0 ? week?.entries[index] : undefined;
  if (!week || (destination.entryId === undefined ? week.entries.length >= 7 : !entry || isRoutine(entry))) throw new Error('Destination must be an empty or rest slot inside the mesocycle.');
  return { week, index };
}

export function eligiblePlannedSessionDestinations(mesocycle: Mesocycle, today = new Date()): PlannedSessionDestination[] {
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  return mesocycle.weeks.filter((week) => week.weekNumber <= mesocycle.durationWeeks).flatMap((week) => {
    const rest = week.entries.flatMap((entry, index) => {
      const date = derivePlannedEntryDate(mesocycle, entry.id, (week.weekNumber - 1) * 7 + index);
      return !isRoutine(entry) && (!date || date >= current) ? [{ weekNumber: week.weekNumber, entryId: entry.id }] : [];
    });
    const emptyDate = derivePlannedEntryDate(mesocycle, '__empty__', (week.weekNumber - 1) * 7 + week.entries.length);
    return [...rest, ...(week.entries.length < 7 && (!emptyDate || emptyDate >= current) ? [{ weekNumber: week.weekNumber }] : [])];
  });
}

export function addExtraordinaryPlannedSession(mesocycle: Mesocycle, routine: Routine, destination: PlannedSessionDestination, id = generateId()): Mesocycle {
  if (['completed', 'cancelled', 'archived'].includes(mesocycle.status)) throw new Error('A terminal mesocycle cannot receive extraordinary sessions.');
  const { week, index } = destinationPosition(mesocycle, destination);
  const session: PlannedSession = { id, ref: { routineId: routine.id, routineName: routine.name, source: routine.isShared ? 'shared' : 'local', shareId: routine.shareId }, routineSnapshot: snapshotPlannedRoutine(routine), order: index >= 0 ? index + 1 : week.entries.length + 1, planningState: 'pending', isExtraordinary: true, scheduleShiftDays: mesocycle.scheduleShiftDays };
  return { ...mesocycle, weeks: mesocycle.weeks.map((candidate) => candidate.weekNumber !== week.weekNumber ? candidate : { ...candidate, entries: index < 0 ? [...candidate.entries, session] : candidate.entries.map((entry, entryIndex) => entryIndex === index ? session : entry) }) };
}

export function movePlannedSession(mesocycle: Mesocycle, source: { weekNumber: number; entryId: string }, destination: PlannedSessionDestination, attempts: readonly WorkoutAttempt[], today = new Date()): Mesocycle {
  const sourceWeek = mesocycle.weeks.find((week) => week.weekNumber === source.weekNumber);
  const sourceIndex = sourceWeek?.entries.findIndex((entry) => entry.id === source.entryId) ?? -1;
  const entry = sourceIndex >= 0 ? sourceWeek?.entries[sourceIndex] : undefined;
  if (!sourceWeek || !entry || !isRoutine(entry) || plannedSessionPlanningState(entry) !== 'pending' || hasAttempt(attempts, mesocycle.id, source.weekNumber, source.entryId)) throw new Error('Only a non-attempted pending session can be moved.');
  const sourceDate = derivePlannedEntryDate(mesocycle, entry.id, (source.weekNumber - 1) * 7 + sourceIndex);
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  if (sourceDate && sourceDate < current) throw new Error('Historical planned sessions cannot be moved.');
  const { week: destinationWeek, index: destinationIndex } = destinationPosition(mesocycle, destination);
  if (destinationWeek.weekNumber === source.weekNumber && destinationIndex === sourceIndex) return mesocycle;
  const withoutSource = mesocycle.weeks.map((week) => week.weekNumber === source.weekNumber ? { ...week, entries: week.entries.filter((candidate) => candidate.id !== entry.id) } : week);
  return { ...mesocycle, weeks: withoutSource.map((week) => {
    if (week.weekNumber !== destinationWeek.weekNumber) return week;
    const adjustedIndex = destinationWeek.weekNumber === source.weekNumber && destinationIndex > sourceIndex ? destinationIndex - 1 : destinationIndex;
    const entries = adjustedIndex < 0 ? [...week.entries, entry] : week.entries.map((candidate, index) => index === adjustedIndex ? entry : candidate);
    return { ...week, entries: entries.map((candidate, index) => isRoutine(candidate) ? { ...candidate, order: index + 1 } : candidate) };
  }) };
}

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
  const entries = flattenMesocycleEntries(mesocycle);
  const start = parseLocalDate(mesocycle.startDate);
  if (!start || !entries.length) return null;
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  if (current < start) return { state: 'pre-start' };
  const currentEntry = entries.find((entry) => derivePlannedEntryDate(mesocycle, entry.entry.id, entry.dayOffset)?.getTime() === current.getTime());
  if (!currentEntry) return current <= addCalendarDays(start, mesocycle.durationWeeks * 7 - 1 + (mesocycle.scheduleShiftDays ?? 0)) ? { state: 'unplanned' } : { state: 'completed' };
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
    ? { ...mesocycle, status: 'completed', lifecycleHistory: [...(mesocycle.lifecycleHistory ?? []), { type: 'completed', at: [...attempts].sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0]?.completedAt ?? mesocycle.createdAt }] }
    : mesocycle;
}

/** Explains why a user cannot manually close a plan yet. Server validation remains authoritative. */
export function mesocycleCompletionBlockReason(mesocycle: Mesocycle, attempts: readonly WorkoutAttempt[] = [], today = new Date()): string | null {
  const hasFinalizedSession = attempts.some((attempt) => validLineage(attempt) && attempt.lineage.mesocycleId === mesocycle.id);
  if (!hasFinalizedSession) return 'Completá al menos un entrenamiento del mesociclo antes de cerrarlo.';
  const hasFutureRoutine = flattenMesocycleEntries(mesocycle).some(({ dayOffset, entry }) => (
    isRoutine(entry) && isExecutablePlannedSession(entry) && (() => {
      const scheduled = derivePlannedEntryDate(mesocycle, entry.id, dayOffset);
      const current = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
      return !!scheduled && scheduled > current;
    })()
  ));
  return hasFutureRoutine ? 'No podés cerrar el mesociclo mientras haya entrenamientos programados para fechas futuras.' : null;
}

export function completeMesocycle(mesocycle: Mesocycle, attempts: readonly WorkoutAttempt[], at: string, today = new Date()): Mesocycle {
  if (mesocycle.status !== 'active') throw new Error('Only an active mesocycle can be completed.');
  const reason = mesocycleCompletionBlockReason(mesocycle, attempts, today);
  if (reason) throw new Error(reason);
  if (!localDateFromInstant(at)) throw new Error('Completion timestamp is invalid.');
  return { ...mesocycle, status: 'completed', lifecycleHistory: [...(mesocycle.lifecycleHistory ?? []), { type: 'completed', at }] };
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
    const scheduledDate = derivePlannedEntryDate(mesocycle, entry.id, dayOffset);
    const dateLabel = scheduledDate ? { weekday: scheduledDate.toLocaleDateString(locale, { weekday: 'long' }), date: scheduledDate.toLocaleDateString(locale, { month: 'long', day: 'numeric' }) } : null;
    const current = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
    const scheduleState = !scheduledDate || Number.isNaN(today.getTime()) ? null : scheduledDate.getTime() === current.getTime() ? 'today' : scheduledDate > current ? 'upcoming' : 'past';
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
export function clonePlannedWeekEntries(entries: readonly MesocycleEntry[], scheduleShiftDays = 0): MesocycleEntry[] { return entries.map((entry, index) => {
  if (!isRoutine(entry)) return { ...entry, id: generateId() };
  const { planningTransition: _planningTransition, recoveryForPlannedSessionId: _recoveryFor, recoveredByPlannedSessionId: _recoveredBy, ...clone } = entry;
  return { ...clone, id: generateId(), order: index + 1, ref: { ...entry.ref }, planningState: 'pending', scheduleShiftDays, ...(entry.routineSnapshot ? { routineSnapshot: snapshotPlannedRoutine(entry.routineSnapshot) } : {}) };
}); }
