import React from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { render, resetRuntimeHarness, setMockData, setMockParams } from './helpers/runtimeHarness';
import { act } from 'react-test-renderer';
import ExecuteRoutineScreen from '../app/routine/execute/[id]';
import { EffortTargetControl } from '../components/EffortTargetControl';
vi.mock('../context/ShopContext', () => ({ useShop: () => ({ retryPendingRewards: vi.fn() }) }));
const routine = { id: 'r', name: 'Workout', createdAt: '', muscleGroups: [], exercises: [{ id: 'e', name: 'Press', variant: 'Bar', muscleGroups: [], loadMode: 'external-load', loadUnit: 'kg', sets: [{ id: 's', tipo: 1, weight: 20, reps: 8, effortTarget: { kind: 'rpe', value: 8 } }] }] };
beforeEach(() => { vi.clearAllMocks(); resetRuntimeHarness(); setMockParams({ id: 'r' }); });
test.each([false, true])('actual effort persists immediately without changing plan (offline %s)', async (offlineWorkoutEnabled) => {
 const updateActiveWorkout = vi.fn(async (_draft: unknown) => undefined);
 const draft = { version: 1, owner: 'rodaja', attemptId: 'a', routineId: 'r', startedAtMs: Date.now(), restTimerSeconds: 30, completedSets: {}, setValues: { 'e-s': { weight: '20', reps: '8' } }, routineSnapshot: routine };
 setMockData({ offlineWorkoutEnabled, getRoutine: () => routine, routines: [routine], mesocycles: [], attempts: [], activeWorkoutDraft: draft, updateActiveWorkout, clearActiveWorkoutIfMatches: vi.fn(), refreshActiveWorkoutTiming: vi.fn(async () => undefined), cancelActiveWorkout: vi.fn() });
 const tree = await render(React.createElement(ExecuteRoutineScreen));
 const control = tree.root.findByType(EffortTargetControl);
 expect(control.props.actual).toBe(true);
 expect(control.props.value).toBeUndefined();
 await act(async () => control.props.onChange({ kind: 'rir', value: 0 }));
 const saved = updateActiveWorkout.mock.calls.at(-1)![0] as any;
 expect(saved.setValues['e-s'].actualEffort).toEqual({ kind: 'rir', value: 0 });
 expect(saved.routineSnapshot.exercises[0].sets[0].effortTarget).toEqual({ kind: 'rpe', value: 8 });
 expect(routine.exercises[0].sets[0].effortTarget).toEqual({ kind: 'rpe', value: 8 });
});

test('timed bodyweight sets complete without kilograms and drop members do not start rest', async () => {
 const updateActiveWorkout = vi.fn(async (_draft: unknown) => undefined);
 const timed = { ...routine, exercises: [{ ...routine.exercises[0], sets: [{ id: 's', tipo: 1, weight: 0, reps: 0, durationSeconds: 30, loadBasis: 'bodyweight' }, { id: 'd1', tipo: 1, weight: 20, reps: 8, dropGroupId: 'drop' }, { id: 'd2', tipo: 1, weight: 15, reps: 8, dropGroupId: 'drop' }] }] };
 const draft = { version: 1, owner: 'rodaja', attemptId: 'a', routineId: 'r', startedAtMs: Date.now(), restTimerSeconds: 30, completedSets: {}, setValues: { 'e-s': { weight: '', reps: '0', durationSeconds: '31' }, 'e-d1': { weight: '20', reps: '8' }, 'e-d2': { weight: '15', reps: '8' } }, routineSnapshot: timed };
 setMockData({ getRoutine: () => timed, routines: [timed], mesocycles: [], attempts: [], activeWorkoutDraft: draft, updateActiveWorkout, clearActiveWorkoutIfMatches: vi.fn(), refreshActiveWorkoutTiming: vi.fn(async () => undefined), cancelActiveWorkout: vi.fn() });
 const tree = render(React.createElement(ExecuteRoutineScreen));
 await act(async () => tree.root.find((node) => String(node.type) === 'HapticPressable' && node.props.accessibilityLabel === 'Finalizar serie 1 de Press').props.onPress());
 expect((updateActiveWorkout.mock.calls.at(-1)![0] as any).completedSets['e-s']).toBe(true);
 await act(async () => tree.root.find((node) => String(node.type) === 'HapticPressable' && node.props.accessibilityLabel === 'Finalizar serie 2 de Press').props.onPress());
 const saved = updateActiveWorkout.mock.calls.at(-1)![0] as any;
 expect(saved.completedSets['e-d1']).toBe(true);
 expect(saved.restEndsAtMs).toBeUndefined();
});
