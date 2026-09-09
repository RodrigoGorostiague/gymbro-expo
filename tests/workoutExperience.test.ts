import { describe, expect, test } from 'vitest';
import { workoutFacts, workoutShareText, nextWorkoutSet } from '../utils/workoutExperience';
import { normalizeSensoryPreferences } from '../utils/sensoryPreferences';
import type { WorkoutSession, Routine } from '../types';
const session: WorkoutSession = { id: 's', routineId: 'r', routineName: 'Strength', completedAt: '', durationSeconds: 90, restTimerSeconds: 60, exercises: [{ exerciseId: 'e', name: 'Press', sets: [{ setId: 'a', weight: 100, reps: 8, completed: true }, { setId: 'b', weight: 999, reps: 99, completed: false }] }] };
describe('training experience facts', () => {
  test('counts only performed work and labels partial honestly', () => {
    expect(workoutFacts(session)).toEqual({ totalSets: 2, completedSets: 1, repetitions: 8, completedExercises: 1, full: false });
    expect(workoutFacts({ ...session, exercises: [] }).full).toBe(false);
  });
  test('summary sharing does not disclose loads or individual set details', () => {
    const text = workoutShareText(session);
    expect(text).toContain('1/2 series'); expect(text).not.toContain('100'); expect(text).not.toContain('999'); expect(text).not.toContain('Press');
  });
  test('detects the final set without forcing sequence or auto-finalization', () => {
    const routine = { exercises: [{ id: 'e', name: 'Press', sets: [{ id: 'a' }, { id: 'b' }] }] } as Routine;
    expect(nextWorkoutSet(routine, { 'e-a': true })?.setId).toBe('b');
    expect(nextWorkoutSet(routine, { 'e-a': true, 'e-b': true })).toBeNull();
    expect(nextWorkoutSet(routine, { 'e-b': true })?.setId).toBe('a');
  });
  test('normalizes persisted sensory choices without coercing strings', () => {
    expect(normalizeSensoryPreferences({ motion: false, haptics: 'false', sound: false })).toEqual({ motion: false, haptics: true, sound: false });
    expect(normalizeSensoryPreferences(null)).toEqual({ motion: true, haptics: true, sound: true });
  });
});
