import { describe, expect, test } from 'vitest';
import { Mesocycle, Routine, WorkoutAttempt } from '../types';
import { createWorkoutAttempt } from '../utils/workoutAttempts';
import { seedMesocycleWorkout } from '../utils/mesocycleContinuity';

function fixture() {
  const routine: Routine = { id: 'r', name: 'Press', createdAt: '', muscleGroups: ['chest'], exercises: [{ id: 'e', catalogExerciseId: 'catalog', name: 'Press', variant: 'bar', muscleGroups: ['chest'], loadMode: 'external-load', loadUnit: 'kg', sets: [{ id: 's', tipo: 1, weight: 20, reps: 8, effortTarget: { kind: 'rir', value: 2 } }, { id: 'skip', tipo: 2, weight: 20, reps: 8 }] }] };
  const entry = (id: string) => ({ id, ref: { routineId: 'r', routineName: 'Press', source: 'local' as const }, routineSnapshot: structuredClone(routine), order: 1 });
  const block: Mesocycle = { id: 'm', name: 'Block', goal: '', status: 'active', createdAt: '', durationWeeks: 1, weeks: [{ id: 'w', weekNumber: 1, entries: [entry('before'), entry('target'), entry('after')] }] };
  const sourceRoutine = structuredClone(routine);
  sourceRoutine.exercises[0].sets[0].effortTarget = { kind: 'rpe', value: 9 };
  const attempt = createWorkoutAttempt({ id: 'a', owner: 'u', routine: sourceRoutine, completedAt: '2026-01-01T12:00:00Z', durationSeconds: 300, restTimerSeconds: 120, lineage: { mesocycleId: 'm', weekNumber: 1, plannedSessionId: 'before' }, results: { 'e:s': { performed: true, load: 25, reps: 10 } } });
  const lineage = { mesocycleId: 'm', weekNumber: 1, plannedSessionId: 'target' };
  const run = (attempts: WorkoutAttempt[] = [attempt]) => seedMesocycleWorkout(routine, [block], attempts, 'u', lineage, Date.parse('2026-01-03'));
  return { routine, block, attempt, lineage, run };
}

