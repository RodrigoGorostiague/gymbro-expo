import { describe, expect, test } from 'vitest';
import { MesocycleEntry, WorkoutAttempt, WORKOUT_ATTEMPT_VERSION } from '../types';
import { hasPlannedSessionAttempt, reorderWeekEntries } from '../utils/mesocycleSchedule';

const entries: MesocycleEntry[] = [
  { id: 'future-a', ref: { routineId: 'a', routineName: 'A', source: 'local' }, order: 99 },
  { id: 'completed', ref: { routineId: 'b', routineName: 'B', source: 'local' }, order: 2, routineSnapshot: { id: 'b', name: 'B', muscleGroups: [], exercises: [], createdAt: '' } },
  { id: 'rest', kind: 'rest' },
  { id: 'future-c', ref: { routineId: 'c', routineName: 'C', source: 'local' }, order: 3 },
];
const attempt = { version: WORKOUT_ATTEMPT_VERSION, id: 'attempt', owner: 'rodaja', routineId: 'b', recordedRoutineName: 'B', completedAt: '', durationSeconds: 0, restTimerSeconds: 0, lineage: { mesocycleId: 'm', weekNumber: 1, plannedSessionId: 'completed' }, exercises: [], completion: { validSets: 0, plannedSets: 0, adherence: 0, displayPercent: 0, status: 'partial' }, reward: { setGems: 0, completionGems: 0, fullCompletionBonus: 0, totalGems: 0, qualifiesForCompletion: false }, rewardApplication: { id: 'receipt', state: 'pending' } } satisfies WorkoutAttempt;

describe('mesocycle schedule reordering', () => {
  test('keeps attempted entries at the same day while normalizing future routine order', () => {
    const locked = new Set(['completed']);
    const result = reorderWeekEntries(entries, 3, 0, locked);
    expect(result.map((entry) => entry.id)).toEqual(['future-c', 'completed', 'future-a', 'rest']);
    expect(result[1]).toMatchObject({ id: 'completed', routineSnapshot: (entries[1] as Exclude<MesocycleEntry, { kind: 'rest' }>).routineSnapshot });
    expect(result.filter((entry): entry is Exclude<MesocycleEntry, { kind: 'rest' }> => !('kind' in entry)).map((entry) => entry.order)).toEqual([1, 2, 3]);
  });

  test('identifies an attempted planned session and refuses to move it', () => {
    expect(hasPlannedSessionAttempt([attempt], 'm', 1, 'completed')).toBe(true);
    expect(reorderWeekEntries(entries, 1, 3, new Set(['completed']))).toEqual(entries);
  });
});
