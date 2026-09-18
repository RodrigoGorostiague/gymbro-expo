import { describe, expect, test } from 'vitest';
import { Routine } from '../types';
import { groupRoutinesForLibrary } from '../utils/routineLibrary';

const routine = (id: string, createdAt: string, sharedFrom?: Routine['sharedFrom']): Routine => ({
  id,
  name: id,
  muscleGroups: [],
  exercises: [],
  createdAt,
  sharedFrom,
});

describe('routine library grouping', () => {
  test('keeps owned routines visible and groups accepted copies by acceptance date', () => {
    const groups = groupRoutinesForLibrary([
      routine('owned-old', '2026-08-01T10:00:00Z'),
      routine('shared-old', '2026-08-04T10:00:00Z', { requestId: 'request-1', senderId: 'sender-1', acceptedAt: '2026-08-05T10:00:00Z' }),
      routine('owned-new', '2026-08-03T10:00:00Z'),
      routine('shared-new', '2026-08-02T10:00:00Z', { requestId: 'request-2', senderId: 'sender-2', acceptedAt: '2026-08-06T10:00:00Z' }),
    ]);

    expect(groups.map(({ key, items }) => [key, items.map(({ id }) => id)])).toEqual([
      ['owned', ['owned-new', 'owned-old']],
      ['shared', ['shared-new', 'shared-old']],
    ]);
  });

  test('hides superseded versions from the active library', () => {
    const groups = groupRoutinesForLibrary([
      routine('upper-v1', '2026-08-01T10:00:00Z'),
      { ...routine('upper-v2', '2026-08-02T10:00:00Z'), version: 2, versionOf: 'upper-v1', previousVersionId: 'upper-v1' },
    ]);

    expect(groups[0].items.map(({ id }) => id)).toEqual(['upper-v2']);
  });
});
