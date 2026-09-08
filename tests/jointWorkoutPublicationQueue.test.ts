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
  JointWorkoutPublicationQueueError,
  loadPendingJointWorkoutPublications,
  prepareJointWorkoutPublication,
  queueJointWorkoutPublication,
  removePendingJointWorkoutPublication,
} from '../services/jointWorkoutPublicationQueue';

const publication = {
  attemptId: 'attempt-1',
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

  test('serializes concurrent queue and remove mutations without losing sibling commands', async () => {
    await Promise.all([
      queueJointWorkoutPublication('member-1', publication),
      queueJointWorkoutPublication('member-1', { ...publication, attemptId: 'attempt-2', workoutId: 'joint-2' }),
    ]);
    await Promise.all([
      queueJointWorkoutPublication('member-1', { ...publication, attemptId: 'attempt-3', workoutId: 'joint-3' }),
      removePendingJointWorkoutPublication('member-1', 'joint-1'),
    ]);

    await expect(loadPendingJointWorkoutPublications('member-1')).resolves.toEqual([
      { ...publication, attemptId: 'attempt-2', workoutId: 'joint-2' },
      { ...publication, attemptId: 'attempt-3', workoutId: 'joint-3' },
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

  test('serializes flush with queue writes and publishes duplicate concurrent flushes once', async () => {
    await queueJointWorkoutPublication('member-1', publication);
    let releasePublish!: () => void;
    const publish = vi.fn(() => new Promise<void>((resolve) => { releasePublish = resolve; }));
    const firstFlush = flushPendingJointWorkoutPublications('member-1', publish);
    const secondFlush = flushPendingJointWorkoutPublications('member-1', publish);
    await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    const queueSibling = queueJointWorkoutPublication('member-1', { ...publication, attemptId: 'attempt-2', workoutId: 'joint-2' });

    releasePublish();
    await expect(Promise.all([firstFlush, secondFlush, queueSibling])).resolves.toEqual([1, 0, undefined]);
    expect(publish).toHaveBeenCalledTimes(1);
    await expect(loadPendingJointWorkoutPublications('member-1')).resolves.toEqual([{ ...publication, attemptId: 'attempt-2', workoutId: 'joint-2' }]);
  });

  test('keeps prepared commands inert until a matching persisted attempt confirms finalization', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    await prepareJointWorkoutPublication('member-1', publication);

    await expect(flushPendingJointWorkoutPublications('member-1', publish)).resolves.toBe(0);
    await expect(flushPendingJointWorkoutPublications('member-1', publish, [{ id: 'attempt-1', owner: 'other', jointWorkoutId: 'joint-1' }])).resolves.toBe(0);
    await expect(flushPendingJointWorkoutPublications('member-1', publish, [{ id: 'attempt-1', owner: 'member-1', jointWorkoutId: 'joint-1' }])).resolves.toBe(1);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  test('migrates valid legacy commands as ready pending work', async () => {
    const legacy = { workoutId: publication.workoutId, visibility: publication.visibility, completedWorkout: publication.completedWorkout };
    storage.data.set('@gymbro/joint-workout-publications/v1/member-1', JSON.stringify([legacy]));

    await expect(loadPendingJointWorkoutPublications('member-1')).resolves.toEqual([{ ...publication, attemptId: 'legacy' }]);
    expect(JSON.parse(storage.data.get('@gymbro/joint-workout-publications/v1/member-1')!)).toMatchObject({
      version: 1,
      owner: 'member-1',
      commands: [{ version: 1, owner: 'member-1', state: 'ready', attemptId: 'legacy', workoutId: 'joint-1' }],
    });
  });

  test('quarantines a malformed sibling while recovering and migrating valid legacy work', async () => {
    const legacy = { workoutId: publication.workoutId, visibility: publication.visibility, completedWorkout: publication.completedWorkout };
    storage.data.set('@gymbro/joint-workout-publications/v1/member-1', JSON.stringify([legacy, { workoutId: 'bad', completedWorkout: {} }]));

    await expect(loadPendingJointWorkoutPublications('member-1')).resolves.toEqual([{ ...publication, attemptId: 'legacy' }]);
    expect(storage.data.has('@gymbro/joint-workout-publications-quarantine/v1/member-1')).toBe(true);
  });

  test('rejects and quarantines corrupt top-level JSON instead of treating it as an empty queue', async () => {
    storage.data.set('@gymbro/joint-workout-publications/v1/member-1', '{broken');
    const publish = vi.fn();

    await expect(flushPendingJointWorkoutPublications('member-1', publish)).rejects.toMatchObject({ code: 'corrupt-json' } satisfies Partial<JointWorkoutPublicationQueueError>);
    expect(publish).not.toHaveBeenCalled();
    expect(storage.data.has('@gymbro/joint-workout-publications-quarantine/v1/member-1')).toBe(true);
    expect(storage.data.has('@gymbro/joint-workout-publications/v1/member-1')).toBe(false);
  });

  test('strictly rejects malformed commands and isolates owner queues', async () => {
    await expect(queueJointWorkoutPublication('member-1', { ...publication, completedWorkout: { ...publication.completedWorkout, durationSeconds: Number.NaN } })).rejects.toMatchObject({ code: 'invalid-command' });
    await queueJointWorkoutPublication('member-1', publication);
    await queueJointWorkoutPublication('member-2', { ...publication, attemptId: 'attempt-2' });

    await removePendingJointWorkoutPublication('member-1', 'joint-1');
    await expect(loadPendingJointWorkoutPublications('member-1')).resolves.toEqual([]);
    await expect(loadPendingJointWorkoutPublications('member-2')).resolves.toEqual([{ ...publication, attemptId: 'attempt-2' }]);
  });
});
