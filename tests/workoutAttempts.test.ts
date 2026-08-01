import { describe, expect, test } from 'vitest';
import {
  AttemptSetPlan,
  AttemptSetResult,
  MuscleAttribution,
  Mesocycle,
  Routine,
  SetPerformance,
  WORKOUT_ATTEMPT_VERSION,
  WorkoutAttempt,
  WorkoutLineage,
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
import { deriveMesocycleAdherence, deriveMesocycleScheduleProjection, deriveScheduleDateLabel } from '../utils/mesocycles';

const captureRoutine: Routine = {
  id: 'routine-1', name: 'Original routine', muscleGroups: ['pecho'], createdAt: '2026-01-01T00:00:00Z',
  exercises: [{ id: 'routine-exercise', catalogExerciseId: 'catalog-exercise', name: 'Press', muscleGroups: ['pecho', 'tríceps'], variant: 'barra',
    attribution: { primary: 'pecho', secondary: ['tríceps'] },
    sets: [{ id: 'warmup', tipo: 'C', weight: 10, reps: 10 }, { id: 'failure', tipo: 'F', weight: 20, reps: 0 }] }],
};

const lineage: WorkoutLineage = {
  mesocycleId: 'mesocycle-1',
  weekNumber: 1,
  plannedSessionId: 'session-1',
};

const plans = (count: number): AttemptSetPlan[] =>
  Array.from({ length: count }, (_, index) => ({ id: `set-${index}`, type: index === 0 ? 'F' : 1 }));
const results = (count: number): AttemptSetResult[] =>
  Array.from({ length: count }, (_, index) => ({
    setId: `set-${index}`, performed: true,
    performance: { mode: 'external-load', reps: 8, load: 20, unit: 'kg' },
  }));

const adherenceMesocycle: Mesocycle = {
  id: 'mesocycle-1', name: 'Adherence block', goal: '', status: 'active', durationWeeks: 1,
  createdAt: '2026-07-25T00:00:00.000Z', weeks: [{
    id: 'week-1', weekNumber: 1, entries: [
      { id: 'session-1', ref: { routineId: 'routine-1', routineName: 'Upper', source: 'local' }, order: 1 },
      { id: 'session-2', ref: { routineId: 'routine-2', routineName: 'Lower', source: 'local' }, order: 2 },
    ],
  }],
};

const adherenceAttempt = (
  id: string,
  completedAt: string,
  status: WorkoutAttempt['completion']['status'],
  displayPercent: number,
  attemptLineage?: WorkoutLineage,
): WorkoutAttempt => ({
  version: WORKOUT_ATTEMPT_VERSION, id, owner: 'rodaja', routineId: 'routine-1', recordedRoutineName: 'Routine',
  completedAt, durationSeconds: 60, restTimerSeconds: 30, lineage: attemptLineage, exercises: [],
  completion: { validSets: 1, plannedSets: 1, adherence: displayPercent / 100, displayPercent, status },
  reward: { setGems: 0, completionGems: 0, fullCompletionBonus: 0, totalGems: 0, qualifiesForCompletion: status !== 'partial' },
  rewardApplication: { id: `rodaja:${id}:v1`, state: 'pending' },
});
const projectedAttempt = (
  id: string,
  completedAt: string,
  status: WorkoutAttempt['completion']['status'],
  validSets: number,
  plannedSets: number,
  exercises: WorkoutAttempt['exercises'],
  attemptLineage: WorkoutLineage = lineage,
): WorkoutAttempt => ({
  ...adherenceAttempt(id, completedAt, status, Math.round(validSets / plannedSets * 100), attemptLineage),
  exercises,
  completion: { validSets, plannedSets, adherence: validSets / plannedSets, displayPercent: Math.round(validSets / plannedSets * 100), status },
  reward: { setGems: validSets, completionGems: validSets / plannedSets >= 0.7 ? 5 : 0, fullCompletionBonus: 0, totalGems: validSets, qualifiesForCompletion: validSets / plannedSets >= 0.7 },
});
const validSet = (id: string) => ({
  plan: { id, type: 1 as const },
  result: { setId: id, performed: true, performance: { mode: 'external-load' as const, reps: 8, load: 20, unit: 'kg' as const } },
});
const invalidSet = (id: string) => ({
  plan: { id, type: 1 as const },
  result: { setId: id, performed: false, performance: null },
});
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
      }, lineage,
    });
    expect(attempt).toMatchObject({ version: 1, owner: 'rodaja', recordedRoutineName: 'Original routine', completion: { status: 'fully-completed', validSets: 2 },
      reward: { setGems: 2, completionGems: 5, fullCompletionBonus: 2, totalGems: 9 },
      rewardApplication: { id: 'rodaja:capture:v1', state: 'pending' }, lineage });
    expect(attempt.exercises[0]).toMatchObject({ exerciseId: 'catalog-exercise', recordedName: 'Press',
      attribution: { primary: 'pecho', secondary: ['tríceps'] } });
    expect(attempt.exercises[0].sets[1]).toMatchObject({ plan: { type: 'F' }, result: { performance: { mode: 'external-load', unit: 'kg', reps: 8, load: 20 } } });
    expect(attemptToSession(attempt).exercises[0].muscleGroupIds).toEqual(['pecho', 'tríceps']);
    expect(getExerciseExposure(attempt.exercises[0].attribution!, attempt.exercises[0].sets)).toEqual({ pecho: 1, tríceps: 0.4 });
  });

  test('downgrades partial lineage to routine-only history', () => {
    const attempt = createWorkoutAttempt({
      id: 'partial-lineage', owner: 'rodaja', routine: captureRoutine, completedAt: '2026-07-25T10:00:00Z',
      durationSeconds: 90, restTimerSeconds: 30, lineage: { ...lineage, plannedSessionId: '' },
      results: {
        'routine-exercise:warmup': { performed: true, reps: 10, load: 10 },
        'routine-exercise:failure': { performed: true, reps: 8, load: 20 },
      },
    });

    expect(attempt.lineage).toBeUndefined();
    expect(attemptToSession(attempt).lineage).toBeUndefined();
  });

  test('derives lineage-aware adherence once per session with partial progress and neutral legacy attempts', () => {
    const adherence = deriveMesocycleAdherence(adherenceMesocycle, [
      adherenceAttempt('older-completed', '2026-07-25T09:00:00.000Z', 'fully-completed', 100, lineage),
      adherenceAttempt('latest-partial', '2026-07-25T10:00:00.000Z', 'partial', 40, lineage),
      adherenceAttempt('completed-session-2', '2026-07-25T11:00:00.000Z', 'completed', 70, { ...lineage, plannedSessionId: 'session-2' }),
      adherenceAttempt('routine-only', '2026-07-25T12:00:00.000Z', 'fully-completed', 100),
      adherenceAttempt('other-mesocycle', '2026-07-25T12:00:00.000Z', 'fully-completed', 100, { ...lineage, mesocycleId: 'other' }),
    ]);

    expect(adherence).toMatchObject({ plannedSessions: 2, completedSessions: 1 });
    expect(adherence.weeks[0]).toMatchObject({ plannedSessions: 2, completedSessions: 1 });
    expect(adherence.weeks[0].sessionStates).toMatchObject([
      { plannedSessionId: 'session-1', status: 'partial', displayPercent: 40, authoritativeAttemptId: 'latest-partial' },
      { plannedSessionId: 'session-2', status: 'completed', displayPercent: 70, authoritativeAttemptId: 'completed-session-2' },
    ]);
  });

  test('derives local schedule labels from flattened offsets and rejects invalid start dates', () => {
    expect(deriveScheduleDateLabel('2026-06-01', 0, 'en-US')).toEqual({ weekday: 'Monday', date: 'June 1' });
    expect(deriveScheduleDateLabel('2026-06-01', 2, 'en-US')).toEqual({ weekday: 'Wednesday', date: 'June 3' });
    expect(deriveScheduleDateLabel('2026-02-30', 0, 'en-US')).toBeNull();
    expect(deriveScheduleDateLabel(undefined, 0, 'en-US')).toBeNull();
  });

  test('projects the latest lineage attempt with valid-set and fully-valid exercise progress', () => {
    const partialExercises = [
      { exerciseId: 'press', recordedName: 'Press', attribution: null, sets: [validSet('press-1'), validSet('press-2')] },
      { exerciseId: 'row', recordedName: 'Row', attribution: null, sets: [validSet('row-1'), invalidSet('row-2')] },
    ] as const;
    const staleExercises = [{ exerciseId: 'press', recordedName: 'Press', attribution: null, sets: [validSet('press-1')] }] as const;
    const adherence = deriveMesocycleAdherence(adherenceMesocycle, [
      projectedAttempt('a-older', '2026-07-25T10:00:00.000Z', 'fully-completed', 1, 1, staleExercises),
      projectedAttempt('z-newer', '2026-07-25T10:00:00.000Z', 'completed', 3, 4, partialExercises),
    ]);

    expect(adherence.weeks[0].sessionStates[0]).toMatchObject({
      authoritativeAttemptId: 'z-newer', status: 'completed', fullyCompleted: false,
      validSets: 3, plannedSets: 4, completedExercises: 1, plannedExercises: 2, displayPercent: 75,
    });
    expect(adherence.weeks[0].sessionStates[1]).toMatchObject({
      status: 'not-started', fullyCompleted: false,
      validSets: 0, plannedSets: 0, completedExercises: 0, plannedExercises: 0, displayPercent: null,
    });
  });

  test('keeps play eligible when 70 percent earns a reward without full completion', () => {
    const attempt = projectedAttempt('reward-partial', '2026-07-25T10:00:00.000Z', 'completed', 7, 10, [
      { exerciseId: 'press', recordedName: 'Press', attribution: null, sets: [validSet('press-1')] },
    ]);
    const progress = deriveMesocycleAdherence(adherenceMesocycle, [attempt]).weeks[0].sessionStates[0];

    expect(attempt.reward.qualifiesForCompletion).toBe(true);
    expect(progress).toMatchObject({ status: 'completed', fullyCompleted: false, displayPercent: 70 });
  });

  test('projects routine metadata and explicit rest state without fabricating routine progress', () => {
    const mesocycle: Mesocycle = {
      ...adherenceMesocycle,
      startDate: '2026-06-01',
      weeks: [{ ...adherenceMesocycle.weeks[0], entries: [
        adherenceMesocycle.weeks[0].entries[0],
        { id: 'rest-1', kind: 'rest' },
        { ...adherenceMesocycle.weeks[0].entries[1], ref: { routineId: 'missing', routineName: 'Missing', source: 'local' } },
      ] }],
    };
    const routines: Routine[] = [{ ...captureRoutine, id: 'routine-1', muscleGroups: ['pecho', 'tríceps'] }];

    expect(deriveMesocycleScheduleProjection(mesocycle, routines, [], 'en-US')).toMatchObject([
      {
        kind: 'routine', entryId: 'session-1', dateLabel: { weekday: 'Monday', date: 'June 1' },
        routine: { available: true, muscleGroups: ['pecho', 'tríceps'], exerciseCount: 1 },
        progress: { status: 'not-started', fullyCompleted: false, validSets: 0, plannedSets: 0 },
      },
      { kind: 'rest', entryId: 'rest-1', dateLabel: { weekday: 'Tuesday', date: 'June 2' }, progress: { status: 'rest', displayPercent: null } },
      {
        kind: 'routine', entryId: 'session-2', dateLabel: { weekday: 'Wednesday', date: 'June 3' },
        routine: { available: false, muscleGroups: [], exerciseCount: 0 },
      },
    ]);
  });

  test('projects deterministic local schedule states and remains neutral for missing or invalid starts', () => {
    const today = new Date(2026, 5, 2, 8);
    const scheduled = { ...adherenceMesocycle, startDate: '2026-06-01' };

    expect(deriveMesocycleScheduleProjection(scheduled, [], [], 'en-US', today).map(({ scheduleState }) => scheduleState)).toEqual(['past', 'today']);
    expect(deriveMesocycleScheduleProjection({ ...scheduled, startDate: '2026-06-03' }, [], [], 'en-US', today).map(({ scheduleState }) => scheduleState)).toEqual(['upcoming', 'upcoming']);
    expect(deriveMesocycleScheduleProjection({ ...scheduled, startDate: undefined }, [], [], 'en-US', today).map(({ scheduleState }) => scheduleState)).toEqual([null, null]);
    expect(deriveMesocycleScheduleProjection({ ...scheduled, startDate: '2026-02-30' }, [], [], 'en-US', today).map(({ scheduleState }) => scheduleState)).toEqual([null, null]);
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
      results: { 'routine-exercise:failure': { performed: true, reps: 8, load: 20 } }, lineage });
    const session = attemptToSession(attempt);
    expect(session.lineage).toEqual(lineage);
    const edited = applySessionEdits(attempt, { ...session, completedAt: '2026-07-26T10:00:00Z',
      exercises: session.exercises.map((exercise) => ({ ...exercise, sets: exercise.sets.map((set) =>
        set.completed ? { ...set, reps: 9, weight: 22 } : set) })) });
    expect(edited.exercises[0].sets[1].result.performance).toMatchObject({ reps: 9, load: 22 });
    expect(edited.completion).toBe(attempt.completion);
    expect(edited.reward).toBe(attempt.reward);
    expect(() => applySessionEdits(attempt, { ...session, routineId: 'changed' })).toThrow('inmutable');
  });
});
