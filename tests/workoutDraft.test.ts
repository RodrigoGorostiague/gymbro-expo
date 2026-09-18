import { describe, expect, test } from 'vitest';
import { Exercise, Routine } from '../types';
import { attemptToSession, createWorkoutAttempt } from '../utils/workoutAttempts';
import { appendSessionExercise, hasCompletedSessionExerciseSet, moveWorkoutExercise, nextEffectiveSessionSetNumber, reconcileSessionCompletedSets, reconcileSessionSetValues, removeSessionExercise, snapshotWorkoutRoutine, updateSessionExerciseSets, withSessionSetType } from '../utils/workoutDraft';

const routine: Routine = {
  id: 'routine', name: 'Template', muscleGroups: ['chest'], createdAt: '', exercises: [
    { id: 'first', name: 'First', catalogExerciseId: 'first-catalog', muscleGroups: ['chest'], variant: 'bar', sets: [{ id: 'first-set', tipo: 1, weight: 20, reps: 8 }] },
    { id: 'second', name: 'Second', catalogExerciseId: 'second-catalog', muscleGroups: ['back'], variant: 'bar', sets: [{ id: 'second-set', tipo: 1, weight: 30, reps: 8 }] },
  ],
};

const catalogExercise: Exercise = { id: 'catalog-added', name: 'Added', muscleGroups: ['legs'], variant: 'machine', defaultSets: [] };

