import { describe, expect, test } from 'vitest';
import {
  AttemptSetPlan,
  AttemptSetResult,
  MuscleAttribution,
  Routine,
  SetPerformance,
  WORKOUT_ATTEMPT_VERSION,
  WorkoutAttempt,
} from '../types';
import {
  areCompatibleObservations,
  applySessionEdits,
  attemptToSession,
  calculateCompletion,
  finalizeAttempt,
  getExerciseExposure,
  getEligiblePerformances,
  calculateReward,
  createWorkoutAttempt,
  getGrantableGems,
  getWeightedExposure,
  isValidPerformance,
  validateAttribution,
} from '../utils/workoutAttempts';

const captureRoutine: Routine = {
  id: 'routine-1', name: 'Original routine', muscleGroups: ['pecho'], createdAt: '2026-01-01T00:00:00Z',
  exercises: [{ id: 'routine-exercise', catalogExerciseId: 'catalog-exercise', name: 'Press', muscleGroups: ['pecho', 'tríceps'], variant: 'barra',
    attribution: { primary: 'pecho', secondary: ['tríceps'] },
    sets: [{ id: 'warmup', tipo: 'C', weight: 10, reps: 10 }, { id: 'failure', tipo: 'F', weight: 20, reps: 0 }] }],
};

const plans = (count: number): AttemptSetPlan[] =>
  Array.from({ length: count }, (_, index) => ({ id: `set-${index}`, type: index === 0 ? 'F' : 1 }));
const results = (count: number): AttemptSetResult[] =>
  Array.from({ length: count }, (_, index) => ({
    setId: `set-${index}`, performed: true,
    performance: { mode: 'external-load', reps: 8, load: 20, unit: 'kg' },
  }));
