import { beforeEach, describe, expect, test, vi } from 'vitest';

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: vi.fn(async (key: string) => data.get(key) ?? null),
    getAllKeys: vi.fn(async () => [...data.keys()]),
    setItem: vi.fn(async (key: string, value: string) => { data.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { data.delete(key); }),
    multiRemove: vi.fn(async (keys: readonly string[]) => { keys.forEach((key) => data.delete(key)); }),
  };
});

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));

import { readLegacyCustomDefinitions, wipeLegacyTrainingRuntimeState } from '../utils/storage';

const customDefinition = {
  id: 'custom:owner:press', source: { kind: 'custom' as const, owner: 'owner', originId: 'press' },
  name: 'Press', muscleGroups: ['GM-100'], loadMode: 'external-load' as const, loadUnit: 'kg' as const,
  variant: 'barra', defaultSets: [],
};

describe('training clean slate storage boundary', () => {
  beforeEach(() => { storage.data.clear(); vi.clearAllMocks(); });

  test('wipes runtime state while retaining only owner custom definitions for remote import', async () => {
    storage.data.set('@gymbro/catalog-library/v2/owner', JSON.stringify({ definitions: [customDefinition], routines: [{ id: 'r' }], mesocycles: [], attempts: [{ id: 'a' }] }));
    storage.data.set('@gymbro/routines', '[]');
    storage.data.set('@gymbro/mesocycles/v2/owner', '[]');
    storage.data.set('@gymbro/attempts/v1/owner', '[]');
    storage.data.set('@gymbro/sessions/v2/owner', '[]');
    storage.data.set('@gymbro/active-workout/v1/owner', '{}');
    storage.data.set('@gymbro/shop/owner', '{}');

    await expect(readLegacyCustomDefinitions('owner')).resolves.toEqual([customDefinition]);
    expect(storage.data.has('@gymbro/catalog-library/v2/owner')).toBe(true);
    await wipeLegacyTrainingRuntimeState();

    expect([...storage.data.keys()].some((key) => key.includes('catalog-library') || key.includes('routines') || key.includes('mesocycles') || key.includes('attempts') || key.includes('sessions') || key.includes('active-workout') || key.includes('/shop/'))).toBe(false);
  });

  test('unions and deduplicates journal-only custom definitions before deleting the journal', async () => {
    storage.data.set('@gymbro/catalog-library/v2/owner', JSON.stringify({ definitions: [customDefinition] }));
    storage.data.set('@gymbro/catalog-library/v2/journal', JSON.stringify({
      version: 1,
      libraries: {
        owner: {
          definitions: [customDefinition, { ...customDefinition, id: 'custom:owner:row', source: { kind: 'custom', owner: 'owner', originId: 'row' }, name: 'Row' }],
        },
      },
    }));

    await expect(readLegacyCustomDefinitions('owner')).resolves.toEqual([
      customDefinition,
      expect.objectContaining({ id: 'custom:owner:row', name: 'Row' }),
    ]);

    expect(storage.data.has('@gymbro/catalog-library/v2/journal')).toBe(true);
    await wipeLegacyTrainingRuntimeState();
    expect(storage.data.has('@gymbro/catalog-library/v2/journal')).toBe(false);
  });
});
