import { MesocycleEntry, PlannedSession, WorkoutAttempt } from '../types';

const isRoutine = (entry: MesocycleEntry): entry is PlannedSession => !('kind' in entry && entry.kind === 'rest');

export function hasPlannedSessionAttempt(attempts: readonly WorkoutAttempt[], mesocycleId: string, weekNumber: number, plannedSessionId: string): boolean {
  return attempts.some((attempt) => attempt.lineage?.mesocycleId === mesocycleId
    && attempt.lineage.weekNumber === weekNumber
    && attempt.lineage.plannedSessionId === plannedSessionId);
}

/** Reorders only future slots. Attempted sessions remain at their historical position and date. */
export function reorderWeekEntries(entries: readonly MesocycleEntry[], fromIndex: number, toIndex: number, lockedEntryIds: ReadonlySet<string>): MesocycleEntry[] {
  const source = entries[fromIndex];
  if (!source || lockedEntryIds.has(source.id)) return [...entries];
  const movableIndexes = entries.flatMap((entry, index) => lockedEntryIds.has(entry.id) ? [] : [index]);
  const sourceMovableIndex = movableIndexes.indexOf(fromIndex);
  const destinationMovableIndex = movableIndexes.reduce((result, index, movableIndex) => index <= toIndex ? movableIndex : result, 0);
  if (sourceMovableIndex < 0 || sourceMovableIndex === destinationMovableIndex) return [...entries];
  const movable = movableIndexes.map((index) => entries[index]);
  const [moved] = movable.splice(sourceMovableIndex, 1);
  movable.splice(destinationMovableIndex, 0, moved);
  let cursor = 0;
  return entries.map((entry) => lockedEntryIds.has(entry.id) ? entry : movable[cursor++]).map((entry, index) =>
    isRoutine(entry) ? { ...entry, order: index + 1 } : entry,
  );
}
