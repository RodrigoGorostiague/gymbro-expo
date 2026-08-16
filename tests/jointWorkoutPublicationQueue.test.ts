import { beforeEach, describe, expect, test, vi } from 'vitest';

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: vi.fn(async (key: string) => data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { data.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { data.delete(key); }),
  };
});

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));

import {
  flushPendingJointWorkoutPublications,
  loadPendingJointWorkoutPublications,
  queueJointWorkoutPublication,
} from '../services/jointWorkoutPublicationQueue';

const publication = {
  workoutId: 'joint-1',
  visibility: 'circle' as const,
  completedWorkout: { routineName: 'Upper', durationSeconds: 60, exercises: [] },
};

describe('joint workout publication queue', () => {
  beforeEach(() => { storage.data.clear(); vi.clearAllMocks(); });

  test('persists the completion command across a fresh queue read and replaces duplicates for one session', async () => {
    await queueJointWorkoutPublication('member-1', publication);
    await queueJointWorkoutPublication('member-1', { ...publication, visibility: 'private' });

    await expect(loadPendingJointWorkoutPublications('member-1')).resolves.toEqual([
      { ...publication, visibility: 'private' },
    ]);
  });

  test('removes only successfully published commands and retains failures for a later app launch', async () => {
    await queueJointWorkoutPublication('member-1', publication);
    await queueJointWorkoutPublication('member-1', { ...publication, workoutId: 'joint-2' });
    const publish = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'));

    await expect(flushPendingJointWorkoutPublications('member-1', publish)).resolves.toBe(1);
    expect(publish).toHaveBeenCalledTimes(2);
    await expect(loadPendingJointWorkoutPublications('member-1')).resolves.toEqual([
      { ...publication, workoutId: 'joint-2' },
    ]);
  });
});
