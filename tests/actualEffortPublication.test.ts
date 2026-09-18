import { expect, test, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../services/supabase', () => ({ supabase: { rpc }, supabaseConfigurationError: null }));
import { completedJointWorkoutInput, getJointWorkoutDetail } from '../services/jointWorkouts';
import { getWorkoutRecapDetail, asSharePayload } from '../services/workoutRecapFeed';
const actualEffort = { kind: 'rir' as const, value: 0 as const };
test('joint transport serializes and reads actual zero without prescription or local identifiers', async () => {
 const input = completedJointWorkoutInput({ name: 'R' } as any, 180, [{ exerciseId: 'private', name: 'Press', muscleGroupIds: [], sets: [{ setId: 'private', weight: 20, reps: 8, completed: true, actualEffort }] }]);
 rpc.mockResolvedValue({ data: [], error: null });
 rpc.mockResolvedValueOnce({ data: { id: 'j', created_at: '', participants: [{ id: 'p', alias: 'P', status: 'completed', workout: input }] }, error: null });
 expect(input.exercises[0].sets[0]).toEqual({ weight: 20, reps: 8, completed: true, actualEffort });
 expect((await getJointWorkoutDetail('j'))!.participants[0].workout!.exercises[0].sets[0].actualEffort).toEqual(actualEffort);
});
test('solo detail reads actual effort, and performed payload validates it separately', async () => {
 rpc.mockResolvedValueOnce({ data: { id: 'r', exercises: [{ name: 'Press', muscle_group_ids: [], sets: [{ weight: 20, reps: 8, completed: true, actualEffort }] }] }, error: null });
 expect((await getWorkoutRecapDetail('r'))!.exercises[0].sets[0].actualEffort).toEqual(actualEffort);
 expect(asSharePayload({ version: 1, performedSets: [{ exerciseIndex: 0, sets: [{ weight: 20, reps: 8, completed: true, actualEffort }] }] })).not.toBeNull();
 expect(asSharePayload({ version: 1, performedSets: [{ exerciseIndex: 0, sets: [{ weight: 20, reps: 8, completed: false, actualEffort }] }] })).toBeNull();
});

test('duration and distinct drop blocks survive routine sharing, import and joint transport', async () => {
 const { recapSharePayload, recapImportPlan } = await import('../services/workoutRecapFeed');
 const { routineSnapshot, jointRoutineImportPlan } = await import('../services/jointWorkouts');
 const routine = { id: 'r', name: 'Core', createdAt: '2026-09-18T12:00:00Z', muscleGroups: ['GM-101'], exercises: [{ id: 'e', name: 'Core', variant: 'Suelo', muscleGroups: ['GM-101'], sets: [{ id: 's', tipo: 1, weight: 0, reps: 0, durationSeconds: 45, loadBasis: 'bodyweight' as const }, { id: 'd1', tipo: 1, weight: 20, reps: 8, dropGroupId: 'private-drop' }, { id: 'd2', tipo: 1, weight: 15, reps: 8, dropGroupId: 'private-drop' }] }] };
 const session = { id: 'a', routineId: 'r', routineName: 'Core', completedAt: routine.createdAt, durationSeconds: 60, restTimerSeconds: 90, exercises: [{ exerciseId: 'e', name: 'Core', sets: [{ setId: 's', weight: 0, reps: 0, durationSeconds: 43, completed: true }] }] };
 const payload = recapSharePayload(session, routine, undefined, [], { shareRoutineTemplate: true, shareMesocycleTemplate: false, sharePerformedSetDetails: true });
 expect(asSharePayload(payload)).not.toBeNull();
 const imported = recapImportPlan('recap', 'recipient', payload!);
 expect(imported.routines[0].exercises[0].sets[0]).toMatchObject({ reps: 0, durationSeconds: 45, loadBasis: 'bodyweight' });
 expect(imported.routines[0].exercises[0].sets[1].dropGroupId).toBe(imported.routines[0].exercises[0].sets[2].dropGroupId);
 expect(JSON.stringify(payload)).not.toContain('private-drop');
 const joint = routineSnapshot(routine);
 expect(joint.exercises[0].sets[0]).toMatchObject({ durationSeconds: 45, reps: 0 });
 expect(jointRoutineImportPlan('joint', 'recipient', joint).routines[0].exercises[0].sets[0]).toMatchObject({ durationSeconds: 45, reps: 0 });
 const completed = completedJointWorkoutInput(routine, 60, session.exercises);
 expect(completed.exercises[0].sets[0].durationSeconds).toBe(43);
 rpc.mockResolvedValueOnce({ data: { id: 'j', created_at: '', participants: [{ id: 'p', alias: 'P', status: 'completed', workout: completed }] }, error: null });
 expect((await getJointWorkoutDetail('j'))!.participants[0].workout!.exercises[0].sets[0].durationSeconds).toBe(43);
});
