import { Mesocycle, PlannedSession, PlannedSessionRef } from '../types';
import { generateId } from './storage';

export function sortPlannedSessions(sessions: readonly PlannedSession[]): PlannedSession[] {
  return [...sessions].sort(
    (left, right) => left.order - right.order || left.ref.routineName.localeCompare(right.ref.routineName),
  );
}

export function deriveMesocycleWeeks(mesocycle: Mesocycle): Mesocycle['weeks'] {
  const storedWeeks = mesocycle.weeks.length > 0 ? mesocycle.weeks : [];
  const highestStoredWeek = storedWeeks.reduce((max, week) => Math.max(max, week.weekNumber), 0);
  const totalWeeks = Math.max(mesocycle.durationWeeks, highestStoredWeek, 1);
  const byNumber = new Map(storedWeeks.map((week) => [week.weekNumber, week]));

  return Array.from({ length: totalWeeks }, (_, index) => {
    const weekNumber = index + 1;
    const existing = byNumber.get(weekNumber);

    return {
      id: existing?.id ?? generateId(),
      weekNumber,
      sessions: sortPlannedSessions(existing?.sessions ?? []),
    };
  });
}

export function buildMesocycleDraft(mesocycle: Mesocycle): Mesocycle {
  return {
    ...mesocycle,
    weeks: deriveMesocycleWeeks(mesocycle),
  };
}

export function countPlannedSessions(mesocycle: Mesocycle): number {
  return mesocycle.weeks.reduce((total, week) => total + week.sessions.length, 0);
}

export function clonePlannedWeekSessions(sessions: readonly PlannedSession[]): PlannedSession[] {
  return sessions.map((session, index) => ({
    ...session,
    id: generateId(),
    order: index + 1,
    ref: { ...session.ref } as PlannedSessionRef,
  }));
}
