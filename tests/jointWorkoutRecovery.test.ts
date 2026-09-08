import { beforeEach, expect, test, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../services/supabase', () => ({ supabase: { rpc }, supabaseConfigurationError: null }));
import { resolveJointWorkoutAttempt, finishJointWorkoutAttempt } from '../services/jointWorkouts';
import { publishWorkoutStartActivity, activeWorkoutStartActivities } from '../services/workoutStartActivity';
import { createLatestRequest } from '../utils/latestRequest';
beforeEach(() => vi.clearAllMocks());
test('presence carries the captured attempt identity', async () => {
 rpc.mockResolvedValue({ error: null });
 await publishWorkoutStartActivity('Upper', null, 'attempt-1');
 expect(rpc).toHaveBeenCalledWith('publish_workout_start_activity', {input:{routine_name:'Upper',attempt_id:'attempt-1'}});
});
test('publication atomically binds owner and captured attempt to the destination', async () => {
 rpc.mockResolvedValueOnce({error:null});
 const workout = {routineName:'Upper',durationSeconds:60,exercises:[]};
 await finishJointWorkoutAttempt('owner-1','attempt-old','old-group','circle',workout);
 expect(rpc.mock.calls).toEqual([
 ['finish_joint_workout_attempt',{owner_input:'owner-1',attempt_id_input:'attempt-old',captured_workout_id:'old-group',visibility_input:'circle',completed_workout_input:workout}],
 ]);
});
test('missing mapping does not borrow the latest group', async () => {
 rpc.mockResolvedValueOnce({data:null,error:null});
 await expect(resolveJointWorkoutAttempt('old')).resolves.toBeNull();
 expect(rpc).toHaveBeenCalledTimes(1);
});
test('expired and malformed presence cannot remain visible without an event', () => {
 const activities = [{id:'expired',expiresAt:'2026-09-08T00:00:00Z'},{id:'live',expiresAt:'2026-09-09T00:00:00Z'},{id:'bad',expiresAt:'oops'}];
 expect(activeWorkoutStartActivities(activities, Date.parse('2026-09-08T12:00:00Z'))).toEqual([activities[1]]);
});
test('request generations reject older and old-account responses', () => {
 const guard=createLatestRequest(); const old=guard.begin(); const fresh=guard.begin();
 expect(old()).toBe(false); expect(fresh()).toBe(true); guard.invalidate(); expect(fresh()).toBe(false);
});
