export type MuscleMapMode = 'volume' | 'ranked';
const key = '@gymbro/muscle-map-mode/v1';
let writes = Promise.resolve();
export async function loadMuscleMapMode(): Promise<MuscleMapMode> {
  await writes.catch(() => undefined);
  const { default: storage } = await import('@react-native-async-storage/async-storage');
  return await storage.getItem(key) === 'ranked' ? 'ranked' : 'volume';
}
export function saveMuscleMapMode(mode: MuscleMapMode) {
  writes = writes.catch(() => undefined).then(async () => {
    const { default: storage } = await import('@react-native-async-storage/async-storage');
    await storage.setItem(key, mode);
  });
  return writes;
}
