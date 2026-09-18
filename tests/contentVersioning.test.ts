import { describe, expect, test } from 'vitest';
import { isCurrentContentVersion, nextContentVersion } from '../utils/contentVersioning';

describe('content versioning', () => {
  test('creates an immutable successor linked to its origin', () => {
    const first = { id: 'routine-1', name: 'Upper' };
    const second = nextContentVersion(first, { ...first, name: 'Upper v2' }, 'routine-2');

    expect(second).toMatchObject({ id: 'routine-2', name: 'Upper v2', version: 2, versionOf: 'routine-1', previousVersionId: 'routine-1' });
    expect(first).toEqual({ id: 'routine-1', name: 'Upper' });
  });

  test('keeps only the latest version in active library projections', () => {
    const first = { id: 'routine-1' };
    const second = nextContentVersion(first, first, 'routine-2');

    expect(isCurrentContentVersion(first, [first, second])).toBe(false);
    expect(isCurrentContentVersion(second, [first, second])).toBe(true);
  });
});
