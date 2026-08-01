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

import { loadCatalogLibrary, loadSessions, migrateLegacyAliasToUid, updateCatalogLibrary } from '../utils/storage';

const uid = '6a686e0c-a268-4d75-a9ad-8f66bf01f2f4';

describe('legacy alias UID migration', () => {
  beforeEach(() => {
    storage.data.clear();
    vi.clearAllMocks();
  });

  test('copies an alias library once, rewrites ownership, and preserves the source', async () => {
    const legacy = await loadCatalogLibrary('rodaja');
    storage.data.set('@gymbro/sessions', JSON.stringify([{ id: 'session-1', owner: 'rodaja' }]));
    await migrateLegacyAliasToUid('rodaja', uid);

    await expect(loadCatalogLibrary(uid)).resolves.toMatchObject({ owner: uid });
    expect(storage.data.get('@gymbro/catalog-library/v2/rodaja')).toBe(JSON.stringify(legacy));
    expect(storage.data.get(`@gymbro/migrations/uid-ownership-v1/${uid}`)).toBe('complete');
    await expect(loadSessions(uid)).resolves.toEqual([{ id: 'session-1', owner: uid }]);

    vi.clearAllMocks();
    await migrateLegacyAliasToUid('rodaja', uid);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test('creates an empty UID library without copying data when no alias is available', async () => {
    await migrateLegacyAliasToUid(null, uid);
    await expect(loadCatalogLibrary(uid)).resolves.toMatchObject({ owner: uid, routines: [] });
    expect(storage.data.has(`@gymbro/catalog-library/v2/${uid}`)).toBe(true);
  });

  test('persists routines for an authenticated UID instead of only legacy aliases', async () => {
    await loadCatalogLibrary(uid);
    await updateCatalogLibrary(uid, (library) => ({
      ...library,
      routines: [{ id: 'routine-1', name: 'Upper', muscleGroups: ['GM-100'], exercises: [], createdAt: '2026-08-01T00:00:00.000Z' }],
    }));

    await expect(loadCatalogLibrary(uid)).resolves.toMatchObject({
      routines: [expect.objectContaining({ id: 'routine-1', muscleGroups: ['GM-100'] })],
    });
  });
});
