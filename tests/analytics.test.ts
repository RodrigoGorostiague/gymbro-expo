import { afterEach, describe, expect, test, vi } from 'vitest';
import { AttemptExerciseSnapshot, SetPerformance, WORKOUT_ATTEMPT_VERSION, WorkoutAttempt } from '../types';
import {
  buildHistoricalOptions,
  getDefaultComparisonPeriods,
  selectCoreProgressSignals,
  selectExercisePerformance,
  selectRoutineDetails,
  selectTrainingStatistics,
  selectWeightedExposure,
  bodyWeightAt,
  aggregateMuscleStatistics,
} from '../utils/analytics';

const attempt = ({
  id,
  owner = 'rodaja',
  completedAt,
  durationSeconds = 60,
  validSets = 1,
  plannedSets = 1,
  routineId = 'routine-1',
  recordedRoutineName = 'Routine',
  exercises = [],
}: {
  id: string;
  owner?: 'rodaja' | 'brisas';
  completedAt: string;
  durationSeconds?: number;
  validSets?: number;
  plannedSets?: number;
  routineId?: string | null;
  recordedRoutineName?: string;
  exercises?: readonly AttemptExerciseSnapshot[];
}): WorkoutAttempt => ({
  version: WORKOUT_ATTEMPT_VERSION,
  id,
  owner,
  routineId,
  recordedRoutineName,
  completedAt,
  durationSeconds,
  restTimerSeconds: 0,
  exercises,
  completion: {
    validSets,
    plannedSets,
    adherence: plannedSets === 0 ? 0 : validSets / plannedSets,
    displayPercent: plannedSets === 0 ? 0 : Math.round(validSets / plannedSets * 100),
    status: validSets === plannedSets && plannedSets > 0 ? 'fully-completed' : 'partial',
  },
  reward: {
    setGems: validSets,
    completionGems: 0,
    fullCompletionBonus: 0,
    totalGems: validSets,
    qualifiesForCompletion: false,
  },
  rewardApplication: { id: `${owner}:${id}:v1`, state: 'pending' },
});

const exercise = (
  exerciseId: string | null,
  recordedName: string,
  performances: readonly [string, 'C' | 'F' | number, SetPerformance][],
  attribution: AttemptExerciseSnapshot['attribution'] = { primary: 'pecho', secondary: [] },
): AttemptExerciseSnapshot => ({
  exerciseId,
  recordedName,
  attribution,
  sets: performances.map(([id, type, performance]) => ({
    plan: { id, type },
    result: { setId: id, performed: true, performance },
  })),
});

afterEach(() => vi.useRealTimers());

describe('core progress periods', () => {
  test('defaults to adjacent local-calendar half-open seven-day periods', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10, 15, 30));

    const periods = getDefaultComparisonPeriods();

    expect(periods.current.start).toEqual(new Date(2026, 2, 4));
    expect(periods.current.end).toEqual(new Date(2026, 2, 11));
    expect(periods.previous.start).toEqual(new Date(2026, 1, 25));
    expect(periods.previous.end).toEqual(periods.current.start);
    expect((periods.current.end.getTime() - periods.current.start.getTime()) / 3_600_000).toBe(167);
  });

  test('assigns exact boundaries once and excludes records outside the bounded 14 days', () => {
    const now = new Date(2026, 2, 10, 12);
    const periods = getDefaultComparisonPeriods(now);
    const result = selectCoreProgressSignals([
      attempt({ id: 'previous-start', completedAt: periods.previous.start.toISOString() }),
      attempt({ id: 'current-start', completedAt: periods.current.start.toISOString() }),
      attempt({ id: 'current-end', completedAt: periods.current.end.toISOString() }),
      attempt({ id: 'before', completedAt: new Date(periods.previous.start.getTime() - 1).toISOString() }),
    ], 'rodaja', now);

    expect(result.previous.attempts).toBe(1);
    expect(result.current.attempts).toBe(1);
  });
});

