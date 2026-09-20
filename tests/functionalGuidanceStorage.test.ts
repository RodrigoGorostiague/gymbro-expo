import { beforeEach, expect, test, vi } from 'vitest';
const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
import { guidanceKey, readGuidancePreferences, removeGuidancePreferences, writeGuidancePreferences } from '../services/functionalGuidance';
import { newGuidancePreferences } from '../utils/functionalGuidance';
beforeEach(() => { vi.resetAllMocks(); storage.getItem.mockResolvedValue(null); storage.setItem.mockResolvedValue(undefined); storage.removeItem.mockResolvedValue(undefined); });
test('preferences contain metadata only and are isolated by account', async () => {
  expect(await readGuidancePreferences('a')).toEqual(newGuidancePreferences());
  const preferences = { ...newGuidancePreferences(), invitation: 'dismissed' as const };
  await writeGuidancePreferences('a', preferences);
  expect(storage.setItem).toHaveBeenCalledWith(guidanceKey('a'), JSON.stringify(preferences));
  await readGuidancePreferences('b');
  expect(storage.getItem).toHaveBeenLastCalledWith(guidanceKey('b'));
  await removeGuidancePreferences('a');
  expect(storage.removeItem).toHaveBeenCalledWith(guidanceKey('a'));
});
test('corrupt or unsupported saved data is not silently replaced', async () => {
  for (const raw of ['broken', '{}', JSON.stringify({ ...newGuidancePreferences(), schemaVersion: 2 })]) {
    storage.getItem.mockResolvedValueOnce(raw);
    await expect(readGuidancePreferences('a')).rejects.toThrow();
  }
  expect(storage.setItem).not.toHaveBeenCalled();
});
test('writes, reads and cleanup are serialized even after a failed write', async () => {
  let finish!: () => void;
  storage.setItem.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockRejectedValueOnce(new Error('disk'));
  const first = writeGuidancePreferences('a', newGuidancePreferences());
  await Promise.resolve(); await Promise.resolve();
  const second = writeGuidancePreferences('a', { ...newGuidancePreferences(), invitation: 'dismissed' });
  const rejected = expect(second).rejects.toThrow('disk');
  const cleanup = removeGuidancePreferences('a');
  expect(storage.removeItem).not.toHaveBeenCalled(); finish();
  await first; await rejected; await cleanup;
  expect(storage.removeItem).toHaveBeenCalledOnce();
});
