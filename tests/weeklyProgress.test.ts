import { describe, expect, test } from 'vitest';
import { Mesocycle, WorkoutAttempt, WORKOUT_ATTEMPT_VERSION } from '../types';
import { selectWeeklyProgress } from '../utils/weeklyProgress';

const weeklyAttempt = (id: string, at: Date, overrides: Partial<WorkoutAttempt> = {}): WorkoutAttempt => ({
  version: WORKOUT_ATTEMPT_VERSION, id, owner: 'rodaja', routineId: 'r', recordedRoutineName: 'Upper',
  completedAt: at.toISOString(), durationSeconds: 60, restTimerSeconds: 0,
  exercises: [{ exerciseId: 'e', recordedName: 'Press', attribution: { primary: 'pecho', secondary: [] }, sets: [
    { plan: { id: 's', type: 1 }, result: { setId: 's', performed: true, performance: { mode: 'external-load', unit: 'kg', load: 10, reps: 8 } } },
  ] }],
  completion: { status: 'fully-completed', validSets: 1, plannedSets: 1, adherence: 1, displayPercent: 100 },
  reward: { setGems: 0, completionGems: 0, fullCompletionBonus: 0, totalGems: 0, qualifiesForCompletion: false },
  rewardApplication: { id, state: 'applied' }, ...overrides,
});
const now = new Date(2026, 2, 11, 10);
const plan: Mesocycle = { id: 'm', name: 'Plan', goal: '', status: 'active', durationWeeks: 1, startDate: '2026-03-09', createdAt: '', weeks: [
  { id: 'w', weekNumber: 1, entries: [{ id: 'slot', ref: { routineId: 'r', routineName: 'Upper', source: 'local' }, order: 1 }, { id: 'rest', kind: 'rest' }] },
] };

describe('weekly progress', () => {
  test('uses local Monday boundaries across DST and excludes future, other-owner and duplicate attempts', () => {
    const a = weeklyAttempt('a', new Date(2026, 2, 9, 23, 30));
    const b = weeklyAttempt('b', new Date(2026, 2, 9, 12));
    const summary = selectWeeklyProgress([a, a, b, weeklyAttempt('future', new Date(2026, 2, 11, 11)), weeklyAttempt('other', now, { owner: 'brisas' }), weeklyAttempt('pending', now, { rewardApplication: { id: 'pending', state: 'pending' } })], 'rodaja', [], now);
    expect(summary.current.start).toEqual(new Date(2026, 2, 9));
    expect(summary.previous.start).toEqual(new Date(2026, 2, 2));
    expect(summary.current.sessions).toBe(2);
    expect(summary.current.frequency).toBe(1);
    expect(summary.current.statistics.effectiveSets).toBe(2);
    expect(summary.current.muscleVolumes.kg.pecho.weightedVolume).toBe(160);
  });
  test('counts calendar slots, not unrelated workouts, and ignores rest and cancelled slots', () => {
    const solo = weeklyAttempt('solo', new Date(2026, 2, 9, 12));
    expect(selectWeeklyProgress([solo], 'rodaja', [plan], now).current.planning).toEqual({ planned: 1, completed: 0 });
    const linked = weeklyAttempt('linked', new Date(2026, 2, 10), { lineage: { mesocycleId: 'm', weekNumber: 1, plannedSessionId: 'slot' } });
    expect(selectWeeklyProgress([solo, linked, linked], 'rodaja', [plan, plan], now).current.planning).toEqual({ planned: 1, completed: 1 });
    const cancelled = { ...plan, weeks: [{ ...plan.weeks[0], entries: [{ ...plan.weeks[0].entries[0], planningState: 'cancelled' as const }] }] };
    expect(selectWeeklyProgress([], 'rodaja', [cancelled], now).current.planning).toEqual({ planned: 0, completed: 0 });
    expect(selectWeeklyProgress([weeklyAttempt('partial', now, { completion: { ...linked.completion, status: 'partial' }, lineage: linked.lineage })], 'rodaja', [plan], now).current.planning).toEqual({ planned: 1, completed: 0 });
    expect(selectWeeklyProgress([], 'rodaja', [], now).current.planning).toBeNull();
    expect(selectWeeklyProgress([], 'rodaja', [{ ...plan, startDate: undefined }], now).current.planning).toBeNull();
  });
  test('separates historical units, skips warmups, preserves missing muscle data and compares previous full week', () => {
    const prior = weeklyAttempt('prior', new Date(2026, 2, 8, 22));
    const lb = weeklyAttempt('lb', now);
    const exercise = lb.exercises[0];
    const mixed = { ...lb, exercises: [{ ...exercise, sets: [...exercise.sets, { plan: { id: 'lb', type: 1 }, result: { setId: 'lb', performed: true, performance: { mode: 'external-load' as const, unit: 'lb' as const, load: 20, reps: 5 } } }, { plan: { id: 'warmup', type: 'C' as const }, result: { setId: 'warmup', performed: true, performance: { mode: 'external-load' as const, unit: 'kg' as const, load: 100, reps: 5 } } }] }] };
    const result = selectWeeklyProgress([prior, mixed], 'rodaja', [], now);
    expect(result.previous.sessions).toBe(1);
    expect(result.current.statistics.effectiveSets).toBe(2);
    expect(result.current.muscleVolumes.kg.pecho.weightedVolume).toBe(80);
    expect(result.current.muscleVolumes.lb.pecho.weightedVolume).toBe(100);
    expect(selectWeeklyProgress([{ ...lb, exercises: [{ ...exercise, attribution: null }] }], 'rodaja', [], now).current.statistics.muscles).toEqual({});
  });
});

