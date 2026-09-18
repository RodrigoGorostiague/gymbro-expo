import { copyPreviousSeries } from '../utils/quickLogging';
import { expect, test } from 'vitest';
import { createWorkoutAttempt, attemptToSession, applySessionEdits } from '../utils/workoutAttempts';
import { recapInputFromSession, recapImportPlan, recapSharePayload } from '../services/workoutRecapFeed';

import { reconcileSessionSetValues } from '../utils/workoutDraft';
import type { Routine } from '../types';
const routine: Routine = { id: 'r', name: 'Routine', createdAt: '2026-09-11', muscleGroups: [], exercises: [{ id: 'e', name: 'Press', variant: '', muscleGroups: [], sets: [{ id: 's', tipo: 1, weight: 20, reps: 10, effortTarget: { kind: 'rpe', value: 8 } }] }] };
const capture = (actualEffort?: any) => createWorkoutAttempt({ id: 'a', owner: 'owner', routine, completedAt: '2026-09-11', durationSeconds: 180, restTimerSeconds: 60, results: { 'e:s': { performed: true, reps: 9, load: 25, actualEffort } } });
test('actual RIR zero survives attempt, session, edits and solo publication without altering plan', () => {
 const attempt = capture({ kind: 'rir', value: 0 });
 expect(attempt.exercises[0].sets[0].plan.effortTarget).toEqual({ kind: 'rpe', value: 8 });
 expect(attempt.exercises[0].sets[0].result.actualEffort).toEqual({ kind: 'rir', value: 0 });
 const session = attemptToSession(attempt);
 expect(session.durationSeconds).toBe(180);
 expect(recapInputFromSession(session).metrics).toMatchObject({ actualRirMin: 0, actualRirMax: 0, actualRirCount: 1 });
 expect(recapInputFromSession(session).exercises[0].sets[0].actualEffort).toEqual({ kind: 'rir', value: 0 });
 expect(applySessionEdits(attempt, session).exercises[0].sets[0].result.actualEffort).toEqual({ kind: 'rir', value: 0 });
});
test('missing actual effort is never filled from prescription; draft recovery preserves independently', () => {
 expect(capture().exercises[0].sets[0].result.actualEffort).toBeUndefined();
 expect(reconcileSessionSetValues(routine, {})['e-s'].actualEffort).toBeUndefined();
 expect(reconcileSessionSetValues(routine, { 'e-s': { weight: '25', reps: '9', actualEffort: { kind: 'rir', value: 0 } } })['e-s'].actualEffort).toEqual({ kind: 'rir', value: 0 });
});
test('routine import excludes execution-only fields even if supplied in a template object', () => {
 const plan = recapImportPlan('p', 'owner', { version: 1, routine: { name: 'R', muscleGroups: [], exercises: [{ name: 'Press', muscleGroups: [], variant: '', loadMode: 'external-load', loadUnit: 'kg', sets: [{ tipo: 1, weight: 20, reps: 10, effortTarget: { kind: 'rpe', value: 8 }, actualEffort: { kind: 'rir', value: 0 } } as any] }] } });
 expect(plan.routines[0].exercises[0].sets[0].effortTarget).toEqual({ kind: 'rpe', value: 8 });
 expect(plan.routines[0].exercises[0].sets[0]).not.toHaveProperty('actualEffort');
});

test('published performed sets retain actual effort; routine copy retains planned effort only', () => {
 const session = attemptToSession(capture({ kind: 'rpe', value: 10 }));
 const payload = recapSharePayload(session, routine, undefined, [routine], { shareRoutineTemplate: true, shareMesocycleTemplate: false, sharePerformedSetDetails: true })!;
 expect(payload.performedSets![0].sets[0].actualEffort).toEqual({ kind: 'rpe', value: 10 });
 const copied = recapImportPlan('p', 'owner', payload).routines[0];
 expect(copied.exercises[0].sets[0].effortTarget).toEqual({ kind: 'rpe', value: 8 });
 expect(copied.exercises[0].sets[0]).not.toHaveProperty('actualEffort');
});

test.each([{ kind: 'rir', value: -1 }, { kind: 'rpe', value: 11 }, { kind: 'rpe', value: 8.5 }, { kind: 'rir', value: 0, privateNote: 'hidden' }])('invalid actual effort is not published: %j', (value) => {
 expect(capture(value).exercises[0].sets[0].result.actualEffort).toBeUndefined();
});


test('quick-copy never transfers actual effort between sets and preserves destination effort', () => {
 const exercise = { ...routine.exercises[0], sets: [routine.exercises[0].sets[0], { ...routine.exercises[0].sets[0], id: 's2', tipo: 2 }] };
 const values = { 'e-s': { weight: '25', reps: '8', actualEffort: { kind: 'rir' as const, value: 0 as const } }, 'e-s2': { weight: '20', reps: '10', actualEffort: { kind: 'rpe' as const, value: 7 as const } } };
 expect(copyPreviousSeries(exercise, 's2', values, {})!['e-s2']).toEqual({ weight: '25', reps: '8', actualEffort: { kind: 'rpe', value: 7 } });
});
