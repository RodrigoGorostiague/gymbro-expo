import { describe, expect, test } from 'vitest';
import { ownMuscleDistribution } from '../utils/muscleDistribution';
import type { WorkoutAttempt } from '../types';

const now = new Date('2026-08-09T12:00:00Z').getTime();
const attempt = (completedAt: string, performed = true): WorkoutAttempt => ({
  version: 1, id: completedAt, owner: 'member-1', routineId: null, recordedRoutineName: 'Upper', completedAt, durationSeconds: 10, restTimerSeconds: 0,
  completion: { validSets: 1, plannedSets: 1, adherence: 1, displayPercent: 100, status: 'fully-completed' }, reward: { setGems: 1, completionGems: 0, fullCompletionBonus: 0, totalGems: 1, qualifiesForCompletion: true }, rewardApplication: { id: completedAt, state: 'pending' },
  exercises: [{ exerciseId: 'press', recordedName: 'Press', attribution: null, catalog: { movementPattern: null, muscleParticipations: [{ muscleGroupId: 'chest', role: 'Principal', relevance: 1, originalLabel: 'Pecho' }] }, sets: [{ plan: { id: 'set', type: 1, targetLoad: 0, targetReps: 1 }, result: { setId: 'set', performed, performance: performed ? { mode: 'external-load', reps: 1, load: 0, unit: 'kg' } : null } }] }],
});

describe('ownMuscleDistribution', () => {
  test('derives the private profile radar from recent completed local attempts', () => {
    const groups = [{ id: 'chest', name: 'Pecho', displayName: 'Pecho', type: 'Grupo padre', level: 1, visibleInFilters: true, path: 'Tronco > Pecho' }];
    expect(ownMuscleDistribution([attempt('2026-08-01T12:00:00Z'), attempt('2026-04-01T12:00:00Z'), attempt('2026-08-02T12:00:00Z', false)], groups, now)).toEqual([{ id: 'chest', label: 'Pecho', value: 1 }]);
  });
});