describe('weekly duration and omitted exercise snapshots', () => {
  test('totals saved duration including partial attempts, with the same owner, receipt, date and dedup filters', () => {
    const a = weeklyAttempt('a', now, { durationSeconds: 90 });
    const partial = weeklyAttempt('partial', now, { durationSeconds: 30, completion: { ...a.completion, status: 'partial' } });
    const previous = weeklyAttempt('previous', new Date(2026, 2, 8), { durationSeconds: 180 });
    const result = selectWeeklyProgress([a, a, partial, previous,
      weeklyAttempt('other', now, { owner: 'brisas', durationSeconds: 999 }),
      weeklyAttempt('pending', now, { rewardApplication: { id: 'pending', state: 'pending' } }),
      weeklyAttempt('future', new Date(now.getTime() + 1)), { ...a, id: 'invalid', completedAt: 'invalid' },
    ], 'rodaja', [], now);
    expect(result.current.durationSeconds).toBe(120);
    expect(result.previous.durationSeconds).toBe(180);
    expect(result.current.omittedExercises).toBe(0);
  });
  test.each([undefined, null, NaN, Infinity, -1])('does not equate missing/invalid duration %s with zero', (durationSeconds) => {
    const a = weeklyAttempt('a', now, { durationSeconds: durationSeconds as number });
    expect(selectWeeklyProgress([a, weeklyAttempt('b', now)], 'rodaja', [], now).current.durationSeconds).toBeNull();
  });
  test('distinguishes recorded zero from no attempts and absent exercise/set snapshots', () => {
    expect(selectWeeklyProgress([], 'rodaja', [], now).current).toMatchObject({ durationSeconds: null, omittedExercises: null });
    const a = weeklyAttempt('a', now, { durationSeconds: 0, exercises: [] });
    expect(selectWeeklyProgress([a], 'rodaja', [], now).current).toMatchObject({ durationSeconds: 0, omittedExercises: null });
    const b = weeklyAttempt('b', now);
    expect(selectWeeklyProgress([{ ...b, exercises: [{ ...b.exercises[0], sets: [] }] }], 'rodaja', [], now).current.omittedExercises).toBeNull();
  });
  test('counts only wholly unperformed historical exercise occurrences, including valid warmups as performed', () => {
    const a = weeklyAttempt('a', now);
    const exercise = a.exercises[0];
    const performed = exercise.sets[0];
    const skipped = { ...performed, result: { ...performed.result, performed: false, performance: null } };
    const exercises = [
      { ...exercise, sets: [skipped] },
      { ...exercise, sets: [performed, { plan: { id: 'missing', type: 1 }, result: { setId: 'missing', performed: false, performance: null } }] },
      { ...exercise, sets: [{ ...performed, plan: { ...performed.plan, type: 'C' as const } }, { ...skipped, plan: { id: 'work', type: 1 }, result: { ...skipped.result, setId: 'work' } }] },
      { ...exercise, sets: [{ ...performed, result: { ...performed.result, setId: 'mismatch' } }] },
      { ...exercise, sets: [{ ...performed, result: { ...performed.result, performance: { mode: 'external-load' as const, unit: 'kg' as const, load: 10, reps: 0 } } }] },
    ];
    const result = selectWeeklyProgress([{ ...a, exercises }], 'rodaja', [plan], now);
    expect(result.current.omittedExercises).toBe(3);
    expect(result.previous.omittedExercises).toBeNull();
  });
});