describe('active workout snapshot', () => {
  test('reorders and appends only the session snapshot with unique exercise and set ids', () => {
    let next = 0;
    const id = () => `generated-${++next}`;
    const snapshot = snapshotWorkoutRoutine(routine);
    const updated = appendSessionExercise(moveWorkoutExercise(snapshot, 1, 0), catalogExercise, [], id);

    expect(updated.exercises.map((exercise) => exercise.name)).toEqual(['Second', 'First', 'Added']);
    expect(updated.exercises.at(-1)).toMatchObject({ id: 'generated-1', sets: [{ id: 'generated-2', tipo: 1, weight: 0, reps: 8 }] });
    expect(routine.exercises.map((exercise) => exercise.name)).toEqual(['First', 'Second']);
    expect(routine.exercises).not.toBe(updated.exercises);
  });

  test('uses the persisted snapshot order and additions for attempts, sessions, and recap inputs', () => {
    let next = 0;
    const snapshot = appendSessionExercise(moveWorkoutExercise(snapshotWorkoutRoutine(routine), 1, 0), catalogExercise, [], () => `generated-${++next}`);
    const attempt = createWorkoutAttempt({ id: 'attempt', owner: 'rodaja', routine: snapshot, completedAt: '2026-08-04T12:00:00Z', durationSeconds: 60, restTimerSeconds: 30, results: Object.fromEntries(snapshot.exercises.flatMap((exercise) => exercise.sets.map((set) => [`${exercise.id}:${set.id}`, { performed: true, reps: 8, load: 10 }]))), });

    expect(attempt.exercises.map((exercise) => exercise.recordedName)).toEqual(['Second', 'First', 'Added']);
    expect(attemptToSession(attempt).exercises.map((exercise) => exercise.name)).toEqual(['Second', 'First', 'Added']);
    expect(attempt.completion.plannedSets).toBe(3);
  });

  test('edits the active session snapshot after another series is complete and leaves its template untouched', () => {
    const snapshot = snapshotWorkoutRoutine(routine);
    const edited = updateSessionExerciseSets(snapshot, 'first', {}, (sets) => [...sets, { id: 'session-only', tipo: 2, weight: 25, reps: 6 }], () => 'unused');
    expect(edited.exercises[0].sets).toHaveLength(2);
    expect(routine.exercises[0].sets).toHaveLength(1);
    const expandedAfterCompletion = updateSessionExerciseSets(edited, 'first', { 'first-first-set': true }, (sets) => [...sets, { id: 'after-completion', tipo: 3, weight: 30, reps: 5 }], () => 'unused');
    expect(expandedAfterCompletion.exercises[0].sets).toHaveLength(3);
  });

  test('keeps per-subset intensity targets and backoff grouping in the session snapshot', () => {
    const enriched = {
      ...routine,
      exercises: [{ ...routine.exercises[0], sets: [
        { id: 'backoff-1', tipo: 1, weight: 70, reps: 10, backoffGroupId: 'backoff-group', effortTarget: { kind: 'rir' as const, value: 2 as const } },
        { id: 'backoff-2', tipo: 2, weight: 65, reps: 10, backoffGroupId: 'backoff-group', effortTarget: { kind: 'rpe' as const, value: 8 as const } },
      ] }, routine.exercises[1]],
    };

    const snapshot = snapshotWorkoutRoutine(enriched);
    snapshot.exercises[0].sets[0].effortTarget = { kind: 'rir', value: 1 };

    expect(snapshot.exercises[0].sets).toMatchObject([
      { backoffGroupId: 'backoff-group', effortTarget: { kind: 'rir', value: 1 } },
      { backoffGroupId: 'backoff-group', effortTarget: { kind: 'rpe', value: 8 } },
    ]);
    expect(enriched.exercises[0].sets[0].effortTarget).toEqual({ kind: 'rir', value: 2 });
  });

  test('renumbers working sets after a type change and assigns failure sets RIR 0', () => {
    const snapshot = snapshotWorkoutRoutine({
      ...routine,
      exercises: [{ ...routine.exercises[0], sets: [
        { id: 'warmup', tipo: 'C', weight: 10, reps: 8 },
        { id: 'first-set', tipo: 1, weight: 20, reps: 8 },
        { id: 'second-set', tipo: 2, weight: 25, reps: 6 },
        { id: 'failure', tipo: 'F', weight: 20, reps: 8 },
      ] }, routine.exercises[1]],
    });
    const warmed = updateSessionExerciseSets(snapshot, 'first', {}, (sets) => withSessionSetType(sets, 'first-set', 'C'), () => 'unused');
    const edited = updateSessionExerciseSets(warmed, 'first', {}, (sets) => withSessionSetType(sets, 'second-set', 'F'), () => 'unused');

    expect(warmed.exercises[0].sets.map((set) => set.tipo)).toEqual(['C', 'C', 1, 'F']);
    expect(edited.exercises[0].sets[2]).toMatchObject({ tipo: 'F', reps: 6, effortTarget: { kind: 'rir', value: 0 } });
    expect(routine.exercises[0].sets[0]).toMatchObject({ tipo: 1, reps: 8 });
    expect(nextEffectiveSessionSetNumber([{ id: 'warmup', tipo: 'C', weight: 0, reps: 8 }, { id: 'effective', tipo: 3, weight: 20, reps: 8 }])).toBe(4);
  });

  test('removes a non-final unfinished session set and preserves the exercise minimum', () => {
    const snapshot = snapshotWorkoutRoutine({
      ...routine,
      exercises: [{ ...routine.exercises[0], sets: [...routine.exercises[0].sets, { id: 'second-set', tipo: 2, weight: 25, reps: 6 }] }, routine.exercises[1]],
    });
    const removed = updateSessionExerciseSets(snapshot, 'first', {}, (sets) => sets.length > 1 ? sets.filter((set) => set.id !== 'second-set') : [...sets], () => 'unused');
    const finalSet = updateSessionExerciseSets(removed, 'first', {}, (sets) => sets.length > 1 ? [] : [...sets], () => 'unused');

    expect(removed.exercises[0].sets.map((set) => set.id)).toEqual(['first-set']);
    expect(finalSet.exercises[0].sets).toHaveLength(1);
  });

  test('reconciles runtime values for added and removed session sets', () => {
    const snapshot = snapshotWorkoutRoutine(routine);
    const expanded = updateSessionExerciseSets(snapshot, 'first', {}, (sets) => [...sets, { id: 'session-only', tipo: 2, weight: 25, reps: 6 }], () => 'unused');
    const values = reconcileSessionSetValues(expanded, { 'first-first-set': { weight: '22.5', reps: '9' }, stale: { weight: '99', reps: '99' } });
    const reduced = updateSessionExerciseSets(expanded, 'first', {}, (sets) => sets.filter((set) => set.id !== 'session-only'), () => 'unused');

    expect(values).toMatchObject({ 'first-first-set': { weight: '22.5', reps: '9' }, 'first-session-only': { weight: '25', reps: '6' } });
    expect(reconcileSessionSetValues(reduced, values)).toEqual({
      'first-first-set': { weight: '22.5', reps: '9' },
      'second-second-set': { weight: '30', reps: '8' },
    });
  });

  test('keeps completed-set keys and entered values valid when the session snapshot is reordered', () => {
    const snapshot = snapshotWorkoutRoutine(routine);
    const completedSets = { 'first-first-set': true };
    const values = { 'first-first-set': { weight: '22.5', reps: '9' }, 'second-second-set': { weight: '32.5', reps: '10' } };
    const moved = moveWorkoutExercise(snapshot, 0, 1);

    expect(moved.exercises.map((exercise) => exercise.id)).toEqual(['second', 'first']);
    expect(reconcileSessionSetValues(moved, values)).toEqual(values);
    expect(completedSets).toEqual({ 'first-first-set': true });
    expect(routine.exercises.map((exercise) => exercise.id)).toEqual(['first', 'second']);
  });

  test('removes an unstarted exercise only from the session snapshot and reconciles its runtime state', () => {
    const snapshot = snapshotWorkoutRoutine(routine);
    const removed = removeSessionExercise(snapshot, 'first');
    const values = reconcileSessionSetValues(removed, {
      'first-first-set': { weight: '22.5', reps: '9' },
      'second-second-set': { weight: '32.5', reps: '10' },
    });
    const completed = reconcileSessionCompletedSets(removed, {
      'first-first-set': true,
      'second-second-set': false,
      orphan: true,
    });

    expect(removed.exercises.map((exercise) => exercise.id)).toEqual(['second']);
    expect(values).toEqual({ 'second-second-set': { weight: '32.5', reps: '10' } });
    expect(completed).toEqual({ 'second-second-set': false });
    expect(routine.exercises.map((exercise) => exercise.id)).toEqual(['first', 'second']);
  });

  test('locks an exercise after any completed set, including persisted completion representations', () => {
    const exercise = snapshotWorkoutRoutine(routine).exercises[0];

    expect(hasCompletedSessionExerciseSet(exercise, { 'first-first-set': true })).toBe(true);
    expect(hasCompletedSessionExerciseSet(exercise, { 'first:first-set': true })).toBe(true);
    expect(hasCompletedSessionExerciseSet({ ...exercise, sets: [{ ...exercise.sets[0], completed: true }] }, {})).toBe(true);
    expect(hasCompletedSessionExerciseSet(exercise, {})).toBe(false);
  });
});
