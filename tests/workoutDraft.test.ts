import { describe, expect, test } from 'vitest';
import { Exercise, Routine } from '../types';
import { attemptToSession, createWorkoutAttempt } from '../utils/workoutAttempts';
import { appendSessionExercise, moveWorkoutExercise, nextEffectiveSessionSetNumber, reconcileSessionSetValues, snapshotWorkoutRoutine, updateSessionExerciseSets, withSessionSetType } from '../utils/workoutDraft';

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

  test('edits only an unfinished session snapshot and leaves its template untouched', () => {
    const snapshot = snapshotWorkoutRoutine(routine);
    const edited = updateSessionExerciseSets(snapshot, 'first', {}, (sets) => [...sets, { id: 'session-only', tipo: 2, weight: 25, reps: 6 }], () => 'unused');
    expect(edited.exercises[0].sets).toHaveLength(2);
    expect(routine.exercises[0].sets).toHaveLength(1);
    expect(updateSessionExerciseSets(edited, 'first', { 'first-first-set': true }, (sets) => [], () => 'unused')).toBe(edited);
  });

  test('changes an unfinished session set type and keeps failure prescriptions at zero reps', () => {
    const snapshot = snapshotWorkoutRoutine(routine);
    const edited = updateSessionExerciseSets(snapshot, 'first', {}, (sets) => withSessionSetType(sets, 'first-set', 'F'), () => 'unused');

    expect(edited.exercises[0].sets[0]).toMatchObject({ tipo: 'F', reps: 0 });
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
});
