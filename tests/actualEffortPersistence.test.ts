import { expect, test, vi } from 'vitest';
import type { ActiveWorkoutDraft } from '../types';
const storage = vi.hoisted(() => { const values = new Map<string, string>(); return { getItem: vi.fn(async (key: string) => values.get(key) ?? null), setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }), removeItem: vi.fn(async (key: string) => { values.delete(key); }) }; });
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
vi.mock('../services/supabase', () => ({ supabase: { rpc: vi.fn() } }));
import { OfflineWorkoutJournal } from '../services/offlineWorkout';
test('offline journal restart and synchronization retain exact actual effort in runtime values', async () => {
 const draft: ActiveWorkoutDraft = { version: 1, owner: 'owner', attemptId: 'a', routineId: 'r', startedAtMs: 1, restTimerSeconds: 30, routineSnapshot: { id: 'r', name: 'R', createdAt: '', muscleGroups: [], exercises: [] }, completedSets: { 'e-s': true }, setValues: { 'e-s': { weight: '20', reps: '8', actualEffort: { kind: 'rir', value: 0 } } } };
 const send = vi.fn(async (journal: any) => ({ draft: journal.draft }));
 const store = new OfflineWorkoutJournal('owner', () => true, () => undefined, send);
 await store.seed(draft);
 const reopened = new OfflineWorkoutJournal('owner', () => true, () => undefined, send);
 await reopened.restore();
 await reopened.sync();
 expect(JSON.stringify(send.mock.calls[0])).toContain('"actualEffort":{"kind":"rir","value":0}');
});