describe('mesocycle continuity launch seed', () => {
  test('carries performed values while preserving the planned effort target', () => {
    const f = fixture(); const before = JSON.stringify(f); const seed = f.run();
    expect(seed.values['e-s']).toEqual({ weight: '25', reps: '10' });
    expect(seed.values['e-skip']).toEqual({ weight: '20', reps: '8' });
    expect(seed.routine.exercises[0].sets[0]).toMatchObject({ weight: 20, reps: 8, effortTarget: { kind: 'rir', value: 2 } });
    expect(seed.restTimerSeconds).toBe(120);
    expect(JSON.stringify(f)).toBe(before);
  });
  test('shows previous measured effort without recording it as today’s result', () => {
    const f = fixture();
    const attempt = structuredClone(f.attempt) as any;
    attempt.exercises[0].sets[0].result.actualEffort = { kind: 'rpe', value: 8 };
    const seed = f.run([attempt]);
    expect(seed.previous['e-s']).toMatchObject({ weight: 25, reps: 10, actualEffort: { kind: 'rpe', value: 8 }, attemptId: 'a' });
    expect(seed.values['e-s']).not.toHaveProperty('actualEffort');
    expect(seed.previous['e-skip']).toBeUndefined();
    expect(seed.routine.exercises[0].sets[0].effortTarget).toEqual({ kind: 'rir', value: 2 });
  });
  test('continues through three weeks using the most recent saved values', () => {
    const f = fixture();
    const template = f.block.weeks[0].entries[0];
    f.block.durationWeeks = 3;
    f.block.weeks = [1, 2, 3].map((weekNumber) => ({ id: `w${weekNumber}`, weekNumber, entries: [{ ...structuredClone(template), id: `p${weekNumber}` }] }));
    const first = { ...f.attempt, lineage: { mesocycleId: 'm', weekNumber: 1, plannedSessionId: 'p1' } };
    const secondLineage = { mesocycleId: 'm', weekNumber: 2, plannedSessionId: 'p2' };
    const seed = seedMesocycleWorkout(f.routine, [f.block], [first], 'u', secondLineage);
    expect(seed.values['e-s']).toEqual({ weight: '25', reps: '10' });
    const second = createWorkoutAttempt({ id: 'second', owner: 'u', routine: seed.routine, lineage: secondLineage, completedAt: '2026-01-08', durationSeconds: 60, restTimerSeconds: 90, results: { 'e:s': { performed: true, load: 27, reps: 9, actualEffort: { kind: 'rir', value: 1 } } } });
    const third = seedMesocycleWorkout(f.routine, [f.block], [first, second], 'u', { mesocycleId: 'm', weekNumber: 3, plannedSessionId: 'p3' });
    expect(third.values['e-s']).toEqual({ weight: '27', reps: '9' });
    expect(third.previous['e-s'].actualEffort).toEqual({ kind: 'rir', value: 1 });
    expect(third.routine.exercises[0].sets[0].weight).toBe(20);
  });
  test('does not carry a session-only substitution with a different variant', () => {
    const f = fixture(); const changed = structuredClone(f.attempt) as any;
    changed.exercises[0].variant = 'dumbbell';
    expect(f.run([changed]).values['e-s']).toEqual({ weight: '20', reps: '8' });
  });
  test.each(['owner', 'block', 'future-slot', 'same-slot', 'future-time', 'no-lineage', 'wrong-week'])('ignores %s attempts', (kind) => {
    const f = fixture();
    if (kind === 'owner') f.attempt = { ...f.attempt, owner: 'other' };
    if (kind === 'block') f.attempt = { ...f.attempt, lineage: { ...f.attempt.lineage!, mesocycleId: 'other' } };
    if (kind === 'future-slot' || kind === 'same-slot') f.attempt = { ...f.attempt, lineage: { ...f.attempt.lineage!, plannedSessionId: kind === 'future-slot' ? 'after' : 'target' } };
    if (kind === 'wrong-week') f.attempt = { ...f.attempt, lineage: { ...f.attempt.lineage!, weekNumber: 2 } };
    if (kind === 'future-time') f.attempt = { ...f.attempt, completedAt: '2099-01-01' };
    if (kind === 'no-lineage') f.attempt = { ...f.attempt, lineage: undefined };
    expect(f.run([f.attempt]).values['e-s']).toEqual({ weight: '20', reps: '8' });
  });
  test.each(['load', 'reps', 'effort', 'mode', 'unit', 'variant', 'identity', 'set-id', 'type', 'backoff'])('preserves an explicit different %s', (field) => {
    const f = fixture(); const e = f.routine.exercises[0]; const s = e.sets[0];
    if (field === 'load') s.weight = 12;
    if (field === 'reps') s.reps = 6;
    if (field === 'effort') s.effortTarget = { kind: 'rir', value: 4 };
    if (field === 'mode') e.loadMode = 'assisted';
    if (field === 'unit') e.loadUnit = 'lb';
    if (field === 'variant') e.variant = 'dumbbell';
    if (field === 'identity') e.catalogExerciseId = 'other';
    if (field === 'set-id') s.id = 'new';
    if (field === 'type') s.tipo = 'C';
    if (field === 'backoff') s.backoffGroupId = 'new';
    expect(f.run().values[`e-${s.id}`]).toEqual({ weight: String(s.weight), reps: String(s.reps) });
  });
  test('uses the latest attempt and leaves its skipped/invalid sets planned', () => {
    const f = fixture(); const newer = structuredClone(f.attempt) as any;
    newer.id = 'new'; newer.completedAt = '2026-01-02'; newer.exercises[0].sets[0].result.performed = false;
    expect(f.run([f.attempt, newer]).values['e-s'].weight).toBe('20');
    newer.exercises[0].sets[0].result.performed = true; newer.exercises[0].sets[0].result.performance.reps = -1;
    expect(f.run([newer]).values['e-s'].weight).toBe('20');
  });
  test.each(['bodyweight', 'assisted'] as const)('carries compatible %s without changing semantics', (mode) => {
    const f = fixture(); f.routine.exercises[0].loadMode = mode;
    const before = f.block.weeks[0].entries[0]; if ('routineSnapshot' in before) before.routineSnapshot!.exercises[0].loadMode = mode;
    const a = structuredClone(f.attempt) as any;
    a.exercises[0].sets[0].result.performance = { mode, unit: 'kg', reps: 10, ...(mode === 'bodyweight' ? { bodyweight: 70 } : { assistance: 15 }) };
    expect(f.run([a]).values['e-s'].weight).toBe(mode === 'bodyweight' ? '70' : '15');
  });
  test('does not seed standalone launches or unknown historical prescriptions', () => {
    const f = fixture();
    expect(seedMesocycleWorkout(f.routine, [f.block], [f.attempt], 'u').values['e-s'].weight).toBe('20');
    const before = f.block.weeks[0].entries[0]; if ('routineSnapshot' in before) delete before.routineSnapshot;
    expect(f.run().values['e-s'].weight).toBe('20');
  });
  test('uses actual shifted calendar order rather than unshifted array order', () => {
    const f = fixture(); f.block.startDate = '2026-01-01';
    f.block.lifecycleHistory = [{ type: 'resumed', at: '2026-01-02', localDate: '2026-01-02', pauseStartedAt: '2026-01-01T12:00:00Z', pauseStartedDate: '2026-01-01', shiftDays: 5, shiftedPlannedSessionIds: ['before'] }];
    expect(f.run().values['e-s'].weight).toBe('20');
  });
  test('breaks timestamp ties deterministically and rejects mismatched performance units', () => {
    const f = fixture(); const newer = structuredClone(f.attempt) as any;
    newer.id = 'z'; newer.exercises[0].sets[0].result.performance.load = 30;
    expect(f.run([newer, f.attempt]).values['e-s'].weight).toBe('30');
    expect(f.run([f.attempt, newer]).values['e-s'].weight).toBe('30');
    newer.exercises[0].sets[0].result.performance.unit = 'lb';
    expect(f.run([newer]).values['e-s'].weight).toBe('20');
  });
  test('keeps zero rest on the existing route default and never carries elapsed time', () => {
    const f = fixture(); f.attempt = { ...f.attempt, restTimerSeconds: 0, durationSeconds: 999 };
    expect(f.run([f.attempt]).restTimerSeconds).toBeUndefined();
    expect(f.run([f.attempt])).not.toHaveProperty('durationSeconds');
  });
  test('retains per-set eligibility for warmups and failure sets without copying completions', () => {
    const f = fixture(); const source = f.block.weeks[0].entries[0];
    if (!('routineSnapshot' in source)) throw new Error('fixture');
    f.routine.exercises[0].sets[0].tipo = source.routineSnapshot!.exercises[0].sets[0].tipo = 'F';
    const a = structuredClone(f.attempt) as any; a.exercises[0].sets[0].plan.type = 'F';
    expect(f.run([a]).values['e-s'].reps).toBe('10');
    f.routine.exercises[0].sets[0].tipo = source.routineSnapshot!.exercises[0].sets[0].tipo = 'C';
    a.exercises[0].sets[0].plan.type = 'C';
    const seed = f.run([a]);
    expect(seed.values['e-s'].weight).toBe('25');
    expect(seed.routine.exercises[0].sets[0].completed).toBeUndefined();
  });

  test('keeps original load prescription distinct from carried actuals on new finalization', () => {
    const f = fixture(); const seed = f.run();
    const next = createWorkoutAttempt({ id: 'new', owner: 'u', routine: seed.routine, completedAt: '2026-01-03', durationSeconds: 100, restTimerSeconds: seed.restTimerSeconds!, lineage: f.lineage, results: { 'e:s': { performed: true, load: Number(seed.values['e-s'].weight), reps: Number(seed.values['e-s'].reps) } } });
    expect(next.exercises[0].sets[0]).toMatchObject({ plan: { targetLoad: 20, targetReps: 8 }, result: { performance: { load: 25, reps: 10 } } });
    expect(next.rewardApplication.id).not.toBe(f.attempt.rewardApplication.id);
    expect(next.lineage).toEqual(f.lineage);
    expect(f.attempt.completedAt).toBe('2026-01-01T12:00:00Z');
  });

});
