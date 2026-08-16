import { beforeEach, describe, expect, test, vi } from 'vitest';
const storage = vi.hoisted(() => { const data = new Map<string, string>(); const failures = new Map<string, number>(); return { data, failures, getItem: vi.fn(async (key: string) => data.get(key) ?? null), getAllKeys: vi.fn(async () => [...data.keys()]), setItem: vi.fn(async (key: string, value: string) => { if ((failures.get(key) ?? 0) > 0) { failures.set(key, (failures.get(key) ?? 1) - 1); throw new Error('write failed'); } data.set(key, value); }), removeItem: vi.fn(async (key: string) => { data.delete(key); }), multiRemove: vi.fn(async (keys: readonly string[]) => { keys.forEach((key) => data.delete(key)); }) }; });
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
import { commitCatalogLibraryImport, deleteCatalogLibraryDefinition, hasSeenReleaseNotes, loadActiveWorkoutDraft, loadCatalogLibrary, loadMesocycles, markReleaseNotesSeen, removeActiveWorkoutDraftIfMatches, resetLegacyMesocycleStorage, saveActiveWorkoutDraft, saveMesocycles } from '../utils/storage';
const subject = { id: 'm1', name: 'Block', goal: '', status: 'draft' as const, durationWeeks: 1, createdAt: '', weeks: [{ id: 'w1', weekNumber: 1, entries: [{ id: 'p1', ref: { routineId: 'r1', routineName: 'Upper', source: 'local' as const }, order: 1, planningState: 'pending' as const }, { id: 'rest', kind: 'rest' as const }] }] };
beforeEach(() => { storage.data.clear(); storage.failures.clear(); vi.clearAllMocks(); });
describe('mesocycle reset', () => {
  test('migrates legacy keys before v2 hydration and preserves unrelated bytes', async () => { storage.data.set('@gymbro/mesocycles', JSON.stringify([subject])); storage.data.set('@gymbro/mesocycles/v1/brisas', JSON.stringify([{ ...subject, id: 'b1' }])); storage.data.set('@gymbro/attempts/v1/rodaja', 'attempts'); storage.data.set('@gymbro/sessions', 'sessions'); storage.data.set('@gymbro/routines', 'routines'); storage.data.set('@unrelated', 'other'); await resetLegacyMesocycleStorage('rodaja'); expect(JSON.parse(storage.data.get('@gymbro/mesocycles/v2/rodaja')!)).toEqual([subject]); expect(storage.data.get('@gymbro/mesocycles/v2/brisas')).toContain('b1'); expect(storage.data.get('@gymbro/attempts/v1/rodaja')).toBe('attempts'); expect(storage.data.get('@gymbro/sessions')).toBe('sessions'); expect(storage.data.get('@gymbro/routines')).toBe('routines'); expect(storage.data.get('@unrelated')).toBe('other'); expect(storage.data.has('@gymbro/mesocycles')).toBe(false); expect(storage.data.get('@gymbro/migrations/mesocycle-schedule-reset-v1')).toBe('complete'); });
  test('does not mark a failed migration and retries later', async () => { storage.data.set('@gymbro/mesocycles', JSON.stringify([subject])); storage.multiRemove.mockRejectedValueOnce(new Error('delete failed')); await expect(resetLegacyMesocycleStorage('rodaja')).rejects.toThrow('delete failed'); expect(storage.data.has('@gymbro/migrations/mesocycle-schedule-reset-v1')).toBe(false); await resetLegacyMesocycleStorage('rodaja'); expect(storage.data.has('@gymbro/mesocycles')).toBe(false); });
  test('writes and reads canonical v2 entries only', async () => { await saveMesocycles('rodaja', [subject]); await expect(loadMesocycles('rodaja')).resolves.toEqual([subject]); expect(storage.data.get('@gymbro/mesocycles/v2/rodaja')).toBeTruthy(); });
});
describe('active workout drafts', () => {
  const draft = { version: 1 as const, owner: 'rodaja' as const, attemptId: 'a', routineId: 'r', startedAtMs: 1, restTimerSeconds: 0, completedSets: {}, setValues: {} };
  test('ignores and quarantines malformed owner drafts', async () => { storage.data.set('@gymbro/active-workout/v1/rodaja', JSON.stringify({ owner: 'brisas' })); await expect(loadActiveWorkoutDraft('rodaja')).resolves.toBeNull(); expect(storage.data.has('@gymbro/active-workout/v1/rodaja')).toBe(false); });
  test('stores drafts by owner', async () => { await saveActiveWorkoutDraft(draft); await expect(loadActiveWorkoutDraft('rodaja', 1)).resolves.toEqual(draft); });
  test('round-trips the optional session prescription while accepting legacy drafts without one', async () => {
    const routineSnapshot = { id: 'r', name: 'Session-only', muscleGroups: ['pecho'], createdAt: '', exercises: [{ id: 'exercise', name: 'Press', muscleGroups: ['pecho'], variant: 'bar', sets: [{ id: 'set', tipo: 1, weight: 20, reps: 8 }] }] };
    await saveActiveWorkoutDraft({ ...draft, routineSnapshot });
    await expect(loadActiveWorkoutDraft('rodaja', 1)).resolves.toMatchObject({ routineSnapshot });
    storage.data.set('@gymbro/active-workout/v1/rodaja', JSON.stringify(draft));
    await expect(loadActiveWorkoutDraft('rodaja', 1)).resolves.toEqual(draft);
  });
  test('round-trips optional pause metadata while retaining legacy version-1 compatibility', async () => {
    await saveActiveWorkoutDraft({ ...draft, pausedAtMs: 10_000, pausedDurationMs: 4_000, pausedRestRemainingSeconds: 30 });
    await expect(loadActiveWorkoutDraft('rodaja', 20_000)).resolves.toMatchObject({ pausedAtMs: 10_000, pausedDurationMs: 4_000, pausedRestRemainingSeconds: 30 });
    storage.data.set('@gymbro/active-workout/v1/rodaja', JSON.stringify(draft));
    await expect(loadActiveWorkoutDraft('rodaja', 1)).resolves.toEqual(draft);
  });
  test('persists a cleared expired rest deadline and removes an exactly expired draft', async () => {
    await saveActiveWorkoutDraft({ ...draft, startedAtMs: 1_000, restEndsAtMs: 999 });
    await expect(loadActiveWorkoutDraft('rodaja', 1_000)).resolves.toEqual({ ...draft, startedAtMs: 1_000 });
    await saveActiveWorkoutDraft({ ...draft, startedAtMs: 1_000 });
    await expect(loadActiveWorkoutDraft('rodaja', 1_000 + 5 * 60 * 60 * 1_000)).resolves.toBeNull();
  });
  test('does not remove a replacement when expired cleanup targets an older attempt', async () => {
    await saveActiveWorkoutDraft({ ...draft, attemptId: 'replacement' });
    await expect(removeActiveWorkoutDraftIfMatches('rodaja', 'expired')).resolves.toBe(false);
    await expect(loadActiveWorkoutDraft('rodaja', 1)).resolves.toMatchObject({ attemptId: 'replacement' });
  });
});

