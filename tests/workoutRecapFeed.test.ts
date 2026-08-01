import { describe, expect, test, vi } from 'vitest';
import { WorkoutSession } from '../types';

const client = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: { getSession: vi.fn() },
  realtime: { setAuth: vi.fn() },
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('../services/supabase', () => ({ supabase: client, supabaseConfigurationError: null }));

import { createWorkoutRecap, getWorkoutRecapDetail, getWorkoutRecapPage, recapInputFromSession, subscribeToWorkoutRecapChanges } from '../services/workoutRecapFeed';

const session: WorkoutSession = {
  id: 'local-session', routineId: 'local-routine', routineName: 'Upper', completedAt: '2026-08-01T10:00:00Z', durationSeconds: 3600, restTimerSeconds: 0,
  exercises: [{ exerciseId: 'local-exercise', name: 'Bench', muscleGroupIds: ['pecho', 'tríceps'], sets: [{ setId: 'local-set', weight: 100, reps: 5, completed: true }] }],
};

describe('workout recap feed boundary', () => {
  test('maps completed sessions to an allowlisted immutable summary only', () => {
    expect(recapInputFromSession(session, '  Nice work  ')).toEqual({
      routineName: 'Upper', completedAt: '2026-08-01T10:00:00Z', durationSeconds: 3600, exerciseCount: 1, metrics: { volume: 500 }, exercises: [{ name: 'Bench', muscleGroupIds: ['pecho', 'tríceps'] }], caption: 'Nice work',
    });
    expect(JSON.stringify(recapInputFromSession(session))).not.toContain('local-session');
    expect(JSON.stringify(recapInputFromSession(session))).not.toContain('local-set');
  });

  test('uses protected RPCs and maps only their feed projection', async () => {
    client.rpc.mockResolvedValueOnce({ data: 'recap-1', error: null }).mockResolvedValueOnce({
      data: { recaps: [{ id: 'recap-1', author_alias: 'Bro', routine_name: 'Upper', completed_at: '2026-08-01T10:00:00Z', duration_seconds: 3600, exercise_count: 1, muscle_group_ids: ['pecho'], metrics: { volume: 500 }, caption: null, created_at: '2026-08-01T10:01:00Z' }], next_cursor: 'next' }, error: null,
    });
    await createWorkoutRecap(recapInputFromSession(session), 'publication-key');
    await expect(getWorkoutRecapPage()).resolves.toEqual({ recaps: [{ id: 'recap-1', authorAlias: 'Bro', routineName: 'Upper', completedAt: '2026-08-01T10:00:00Z', durationSeconds: 3600, exerciseCount: 1, muscleGroupIds: ['pecho'], metrics: { volume: 500 }, caption: null, createdAt: '2026-08-01T10:01:00Z' }], nextCursor: 'next' });
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'create_workout_recap', { input: { routine_name: 'Upper', completed_at: '2026-08-01T10:00:00Z', duration_seconds: 3600, exercise_count: 1, metrics: { volume: 500 }, exercise_details: { exercises: [{ name: 'Bench', muscle_group_ids: ['pecho', 'tríceps'] }] }, publication_key: 'publication-key' } });
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'list_workout_recaps', { cursor: null, page_size: 20 });
  });

  test('maps the protected detail projection and safely handles older recaps without details', async () => {
    client.rpc.mockResolvedValueOnce({
      data: { id: 'recap-1', author_alias: 'Bro', routine_name: 'Upper', completed_at: '2026-08-01T10:00:00Z', duration_seconds: 3600, exercise_count: 1, muscle_group_ids: ['pecho'], metrics: {}, caption: null, created_at: '2026-08-01T10:01:00Z', exercises: [{ name: 'Bench', muscle_group_ids: ['pecho'] }] }, error: null,
    }).mockResolvedValueOnce({
      data: { id: 'old-recap', author_alias: 'Bro', routine_name: 'Upper', completed_at: '2026-08-01T10:00:00Z', duration_seconds: 3600, exercise_count: 1, metrics: {}, caption: null, created_at: '2026-08-01T10:01:00Z' }, error: null,
    });

    await expect(getWorkoutRecapDetail('recap-1')).resolves.toMatchObject({ exercises: [{ name: 'Bench', muscleGroupIds: ['pecho'] }] });
    await expect(getWorkoutRecapDetail('old-recap')).resolves.toMatchObject({ muscleGroupIds: [], exercises: [] });
    expect(client.rpc).toHaveBeenLastCalledWith('get_workout_recap_detail', { recap_id: 'old-recap' });
  });

  test('treats authorized Realtime changes as invalidation only and cleans up', async () => {
    const handlers: Array<() => void> = [];
    const channel = { on: vi.fn((_type, _filter, handler) => { handlers.push(handler); return channel; }), subscribe: vi.fn(() => channel) };
    client.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'member-1' }, access_token: 'token' } }, error: null });
    client.channel.mockReturnValue(channel);
    const invalidate = vi.fn();
    const unsubscribe = await subscribeToWorkoutRecapChanges(invalidate);
    handlers[0]();
    expect(invalidate).toHaveBeenCalledOnce();
    expect(client.channel).toHaveBeenCalledWith('workout-recap-feed:member-1');
    unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
