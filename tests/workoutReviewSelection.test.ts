import { beforeEach, expect, test, vi } from 'vitest';
const storage = vi.hoisted(() => ({ values: new Map<string,string>(), getItem: vi.fn(), setItem: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
import { loadWorkoutReviewSelection, saveWorkoutReviewSelection } from '../services/workoutReviewSelection';
beforeEach(() => { vi.clearAllMocks(); storage.values.clear(); storage.getItem.mockImplementation(async (key) => storage.values.get(key) ?? null); storage.setItem.mockImplementation(async (key,value) => { storage.values.set(key,value); }); });
test('restores the exact submitted command, scoped to account and attempt', async () => {
 await saveWorkoutReviewSelection('owner','a',{ids:['record-1'],submitted:true});
 expect(await loadWorkoutReviewSelection('owner','a')).toEqual({ids:['record-1'],submitted:true});
 expect(await loadWorkoutReviewSelection('other','a')).toBeNull();
 expect(await loadWorkoutReviewSelection('owner','b')).toBeNull();
});
test('serializes fast selection edits before the submitted command', async () => {
 await Promise.all([
  saveWorkoutReviewSelection('owner','a',{ids:['1'],submitted:false}),
  saveWorkoutReviewSelection('owner','a',{ids:['1','2'],submitted:false}),
  saveWorkoutReviewSelection('owner','a',{ids:['2'],submitted:true}),
 ]);
 expect(await loadWorkoutReviewSelection('owner','a')).toEqual({ids:['2'],submitted:true});
});
test('storage failure blocks dispatch persistence and can be retried', async () => {
 storage.setItem.mockRejectedValueOnce(new Error('disk full'));
 await expect(saveWorkoutReviewSelection('owner','a',{ids:['1'],submitted:true})).rejects.toThrow('disk full');
 await saveWorkoutReviewSelection('owner','a',{ids:['1'],submitted:true});
 expect(await loadWorkoutReviewSelection('owner','a')).toMatchObject({submitted:true});
});
test('corrupt saved choices are not silently treated as an empty selection', async () => {
 storage.getItem.mockResolvedValue('{bad');
 await expect(loadWorkoutReviewSelection('owner','a')).rejects.toThrow();
});
