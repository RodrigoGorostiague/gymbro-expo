import { beforeEach, describe, expect, test, vi } from 'vitest';
import { WorkoutSession } from '../types';

const client = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../services/supabase', () => ({ supabase: client, supabaseConfigurationError: null }));

import { publishAutomaticWorkoutRecaps, recapInputFromSession } from '../services/workoutRecapFeed';

const standalone: WorkoutSession = {
  id: 'local-standalone', routineId: 'routine-1', routineName: 'Upper', completedAt: '2026-08-01T10:00:00Z',
  durationSeconds: 1800, restTimerSeconds: 60, recapPublicationKey: 'opaque-standalone-key',
  exercises: [{ exerciseId: 'exercise-1', name: 'Bench', muscleGroupIds: ['pecho'], sets: [{ setId: 'set-1', weight: 80, reps: 8, completed: true }] }],
};

const mesocycle: WorkoutSession = {
  ...standalone,
  id: 'local-mesocycle',
  recapPublicationKey: 'opaque-mesocycle-key',
  lineage: { mesocycleId: 'local-mesocycle-id', weekNumber: 2, plannedSessionId: 'local-plan-id' },
};

describe('automatic workout recap sharing', () => {
  beforeEach(() => vi.clearAllMocks());

  test('publishes the same reduced recap for standalone and mesocycle completions', async () => {
    client.rpc.mockResolvedValue({ data: 'recap-id', error: null });

    await expect(publishAutomaticWorkoutRecaps([standalone, mesocycle], true)).resolves.toEqual([]);
    expect(client.rpc).toHaveBeenCalledTimes(2);
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'create_workout_recap', {
      input: { routine_name: 'Upper', completed_at: '2026-08-01T10:00:00Z', duration_seconds: 1800, exercise_count: 1, metrics: { volume: 640 }, exercise_details: { exercises: [{ name: 'Bench', muscle_group_ids: ['pecho'] }] }, publication_key: 'opaque-standalone-key' },
    });
    expect(JSON.stringify(recapInputFromSession(mesocycle))).not.toContain('local-mesocycle-id');
    expect(JSON.stringify(recapInputFromSession(mesocycle))).not.toContain('local-plan-id');
  });

  test('is enabled by default at the caller boundary and does nothing when disabled', async () => {
    client.rpc.mockResolvedValue({ data: 'recap-id', error: null });
    await publishAutomaticWorkoutRecaps([standalone], false);
    expect(client.rpc).not.toHaveBeenCalled();

    await publishAutomaticWorkoutRecaps([standalone], true);
    expect(client.rpc).toHaveBeenCalledOnce();
  });

  test('reports an automatic failure for manual recovery and keeps its opaque idempotency key', async () => {
    client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'network unavailable' } })
      .mockResolvedValueOnce({ data: 'recap-id', error: null });

    await expect(publishAutomaticWorkoutRecaps([standalone], true)).resolves.toEqual(['local-standalone']);
    await expect(publishAutomaticWorkoutRecaps([standalone], true)).resolves.toEqual([]);
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'create_workout_recap', expect.objectContaining({ input: expect.objectContaining({ publication_key: 'opaque-standalone-key' }) }));
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'create_workout_recap', expect.objectContaining({ input: expect.objectContaining({ publication_key: 'opaque-standalone-key' }) }));
  });
});