describe('workout attempt contracts', () => {
  test('records profile, version, stable snapshots, and explicit unknown identity', () => {
    const source = { name: 'Historical routine' };
    const attempt = {
      version: WORKOUT_ATTEMPT_VERSION, id: 'attempt-1', owner: 'rodaja', routineId: null,
      recordedRoutineName: source.name, completedAt: '2026-07-24T10:00:00.000Z',
      durationSeconds: 60, restTimerSeconds: 30, exercises: [],
      completion: calculateCompletion([], []), reward: calculateReward(calculateCompletion([], [])),
      rewardApplication: { id: 'rodaja:attempt-1:v1', state: 'pending' },
    } satisfies WorkoutAttempt;
    source.name = 'Renamed routine';
    expect(attempt).toMatchObject({ version: 1, owner: 'rodaja', routineId: null });
    expect(attempt.recordedRoutineName).toBe('Historical routine');
  });

  test.each([[69, 'partial'], [70, 'completed'], [99, 'completed'], [100, 'fully-completed']] as const)(
    'classifies %i percent adherence without rounding thresholds',
    (valid, status) => expect(calculateCompletion(plans(100), results(valid)).status).toBe(status),
  );

  test('classifies with unrounded adherence and rounds display only', () => {
    expect(calculateCompletion(plans(1000), results(699))).toMatchObject({
      adherence: 0.699,
      displayPercent: 70,
      status: 'partial',
    });
    expect(calculateCompletion(plans(1000), results(999))).toMatchObject({
      adherence: 0.999,
      displayPercent: 100,
      status: 'completed',
    });
  });

  test('treats zero plans as partial and requires performed mode-valid actual results', () => {
    expect(calculateCompletion([], [])).toMatchObject({ adherence: 0, status: 'partial' });
    const failurePlan: AttemptSetPlan = { id: 'failure', type: 'F' };
    const failure = { setId: 'failure', performed: true, performance: { mode: 'external-load', reps: 8, load: 0, unit: 'kg' } } satisfies AttemptSetResult;
    expect(calculateCompletion([failurePlan], [failure]).validSets).toBe(1);
    expect(calculateCompletion([failurePlan], [{ ...failure, performance: { ...failure.performance, reps: 0 } }]).validSets).toBe(0);
  });

  test('keeps partial rewards, applies completion and rounded full bonus, and prevents duplicate grants', () => {
    expect(calculateReward(calculateCompletion(plans(10), results(6)))).toMatchObject({ setGems: 6, completionGems: 0, fullCompletionBonus: 0 });
    const full = calculateReward(calculateCompletion(plans(7), results(7)));
    expect(full).toMatchObject({ setGems: 7, completionGems: 5, fullCompletionBonus: 3, totalGems: 15 });
    expect(getGrantableGems(full, { id: 'receipt', state: 'applied' })).toBe(0);
  });

  test('validates all load modes and compatible identity/mode/unit boundaries', () => {
    const values: SetPerformance[] = [
      { mode: 'external-load', reps: 5, load: 0, unit: 'kg' },
      { mode: 'bodyweight', reps: 5, bodyweight: 80, unit: 'kg' },
      { mode: 'assisted', reps: 5, assistance: 20, unit: 'kg' },
    ];
    expect(values.every(isValidPerformance)).toBe(true);
    expect(areCompatibleObservations('exercise', values[0], 'exercise', { ...values[0], reps: 6 })).toBe(true);
    expect(areCompatibleObservations(null, values[0], null, values[0])).toBe(false);
    expect(areCompatibleObservations('exercise', values[0], 'exercise', values[1])).toBe(false);
    expect(isValidPerformance({ ...values[0], reps: 1.5 })).toBe(false);
    expect(isValidPerformance({ mode: 'bodyweight', reps: 5, bodyweight: 0, unit: 'kg' })).toBe(false);
    expect(isValidPerformance({ mode: 'assisted', reps: 5, assistance: -1, unit: 'kg' })).toBe(false);
    expect(isValidPerformance({ ...values[0], unit: 'stone' } as unknown as SetPerformance)).toBe(false);
  });

  test('validates attribution and keeps weighted exposure non-additive', () => {
    const attribution: MuscleAttribution = { primary: 'pecho', secondary: ['hombros', 'tríceps'] };
    expect(validateAttribution(attribution)).toBe(true);
    expect(validateAttribution({ primary: 'pecho', secondary: ['pecho'] })).toBe(false);
    expect(validateAttribution({ primary: 'pecho', secondary: [], weights: { pecho: -1 } })).toBe(false);
    expect(validateAttribution({ primary: 'pecho', secondary: [], weights: { hombros: 0.4 } })).toBe(false);
    expect(validateAttribution({ primary: 'pecho', secondary: [], weights: { pecho: Number.NaN } })).toBe(false);
    expect(getWeightedExposure(attribution, 1)).toEqual({ pecho: 1, hombros: 0.4, tríceps: 0.4 });
    expect(getWeightedExposure({ ...attribution, weights: { pecho: 0.8, hombros: 0.2 } }, 1)).toEqual({ pecho: 0.8, hombros: 0.2, tríceps: 0.4 });
    expect(calculateCompletion(plans(1), results(1)).validSets).toBe(1);
  });

  test('includes warm-ups in adherence but excludes them from performance and exposure', () => {
    const attribution: MuscleAttribution = { primary: 'espalda', secondary: ['bíceps', 'antebrazos'] };
    const sets = [
      { plan: { id: 'warm-up', type: 'C' }, result: { setId: 'warm-up', performed: true, performance: { mode: 'external-load', reps: 10, load: 10, unit: 'kg' } } },
      { plan: { id: 'work', type: 1 }, result: { setId: 'work', performed: true, performance: { mode: 'external-load', reps: 8, load: 30, unit: 'kg' } } },
      { plan: { id: 'failure', type: 'F' }, result: { setId: 'failure', performed: true, performance: { mode: 'external-load', reps: 6, load: 30, unit: 'kg' } } },
    ] as const;

    expect(calculateCompletion(sets.map(({ plan }) => plan), sets.map(({ result }) => result)).validSets).toBe(3);
    expect(getEligiblePerformances(sets)).toEqual([sets[1].result.performance, sets[2].result.performance]);
    expect(getEligiblePerformances(sets)[1].reps).toBe(6);
    expect(getExerciseExposure(attribution, sets)).toEqual({ espalda: 2, bíceps: 0.8, antebrazos: 0.8 });
  });

  test('finalizes completion and reward deterministically without counting unknown results', () => {
    const finalization = finalizeAttempt(
      plans(10),
      [...results(7), { setId: 'not-planned', performed: true, performance: { mode: 'external-load', reps: 8, load: 20, unit: 'kg' } }],
    );

    expect(finalization.completion).toMatchObject({ validSets: 7, plannedSets: 10, status: 'completed' });
    expect(finalization.reward).toMatchObject({ setGems: 7, completionGems: 5, fullCompletionBonus: 0, totalGems: 12 });
  });

  test('captures owned immutable plans, failure reps, load semantics, muscles, completion, and reward', () => {
    const attempt = createWorkoutAttempt({
      id: 'capture', owner: 'rodaja', routine: captureRoutine, completedAt: '2026-07-25T10:00:00Z',
      durationSeconds: 90, restTimerSeconds: 30, results: {
        'routine-exercise:warmup': { performed: true, reps: 10, load: 10 },
        'routine-exercise:failure': { performed: true, reps: 8, load: 20 },
      },
    });
    expect(attempt).toMatchObject({ version: 1, owner: 'rodaja', recordedRoutineName: 'Original routine', completion: { status: 'fully-completed', validSets: 2 },
      reward: { setGems: 2, completionGems: 5, fullCompletionBonus: 2, totalGems: 9 },
      rewardApplication: { id: 'rodaja:capture:v1', state: 'pending' } });
    expect(attempt.exercises[0]).toMatchObject({ exerciseId: 'catalog-exercise', recordedName: 'Press',
      attribution: { primary: 'pecho', secondary: ['tríceps'] } });
    expect(attempt.exercises[0].sets[1]).toMatchObject({ plan: { type: 'F' }, result: { performance: { mode: 'external-load', unit: 'kg', reps: 8, load: 20 } } });
    expect(getExerciseExposure(attempt.exercises[0].attribution!, attempt.exercises[0].sets)).toEqual({ pecho: 1, tríceps: 0.4 });
  });

  test('captures role-less flat muscle groups with order-independent exposure', () => {
    const captureExposure = (muscleGroups: Routine['exercises'][number]['muscleGroups']) => {
      const routine = { ...captureRoutine, exercises: [{ ...captureRoutine.exercises[0], muscleGroups, attribution: undefined }] };
      const attempt = createWorkoutAttempt({ id: 'legacy', owner: 'rodaja', routine,
        completedAt: '2026-07-25T10:00:00Z', durationSeconds: 60, restTimerSeconds: 30,
        results: { 'routine-exercise:failure': { performed: true, reps: 8, load: 20 } } });
      const exercise = attempt.exercises[0];
      if (!exercise.attribution) throw new Error('Expected muscle attribution.');
      return getExerciseExposure(exercise.attribution, exercise.sets);
    };

    expect(captureExposure(['pecho', 'tríceps'])).toEqual({ pecho: 1, tríceps: 1 });
    expect(captureExposure(['tríceps', 'pecho'])).toEqual({ pecho: 1, tríceps: 1 });
  });

  test.each([
    ['external-load', 'lb', { mode: 'external-load', reps: 8, load: 20, unit: 'lb' }],
    ['bodyweight', 'kg', { mode: 'bodyweight', reps: 8, bodyweight: 20, unit: 'kg' }],
    ['assisted', 'lb', { mode: 'assisted', reps: 8, assistance: 20, unit: 'lb' }],
  ] as const)('captures %s exercise semantics and explicit muscle roles', (mode, unit, performance) => {
    const attribution: MuscleAttribution = {
      primary: 'tríceps', secondary: ['pecho'], weights: { tríceps: 0.7, pecho: 0.2 },
    };
    const routine = { ...captureRoutine, exercises: [{
      ...captureRoutine.exercises[0], loadMode: mode, loadUnit: unit, attribution,
    }] };
    const attempt = createWorkoutAttempt({ id: mode, owner: 'rodaja', routine,
      completedAt: '2026-07-25T10:00:00Z', durationSeconds: 60, restTimerSeconds: 30,
      results: { 'routine-exercise:failure': { performed: true, reps: 8, load: 20 } } });

    expect(attempt.exercises[0].attribution).toEqual(attribution);
    expect(attempt.exercises[0].sets[1].result.performance).toEqual(performance);
  });

  test('projects history and edits only mutable results without changing eligibility', () => {
    const attempt = createWorkoutAttempt({ id: 'editable', owner: 'rodaja', routine: captureRoutine,
      completedAt: '2026-07-25T10:00:00Z', durationSeconds: 60, restTimerSeconds: 30,
      results: { 'routine-exercise:failure': { performed: true, reps: 8, load: 20 } } });
    const session = attemptToSession(attempt);
    const edited = applySessionEdits(attempt, { ...session, completedAt: '2026-07-26T10:00:00Z',
      exercises: session.exercises.map((exercise) => ({ ...exercise, sets: exercise.sets.map((set) =>
        set.completed ? { ...set, reps: 9, weight: 22 } : set) })) });
    expect(edited.exercises[0].sets[1].result.performance).toMatchObject({ reps: 9, load: 22 });
    expect(edited.completion).toBe(attempt.completion);
    expect(edited.reward).toBe(attempt.reward);
    expect(() => applySessionEdits(attempt, { ...session, routineId: 'changed' })).toThrow('inmutable');
  });
});