describe('core progress signals', () => {
  test('aggregates only owned attempts in one period scan and keeps signals independent', () => {
    const now = new Date(2026, 6, 24, 12);
    const { current, previous } = getDefaultComparisonPeriods(now);
    const result = selectCoreProgressSignals([
      attempt({ id: 'c1', completedAt: current.start.toISOString(), durationSeconds: 120, validSets: 1, plannedSets: 2 }),
      attempt({ id: 'c2', completedAt: new Date(current.start.getTime() + 1).toISOString(), durationSeconds: 180, validSets: 9, plannedSets: 10 }),
      attempt({ id: 'other-owner', owner: 'brisas', completedAt: current.start.toISOString(), durationSeconds: 999, validSets: 99, plannedSets: 99 }),
      attempt({ id: 'p1', completedAt: previous.start.toISOString(), durationSeconds: 100, validSets: 4, plannedSets: 5 }),
    ], 'rodaja', now);

    expect(result.current).toEqual({
      attempts: 2,
      durationSeconds: 300,
      validSets: 10,
      plannedSets: 12,
      adherence: 10 / 12,
    });
    expect(result.previous.adherence).toBe(0.8);
    expect(result.comparisons.attempts).toMatchObject({ current: 2, previous: 1, percentageDelta: 100, state: 'comparable' });
    expect(result.comparisons.durationSeconds.percentageDelta).toBe(200);
    expect(result.comparisons.validSets.percentageDelta).toBe(150);
    expect(result.comparisons.adherence.percentageDelta).toBe(4.2);
    expect(result).not.toHaveProperty('score');
  });

  test('counts each completion valid set once regardless of multi-muscle attribution', () => {
    const now = new Date(2026, 6, 24, 12);
    const periods = getDefaultComparisonPeriods(now);
    const value: WorkoutAttempt = {
      ...attempt({ id: 'multi', completedAt: periods.current.start.toISOString(), validSets: 1, plannedSets: 1 }),
      exercises: [{
        exerciseId: 'exercise-1',
        recordedName: 'Press',
        attribution: { primary: 'pecho', secondary: ['tríceps', 'hombros'] },
        sets: [],
      }],
    };

    expect(selectCoreProgressSignals([value], 'rodaja', now).current.validSets).toBe(1);
  });

  test('returns absolute zero or missing values without fabricating baseline percentages', () => {
    const now = new Date(2026, 6, 24, 12);
    const periods = getDefaultComparisonPeriods(now);
    const result = selectCoreProgressSignals([
      attempt({ id: 'current', completedAt: periods.current.start.toISOString(), durationSeconds: 120, validSets: 2, plannedSets: 4 }),
      attempt({ id: 'zero-plan', completedAt: periods.previous.start.toISOString(), durationSeconds: 0, validSets: 0, plannedSets: 0 }),
    ], 'rodaja', now);

    expect(result.comparisons.durationSeconds).toEqual({ current: 120, previous: 0, percentageDelta: null, state: 'insufficient' });
    expect(result.comparisons.validSets).toEqual({ current: 2, previous: 0, percentageDelta: null, state: 'insufficient' });
    expect(result.comparisons.adherence).toEqual({ current: 0.5, previous: null, percentageDelta: null, state: 'insufficient' });
  });
});

