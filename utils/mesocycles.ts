import { Mesocycle, MesocycleEntry, PlannedSession, PlannedSessionRef, Routine, WorkoutAttempt, WorkoutLineage } from '../types';
import { generateId } from './storage';
import { isValidPerformance } from './workoutAttempts';

export type PlannedSessionAdherenceStatus = 'not-started' | 'partial' | 'completed';
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
export type MesocycleDayGuidance =
  | { state: 'pre-start' | 'unplanned' | 'completed' }
  | { state: 'rest'; entryId: string; weekNumber: number }
  | { state: 'routine'; entryId: string; weekNumber: number; ref: PlannedSessionRef }
  | null;

const isRoutine = (entry: MesocycleEntry): entry is PlannedSession => !('kind' in entry && entry.kind === 'rest');
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
  | { kind: 'routine'; entryId: string; weekNumber: number; dayOffset: number; dateLabel: ScheduleDateLabel | null; scheduleState: ScheduleState | null; routine: RoutineScheduleMetadata; progress: PlannedSessionAdherence }
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
    ? { state: 'routine', entryId: currentEntry.entry.id, weekNumber: currentEntry.weekNumber, ref: currentEntry.entry.ref }
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
export function deriveMesocycleAdherence(mesocycle: Mesocycle, attempts: readonly WorkoutAttempt[] = []): MesocycleAdherence {
  const latest = new Map<string, WorkoutAttempt>();
  attempts.forEach((attempt) => {
    if (!validLineage(attempt) || attempt.lineage.mesocycleId !== mesocycle.id) return;
    const key = lineageKey(attempt.lineage.mesocycleId, attempt.lineage.weekNumber, attempt.lineage.plannedSessionId);
    const current = latest.get(key);
    if (!current || attempt.completedAt > current.completedAt || (attempt.completedAt === current.completedAt && attempt.id > current.id)) latest.set(key, attempt);
  });
  const weeks = mesocycle.weeks.map((week) => {
    const sessionStates = week.entries.filter(isRoutine).map((entry) => {
      const attempt = latest.get(lineageKey(mesocycle.id, week.weekNumber, entry.id));
      return attempt ? progressFromAttempt(entry.id, attempt) : notStartedProgress(entry.id);
    });
    return { weekNumber: week.weekNumber, plannedSessions: sessionStates.length, completedSessions: sessionStates.filter((item) => item.status === 'completed').length, sessionStates };
  });
  return { plannedSessions: weeks.reduce((n, week) => n + week.plannedSessions, 0), completedSessions: weeks.reduce((n, week) => n + week.completedSessions, 0), weeks };
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
export function countPlannedSessions(mesocycle: Mesocycle): number { return flattenMesocycleEntries(mesocycle).filter(({ entry }) => isRoutine(entry)).length; }
export function clonePlannedWeekEntries(entries: readonly MesocycleEntry[]): MesocycleEntry[] { return entries.map((entry, index) => isRoutine(entry) ? { ...entry, id: generateId(), order: index + 1, ref: { ...entry.ref } } : { ...entry, id: generateId() }); }