describe('weekly density', () => {
  test.each([
    [1e-306, false],
    [Number.MIN_VALUE, true],
  ] as const)('rejects non-finite density from positive duration %s (warmup: %s)', (durationSeconds, warmup) => {
    const a = weeklyAttempt('a', now, { durationSeconds });
    const exercise = a.exercises[0]; const set = exercise.sets[0];
    const attempt = warmup ? { ...a, exercises: [{ ...exercise, sets: [{ ...set, plan: { ...set.plan, type: 'C' as const } }] }] } : a;
    expect(selectWeeklyProgress([attempt], 'rodaja', [], now).current.densitySetsPerHour).toBeNull();
  });
  test('divides total effective sets by total recorded hours, including partial attempts and rest', () => {
    const a = weeklyAttempt('a', now, { durationSeconds: 1800, restTimerSeconds: 900 });
    const b = weeklyAttempt('b', now, { durationSeconds: 5400, completion: { ...a.completion, status: 'partial' } });
    const prior = weeklyAttempt('prior', new Date(2026, 2, 8), { durationSeconds: 900 });
    const result = selectWeeklyProgress([a, a, b, prior,
      weeklyAttempt('other', now, { owner: 'brisas', durationSeconds: 0 }),
      weeklyAttempt('pending', now, { durationSeconds: 0, rewardApplication: { id: 'p', state: 'pending' } }),
      weeklyAttempt('future', new Date(now.getTime() + 1), { durationSeconds: 0 }),
    ], 'rodaja', [], now);
    expect(result.current.densitySetsPerHour).toBe(1);
    expect(result.previous.densitySetsPerHour).toBe(4);
  });
  test.each([undefined, null, NaN, Infinity, -1, 0])('rejects an unknown or nonpositive session duration %s even alongside valid time', (durationSeconds) => {
    const a = weeklyAttempt('a', now, { durationSeconds: durationSeconds as number });
    expect(selectWeeklyProgress([a, weeklyAttempt('b', now)], 'rodaja', [], now).current.densitySetsPerHour).toBeNull();
  });
  test('preserves unknown snapshots rather than presenting a partial-history rate', () => {
    const a = weeklyAttempt('a', now);
    for (const exercises of [[], [{ ...a.exercises[0], sets: [] }]]) {
      expect(selectWeeklyProgress([{ ...a, exercises }, weeklyAttempt('b', now)], 'rodaja', [], now).current.densitySetsPerHour).toBeNull();
    }
    expect(selectWeeklyProgress([], 'rodaja', [], now).current.densitySetsPerHour).toBeNull();
  });
  test('supports zero effective sets with valid time and remains independent of load units', () => {
    const a = weeklyAttempt('a', now, { durationSeconds: 3600 });
    const exercise = a.exercises[0]; const set = exercise.sets[0];
    const warmup = { ...a, exercises: [{ ...exercise, sets: [{ ...set, plan: { ...set.plan, type: 'C' as const } }] }] };
    expect(selectWeeklyProgress([warmup], 'rodaja', [], now).current.densitySetsPerHour).toBe(0);
    for (const unit of ['kg', 'lb'] as const) {
      const changed = { ...a, exercises: [{ ...exercise, sets: [{ ...set, result: { ...set.result, performance: { mode: 'external-load' as const, unit, load: 200, reps: 8 } } }] }] };
      expect(selectWeeklyProgress([changed], 'rodaja', [], now).current.densitySetsPerHour).toBe(1);
    }
  });
});