describe('advanced scoped progress selectors', () => {
  test('groups only stable identities and keeps renamed, deleted, recreated, and unknown snapshots distinct', () => {
    const values = [
      attempt({ id: 'old', completedAt: '2026-07-20T12:00:00Z', routineId: 'r1', recordedRoutineName: 'Old routine', exercises: [exercise('e1', 'Old press', [])] }),
      attempt({ id: 'new', completedAt: '2026-07-21T12:00:00Z', routineId: 'r1', recordedRoutineName: 'New routine', exercises: [exercise('e1', 'New press', []), exercise('e2', 'Old press', []), exercise(null, 'Legacy press', [])] }),
    ];

    const options = buildHistoricalOptions(values, 'rodaja', ['e2'], []);

    expect(options.exercises).toEqual([
      { id: 'e1', label: 'New press', labels: ['Old press', 'New press'], historical: true },
      { id: 'e2', label: 'Old press', labels: ['Old press'], historical: false },
    ]);
    expect(options.routines[0]).toMatchObject({ id: 'r1', labels: ['Old routine', 'New routine'], historical: true });
    expect(options.unknownExercises).toBe(1);
  });

  test('partitions performance by identity, mode, and unit without merging incompatible signals', () => {
    const now = new Date(2026, 6, 24, 12);
    const { previous, current } = getDefaultComparisonPeriods(now);
    const values = [
      attempt({ id: 'p', completedAt: previous.start.toISOString(), exercises: [exercise('e1', 'Press', [['p', 1, { mode: 'external-load', reps: 5, load: 0, unit: 'kg' }]])] }),
      attempt({ id: 'c1', completedAt: current.start.toISOString(), exercises: [exercise('e1', 'Press', [['c1', 1, { mode: 'external-load', reps: 6, load: 20, unit: 'kg' }]])] }),
      attempt({ id: 'c2', completedAt: new Date(current.start.getTime() + 1).toISOString(), exercises: [exercise('e1', 'Press', [['c2', 1, { mode: 'assisted', reps: 8, assistance: 10, unit: 'kg' }]])] }),
    ];

    const result = selectExercisePerformance(values, 'rodaja', 'e1', now);

    expect(result.state).toBe('incompatible');
    expect(result.partitions).toHaveLength(2);
    expect(result.partitions[0].trends.load).toMatchObject({ current: 20, previous: 0, state: 'insufficient' });
    expect(result.partitions[1]).toMatchObject({ mode: 'assisted', observationCount: 1 });
    expect(selectExercisePerformance(values.slice(0, 2), 'rodaja', 'e1', now).state).toBe('zero-baseline');
  });

  test('never reports a period trend from two observations in the same period', () => {
    const now = new Date(2026, 6, 24, 12);
    const start = getDefaultComparisonPeriods(now).current.start.getTime();
    const values = [1, 2].map((value) => attempt({
      id: `${value}`, completedAt: new Date(start + value).toISOString(),
      exercises: [exercise('e1', 'Press', [[`${value}`, 1, { mode: 'external-load', reps: value, load: 20, unit: 'kg' }]])],
    }));

    expect(selectExercisePerformance(values, 'rodaja', 'e1', now).partitions[0].trends.reps)
      .toEqual({ current: 2, previous: null, percentageDelta: null, state: 'insufficient' });
    expect(selectExercisePerformance(values, 'rodaja', 'e1', now).state).toBe('insufficient');
  });

  test('compares identical multi-set workouts without set-order false changes', () => {
    const now = new Date(2026, 6, 24, 12);
    const { previous, current } = getDefaultComparisonPeriods(now);
    const sets: readonly [string, number, SetPerformance][] = [
      ['heavy', 1, { mode: 'external-load', reps: 5, load: 40, unit: 'kg' }],
      ['volume', 2, { mode: 'external-load', reps: 10, load: 20, unit: 'kg' }],
    ];
    const result = selectExercisePerformance([
      attempt({ id: 'previous', completedAt: previous.start.toISOString(), exercises: [exercise('e1', 'Press', sets)] }),
      attempt({ id: 'current', completedAt: current.start.toISOString(), exercises: [exercise('e1', 'Press', sets)] }),
    ], 'rodaja', 'e1', now);

    expect(result.partitions[0]).toMatchObject({ observationCount: 2 });
    expect(result.partitions[0].trends.reps).toMatchObject({ percentageDelta: 0 });
    expect(result.partitions[0].trends.load).toMatchObject({ percentageDelta: 0 });
    expect(result.partitions[0].trends.volume).toMatchObject({ percentageDelta: 0 });
  });

  test('distinguishes sparse states and bounds chart points while summaries use every observation', () => {
    const now = new Date(2026, 6, 24, 12);
    const start = getDefaultComparisonPeriods(now).previous.start.getTime();
    const values = Array.from({ length: 10 }, (_, index) => attempt({
      id: `${index}`,
      completedAt: new Date(start + index * 86_400_000).toISOString(),
      exercises: [exercise('e1', 'Press', [[`${index}`, 1, { mode: 'bodyweight', reps: index + 1, bodyweight: 70, unit: 'kg' }]])],
    }));

    const dense = selectExercisePerformance(values, 'rodaja', 'e1', now, 4);
    expect(dense).toMatchObject({ state: 'valid-trend' });
    expect(dense.partitions[0]).toMatchObject({ observationCount: 10 });
    expect(dense.partitions[0].series).toHaveLength(4);
    expect(dense.partitions[0].trends.reps).toMatchObject({ current: 10, previous: 1, state: 'comparable' });
    expect(selectExercisePerformance([], 'rodaja', 'e1', now).state).toBe('no-data');
    expect(selectExercisePerformance(values.slice(0, 1), 'rodaja', 'e1', now).state).toBe('insufficient');
    expect(selectExercisePerformance(values, 'rodaja', null, now).state).toBe('unknown');
  });

  test('aggregates eligible weighted exposure and routine detail signals by deterministic periods', () => {
    const now = new Date(2026, 6, 24, 12);
    const { previous, current } = getDefaultComparisonPeriods(now);
    const values = [
      attempt({ id: 'p', completedAt: previous.start.toISOString(), durationSeconds: 100, validSets: 1, plannedSets: 2, exercises: [exercise('e1', 'Press', [['p', 1, { mode: 'external-load', reps: 5, load: 10, unit: 'kg' }]], { primary: 'pecho', secondary: ['tríceps'] })] }),
      attempt({ id: 'c1', completedAt: current.start.toISOString(), durationSeconds: 200, exercises: [exercise('e1', 'Press', [['warmup', 'C', { mode: 'external-load', reps: 5, load: 5, unit: 'kg' }], ['work', 'F', { mode: 'external-load', reps: 10, load: 20, unit: 'kg' }]], { primary: 'pecho', secondary: ['tríceps'], weights: { pecho: 0.8, tríceps: 0.2 } })] }),
      attempt({ id: 'c2', completedAt: new Date(current.start.getTime() + 1).toISOString(), durationSeconds: 400 }),
    ];

    expect(selectWeightedExposure(values, 'rodaja', now)).toEqual({
      current: { pecho: 0.8, tríceps: 0.2 },
      previous: { pecho: 1, tríceps: 0.4 },
    });
    const details = selectRoutineDetails(values, 'rodaja', 'routine-1', now);
    expect(details.current).toMatchObject({ completionCount: 2, medianDurationSeconds: 300, adherence: 1, workload: { kg: 200 } });
    expect(details.previous).toMatchObject({ completionCount: 0, medianDurationSeconds: 100, adherence: 0.5, workload: { kg: 50 } });
    expect(details.current?.lastPerformed).toBe(values[2].completedAt);
    expect(details.workloadComparisons?.kg).toMatchObject({ current: 200, previous: 50, percentageDelta: 300 });
  });

  test('summarizes effective sets, frozen muscular relevance, patterns, records, and body weight', () => {
    const now = new Date(2026, 6, 24, 12);
    const { current } = getDefaultComparisonPeriods(now);
    const previousAttempt = attempt({ id: 'previous', completedAt: new Date(current.start.getTime() - 1).toISOString(), exercises: [exercise('press', 'Press', [['p', 1, { mode: 'external-load', reps: 5, load: 50, unit: 'kg' }]])] });
    const currentAttempt = attempt({ id: 'current', completedAt: current.start.toISOString(), exercises: [{
      ...exercise('press', 'Press', [
        ['warmup', 'C', { mode: 'external-load', reps: 10, load: 20, unit: 'kg' }],
        ['work', 'F', { mode: 'external-load', reps: 8, load: 60, unit: 'kg' }],
      ]),
      catalog: { movementPattern: 'Empuje horizontal', muscleParticipations: [
        { muscleGroupId: 'pecho', role: 'Principal', relevance: 1, originalLabel: 'Pecho' },
        { muscleGroupId: 'tríceps', role: 'Secundario', relevance: 0.4, originalLabel: 'Tríceps' },
      ] },
    }] });

    const summary = selectTrainingStatistics([previousAttempt, currentAttempt], 'rodaja', current.start, current.end);
    expect(summary).toMatchObject({ sessions: 1, effectiveSets: 1, repetitions: 8, volumeByUnit: { kg: 480 }, maxLoadByUnit: { kg: 60 }, records: 1 });
    expect(summary.muscles.pecho).toMatchObject({ direct: 1, weightedSets: 1, weightedVolume: 480, frequency: 1 });
    expect(summary.muscles.tríceps).toMatchObject({ indirect: 0.4, weightedSets: 0.4, weightedVolume: 192, frequency: 0 });
    expect(summary.patterns['Empuje horizontal']).toMatchObject({ effectiveSets: 1, repetitions: 8, volume: 480, exercises: 1 });
    expect(bodyWeightAt([{ id: 'w1', owner: 'rodaja', metricType: 'body_weight', value: 75, unit: 'kg', measuredAt: '2026-07-10T10:00:00.000Z', source: 'manual' }], current.start.toISOString())).toBe(75);
    expect(aggregateMuscleStatistics(summary.muscles, ['pecho', 'pecho', 'tríceps'])).toMatchObject({ direct: 1, indirect: 0.4, weightedSets: 1.4, weightedVolume: 672, frequency: 1 });
  });
});
