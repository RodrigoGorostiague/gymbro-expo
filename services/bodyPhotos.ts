import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import { assertToday, BodyPhoto, BodyPose, BODY_POSES } from '../utils/bodyEvolution';

const key = (owner: string) => `body-photos:v1:${encodeURIComponent(owner)}`;
function directory(owner: string) {
  if (!owner || !FileSystem.documentDirectory) throw new Error('El almacenamiento local no está disponible.');
  return `${FileSystem.documentDirectory}body-photos/${encodeURIComponent(owner)}/`;
}
// Serializes index updates so simultaneous saves/deletes cannot overwrite one another.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}
export async function loadBodyPhotos(owner: string): Promise<BodyPhoto[]> {
  const raw = await AsyncStorage.getItem(key(owner));
  if (!raw) return [];
  const rows: BodyPhoto[] = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.some(p => !/^[\w-]+$/.test(p.id) || !BODY_POSES.some(pose => pose.id === p.pose) || !/^\d{4}-\d{2}-\d{2}$/.test(p.day))) throw new Error('No se pudo leer el historial de fotos. No se modificó.');
  return rows.map(photo => ({ ...photo, uri: `${directory(owner)}${photo.id}.jpg` }));
}
export async function storeBodyPhoto(owner: string, input: { day: string; pose: BodyPose; uri: string; capturedAt: string }): Promise<BodyPhoto> {
  return exclusive(async () => {
    assertToday(input.day);
    const photos = await loadBodyPhotos(owner);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const photo: BodyPhoto = { ...input, id, uri: `${directory(owner)}${id}.jpg` };
    await FileSystem.makeDirectoryAsync(directory(owner), { intermediates: true });
    await FileSystem.copyAsync({ from: input.uri, to: photo.uri });
    const previous = photos.find(p => p.day === input.day && p.pose === input.pose);
    try {
      assertToday(input.day);
      await AsyncStorage.setItem(key(owner), JSON.stringify([...photos.filter(p => p.id !== previous?.id), photo]));
    } catch (error) { await FileSystem.deleteAsync(photo.uri, { idempotent: true }); throw error; }
    // A replacement is committed before removing the old file.
    if (previous) await FileSystem.deleteAsync(previous.uri, { idempotent: true }).catch(() => undefined);
    return photo;
  });
}
export async function removeBodyPhotos(owner: string, ids: string[]) {
  return exclusive(async () => {
    const photos = await loadBodyPhotos(owner);
    // Preserve metadata on failure so the user can retry cleanup.
    for (const photo of photos.filter(p => ids.includes(p.id))) await FileSystem.deleteAsync(photo.uri, { idempotent: true });
    await AsyncStorage.setItem(key(owner), JSON.stringify(photos.filter(p => !ids.includes(p.id))));
  });
}
export async function copyBodyPhotoToGallery(uri: string): Promise<boolean> {
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
    if (!permission.granted) return false;
    await MediaLibrary.saveToLibraryAsync(uri);
    return true;
  } catch { return false; }
}