describe('weekly actual effort', () => {
  const withEfforts = (id: string, efforts: unknown[], at = now) => {
    const attempt = weeklyAttempt(id, at);
    const original = attempt.exercises[0].sets[0];
    return { ...attempt, exercises: [{ ...attempt.exercises[0], sets: efforts.map((actualEffort, i) => ({
      plan: { ...original.plan, id: `s${i}`, effortTarget: { kind: 'rir' as const, value: 4 as const } },
      result: { ...original.result, setId: `s${i}`, actualEffort: actualEffort as typeof original.result.actualEffort },
    })) }] };
  };
  test('averages recorded sets, not session averages; preserves RIR zero and separates scales and weeks', () => {
    const a = withEfforts('a', [{ kind: 'rir', value: 0 }, { kind: 'rir', value: 2 }, { kind: 'rpe', value: 9 }, undefined]);
    const b = withEfforts('b', [{ kind: 'rir', value: 4 }]);
    const previous = withEfforts('previous', [{ kind: 'rpe', value: 7 }], new Date(2026, 2, 8));
    const original = JSON.stringify([a, b, previous]);
    const result = selectWeeklyProgress([a, a, b, previous], 'rodaja', [], now);
    expect(result.current.actualEffort).toEqual({ eligibleSets: 5, rir: { count: 3, average: 2 }, rpe: { count: 1, average: 9 } });
    expect(result.previous.actualEffort).toEqual({ eligibleSets: 1, rir: { count: 0, average: null }, rpe: { count: 1, average: 7 } });
    expect(JSON.stringify([a, b, previous])).toBe(original);
  });
  test('ignores warmups, invalid results and invalid effort without substituting planned targets', () => {
    const a = withEfforts('a', [undefined, { kind: 'rir', value: 6 }, { kind: 'rpe', value: 5 }, { kind: 'rir', value: 1.5 }, { kind: 'rir', value: 2 }, { kind: 'rpe', value: 8 }, { kind: 'rir', value: 1 }, { kind: 'rir', value: 3 }]);
    const sets = a.exercises[0].sets;
    sets[4] = { ...sets[4], plan: { ...sets[4].plan, type: 'C' } };
    sets[5] = { ...sets[5], result: { ...sets[5].result, performed: false } };
    sets[6] = { ...sets[6], result: { ...sets[6].result, setId: 'mismatch' } };
    sets[7] = { ...sets[7], result: { ...sets[7].result, performance: { mode: 'external-load', unit: 'kg', load: 10, reps: 0 } } };
    expect(selectWeeklyProgress([a], 'rodaja', [], now).current.actualEffort).toEqual({ eligibleSets: 4, rir: { count: 0, average: null }, rpe: { count: 0, average: null } });
  });
  test('applies owner, confirmed history, future and empty-week filters', () => {
    const a = withEfforts('a', [{ kind: 'rir', value: 0 }]);
    const result = selectWeeklyProgress([
      { ...a, owner: 'brisas' }, { ...a, id: 'pending', rewardApplication: { id: 'pending', state: 'pending' } },
      { ...a, id: 'future', completedAt: new Date(now.getTime() + 1).toISOString() },
    ], 'rodaja', [], now);
    expect(result.current.actualEffort).toEqual({ eligibleSets: 0, rir: { count: 0, average: null }, rpe: { count: 0, average: null } });
  });
});
