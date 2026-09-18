import { beforeEach, describe, expect, test, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../services/supabase', () => ({ supabase: { rpc }, supabaseConfigurationError: null }));

import { closeWorkoutStartActivity, listWorkoutStartActivities, publishWorkoutStartActivity } from '../services/workoutStartActivity';

describe('workout start activity boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  test('publishes only a routine name and optional joint workout reference', async () => {
    rpc.mockResolvedValue({ error: null });

    await publishWorkoutStartActivity(' Upper ', 'joint-1');

    expect(rpc).toHaveBeenCalledWith('publish_workout_start_activity', {
      input: { routine_name: 'Upper', joint_workout_id: 'joint-1' },
    });
  });

  test('rejects a blank routine before it reaches the server', async () => {
    await expect(publishWorkoutStartActivity('   ')).rejects.toThrow('La rutina debe tener un nombre');
    expect(rpc).not.toHaveBeenCalled();
  });

  test('maps the reduced circle-only activity projection', async () => {
    rpc.mockResolvedValue({
      data: [{
        id: 'activity-1', author_alias: 'Bro', author_avatar_id: 'capigirl', author_theme_id: 'profile-rodaja',
        routine_name: 'Upper', joint_workout_id: null, started_at: '2026-08-04T10:00:00Z', expires_at: '2026-08-04T12:00:00Z', is_author: false,
      }],
      error: null,
    });

    await expect(listWorkoutStartActivities()).resolves.toEqual([{
      id: 'activity-1', authorAlias: 'Bro', authorAvatarId: 'capigirl', authorThemeId: 'profile-rodaja',
      routineName: 'Upper', jointWorkoutId: null, startedAt: '2026-08-04T10:00:00Z', expiresAt: '2026-08-04T12:00:00Z', isAuthor: false,
    }]);
    expect(rpc).toHaveBeenCalledWith('list_workout_start_activities');
  });

  test('closes the actor activity without accepting an activity identifier', async () => {
    rpc.mockResolvedValue({ error: null });

    await closeWorkoutStartActivity();

    expect(rpc).toHaveBeenCalledWith('close_workout_start_activity');
  });
});
