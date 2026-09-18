import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ storage: new Map<string, string>(), files: new Set<string>(), failCopy: false, granted: true, failGallery: false }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: vi.fn(async (key: string) => state.storage.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { state.storage.set(key, value); }),
} }));
vi.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file://app/', makeDirectoryAsync: vi.fn(async () => {}),
  copyAsync: vi.fn(async ({ to }: { to: string }) => { if (state.failCopy) throw new Error('Disk full'); state.files.add(to); }),
  deleteAsync: vi.fn(async (uri: string) => { state.files.delete(uri); }),
}));
vi.mock('expo-media-library/legacy', () => ({ requestPermissionsAsync: vi.fn(async () => ({ granted: state.granted })), saveToLibraryAsync: vi.fn(async () => { if (state.failGallery) throw new Error('Gallery failed'); }) }));
import { copyBodyPhotoToGallery, loadBodyPhotos, removeBodyPhotos, storeBodyPhoto } from '../services/bodyPhotos';
import { localDay } from '../utils/bodyEvolution';
const input = () => ({ day: localDay(), pose: 'back' as const, uri: 'file://cache/photo.jpg', capturedAt: new Date().toISOString() });
beforeEach(() => { state.storage.clear(); state.files.clear(); state.failCopy = false; state.granted = true; state.failGallery = false; });
describe('private local body photos', () => {
  it('isolates accounts and replaces only the same pose/day', async () => {
    const first = await storeBodyPhoto('alice', input());
    const second = await storeBodyPhoto('alice', input());
    expect(await loadBodyPhotos('bob')).toEqual([]);
    expect((await loadBodyPhotos('alice')).map(p => p.id)).toEqual([second.id]);
    expect(state.files.has(first.uri)).toBe(false);
    expect(state.files.has(second.uri)).toBe(true);
  });
  it('preserves the original if copying a replacement fails', async () => {
    const first = await storeBodyPhoto('alice', input()); state.failCopy = true;
    await expect(storeBodyPhoto('alice', input())).rejects.toThrow('Disk full');
    expect((await loadBodyPhotos('alice'))[0].id).toBe(first.id);
    expect(state.files.has(first.uri)).toBe(true);
  });
  it('serializes concurrent pose saves', async () => {
    await Promise.all([storeBodyPhoto('alice', input()), storeBodyPhoto('alice', { ...input(), pose: 'front-legs' })]);
    expect(await loadBodyPhotos('alice')).toHaveLength(2);
  });
  it('deletes only files belonging to the active owner', async () => {
    const a = await storeBodyPhoto('alice', input());
    await removeBodyPhotos('bob', [a.id]);
    expect(state.files.has(a.uri)).toBe(true);
    await removeBodyPhotos('alice', [a.id]);
    expect(await loadBodyPhotos('alice')).toEqual([]);
    expect(state.files.has(a.uri)).toBe(false);
  });
  it('retains internal photo when gallery permission is denied or export fails', async () => {
    const photo = await storeBodyPhoto('alice', input());
    state.granted = false;
    expect(await copyBodyPhotoToGallery(photo.uri)).toBe(false);
    state.granted = true; state.failGallery = true;
    expect(await copyBodyPhotoToGallery(photo.uri)).toBe(false);
    expect(await loadBodyPhotos('alice')).toHaveLength(1);
  });
  it('rejects historical saves and refuses to overwrite a corrupt index', async () => {
    await expect(storeBodyPhoto('alice', { ...input(), day: '2000-01-01' })).rejects.toThrow();
    state.storage.set('body-photos:v1:alice', '{}');
    await expect(storeBodyPhoto('alice', input())).rejects.toThrow();
    expect(state.files.size).toBe(0);
  });
});
