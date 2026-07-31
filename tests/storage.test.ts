import { beforeEach, describe, expect, test, vi } from 'vitest';
const storage = vi.hoisted(() => { const data = new Map<string, string>(); const failures = new Map<string, number>(); return { data, failures, getItem: vi.fn(async (key: string) => data.get(key) ?? null), getAllKeys: vi.fn(async () => [...data.keys()]), setItem: vi.fn(async (key: string, value: string) => { if ((failures.get(key) ?? 0) > 0) { failures.set(key, (failures.get(key) ?? 1) - 1); throw new Error('write failed'); } data.set(key, value); }), removeItem: vi.fn(async (key: string) => { data.delete(key); }), multiRemove: vi.fn(async (keys: readonly string[]) => { keys.forEach((key) => data.delete(key)); }) }; });
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
import { loadActiveWorkoutDraft, loadMesocycles, removeActiveWorkoutDraftIfMatches, resetLegacyMesocycleStorage, saveActiveWorkoutDraft, saveMesocycles } from '../utils/storage';
const subject = { id: 'm1', name: 'Block', goal: '', status: 'draft' as const, durationWeeks: 1, createdAt: '', weeks: [{ id: 'w1', weekNumber: 1, entries: [{ id: 'p1', ref: { routineId: 'r1', routineName: 'Upper', source: 'local' as const }, order: 1 }, { id: 'rest', kind: 'rest' as const }] }] };
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