describe('release notes', () => {
  test('records acknowledgement separately for every user and app version', async () => {
    await expect(hasSeenReleaseNotes('rodaja', '0.1.0')).resolves.toBe(false);
    await markReleaseNotesSeen('rodaja', '0.1.0');
    await expect(hasSeenReleaseNotes('rodaja', '0.1.0')).resolves.toBe(true);
    await expect(hasSeenReleaseNotes('brisas', '0.1.0')).resolves.toBe(false);
    await expect(hasSeenReleaseNotes('rodaja', '0.1.1')).resolves.toBe(false);
  });
});

describe('catalog library migration and deletion', () => {
  const catalogKey = '@gymbro/exercise-catalog/v1';
  const libraryKey = (owner: 'rodaja' | 'brisas') => `@gymbro/catalog-library/v2/${owner}`;

  const legacyRoutine = {
    id: 'routine-1',
    name: 'Legacy routine',
    muscleGroups: ['pecho'],
    createdAt: '2026-01-01T00:00:00.000Z',
    exercises: [{
      id: 'routine-exercise-1', catalogExerciseId: 'legacy-custom', name: 'Legacy custom', muscleGroups: ['pecho'],
      variant: 'libre', sets: [{ id: 'set-1', tipo: 8, reps: 8, weight: 0 }],
    }],
  };

  beforeEach(() => {
    storage.data.set(catalogKey, JSON.stringify({
      version: 1,
      variants: ['libre'],
      exercises: [
        { id: 'bench', name: ' Barbell   Bench Press ', muscleGroups: ['pecho', 'tríceps'], variant: 'barra', defaultSets: [] },
        { id: 'legacy-custom', name: 'Legacy custom', muscleGroups: ['pecho'], variant: 'libre', defaultSets: [{ id: 'zero', tipo: 8, reps: 8, weight: 0 }] },
      ],
    }));
    storage.data.set('@gymbro/routines', JSON.stringify([legacyRoutine]));
  });

  test('migrates legacy content non-destructively into independent owner libraries and preserves zero loads', async () => {
    const rodaja = await loadCatalogLibrary('rodaja');
    const brisas = await loadCatalogLibrary('brisas');

    expect(storage.data.get(catalogKey)).toContain('legacy-custom');
    expect(rodaja.definitions.find(({ id }) => id === 'system:barbell-bench-press')).toBeTruthy();
    expect(rodaja.definitions.find(({ id }) => id === 'custom:rodaja:legacy-custom')?.defaultSets[0]?.weight).toBe(0);
    expect(brisas.definitions.find(({ id }) => id === 'custom:brisas:legacy-custom')).toBeTruthy();
    expect(rodaja.routines[0].exercises[0].definitionId).toBe('custom:rodaja:legacy-custom');
    expect(brisas.routines[0].exercises[0].definitionId).toBe('custom:brisas:legacy-custom');
    expect(storage.data.has('@gymbro/catalog-library/v2/journal')).toBe(false);

    const firstWrite = storage.data.get(libraryKey('rodaja'));
    await expect(loadCatalogLibrary('rodaja')).resolves.toEqual(rodaja);
    expect(storage.data.get(libraryKey('rodaja'))).toBe(firstWrite);
  });

  test('recovers a staged journal before publishing a library', async () => {
    const staged = await loadCatalogLibrary('rodaja');
    storage.data.delete(libraryKey('rodaja'));
    storage.data.set('@gymbro/catalog-library/v2/journal', JSON.stringify({ version: 1, libraries: { rodaja: staged } }));

    await expect(loadCatalogLibrary('rodaja')).resolves.toEqual(staged);
    expect(storage.data.get(libraryKey('rodaja'))).toBe(JSON.stringify(staged));
    expect(storage.data.has('@gymbro/catalog-library/v2/journal')).toBe(false);
  });

  test('recovers a failed staged write without publishing a partial library', async () => {
    storage.failures.set(libraryKey('brisas'), 1);

    await expect(loadCatalogLibrary('rodaja')).rejects.toThrow('write failed');
    expect(storage.data.has('@gymbro/catalog-library/v2/journal')).toBe(true);

    await expect(loadCatalogLibrary('brisas')).resolves.toMatchObject({ owner: 'brisas', version: 2 });
    expect(storage.data.has('@gymbro/catalog-library/v2/journal')).toBe(false);
    expect(storage.data.has(libraryKey('rodaja'))).toBe(true);
  });

  test('blocks referenced custom deletion without mutating library or historical attempts', async () => {
    const library = await loadCatalogLibrary('rodaja');
    const persisted = storage.data.get(libraryKey('rodaja'));

    await expect(deleteCatalogLibraryDefinition('rodaja', 'custom:rodaja:legacy-custom')).rejects.toThrow('live prescriptions');
    expect(storage.data.get(libraryKey('rodaja'))).toBe(persisted);
    expect(library.attempts).toEqual([]);
  });

  test('deletes an unreferenced custom definition without rewriting historical snapshots', async () => {
    const library = await loadCatalogLibrary('rodaja');
    const archived = {
      id: 'custom:rodaja:archived-custom', source: { kind: 'custom' as const, owner: 'rodaja' as const, originId: 'archived-custom' },
      name: 'Archived custom', muscleGroups: ['pecho' as const], loadMode: 'external-load' as const, loadUnit: 'kg' as const, variant: 'libre', defaultSets: [],
    };
    const attempts = [{ id: 'attempt-1', exercises: [{ exerciseId: archived.id, recordedName: archived.name, sets: [{ plan: { targetLoad: 0 }, result: { performance: { load: 0, unit: 'kg' } } }] }] }] as any;
    storage.data.set(libraryKey('rodaja'), JSON.stringify({ ...library, definitions: [...library.definitions, archived], attempts }));

    const next = await deleteCatalogLibraryDefinition('rodaja', archived.id);

    expect(next.definitions.some(({ id }) => id === archived.id)).toBe(false);
    expect(next.attempts).toEqual(attempts);
    expect(JSON.stringify(next.attempts)).toContain('"load":0');
  });

  test('commits a valid import atomically and recovers a failed staged recipient write', async () => {
    await loadCatalogLibrary('rodaja');
    const plan = {
      recipient: 'brisas' as const,
      definitions: [{ id: 'source-custom', source: { kind: 'custom' as const, owner: 'rodaja' as const, originId: 'source-custom' }, name: 'Imported', muscleGroups: ['pecho' as const], loadMode: 'external-load' as const, loadUnit: 'kg' as const, variant: 'libre', defaultSets: [] }],
      routines: [{ id: 'source-routine', name: 'Imported routine', muscleGroups: ['pecho' as const], createdAt: '', exercises: [{ id: 'rx', definitionId: 'source-custom', name: 'Imported', muscleGroups: ['pecho' as const], variant: 'libre', sets: [] }] }],
      mesocycles: [],
    };
    storage.failures.set(libraryKey('brisas'), 1);

    await expect(commitCatalogLibraryImport('brisas', plan)).rejects.toThrow('write failed');
    expect(storage.data.has('@gymbro/catalog-library/v2/journal')).toBe(true);
    await expect(loadCatalogLibrary('brisas')).resolves.toMatchObject({ routines: expect.arrayContaining([expect.objectContaining({ id: 'import:brisas:routine:source-routine' })]) });
    expect(storage.data.has('@gymbro/catalog-library/v2/journal')).toBe(false);
  });

  test('rejects an invalid import without persisting any recipient changes', async () => {
    const library = await loadCatalogLibrary('brisas');
    const persisted = storage.data.get(libraryKey('brisas'));

    await expect(commitCatalogLibraryImport('brisas', {
      recipient: 'brisas', definitions: [],
      routines: [{ id: 'broken', name: 'Broken', muscleGroups: ['pecho'], createdAt: '', exercises: [{ id: 'rx', definitionId: 'missing', name: 'Missing', muscleGroups: ['pecho'], variant: 'libre', sets: [] }] }],
      mesocycles: [],
    })).rejects.toThrow('unknown definition');

    expect(storage.data.get(libraryKey('brisas'))).toBe(persisted);
    expect(await loadCatalogLibrary('brisas')).toEqual(library);
  });
});
