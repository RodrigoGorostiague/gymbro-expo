import AsyncStorage from '@react-native-async-storage/async-storage';
export type WorkoutReviewSelection = { ids: string[]; submitted: boolean };
const storageKey = (owner: string, attemptId: string) => `@gymbro/workout-review/v1/${encodeURIComponent(owner)}/${encodeURIComponent(attemptId)}`;
const operations = new Map<string, Promise<void>>();
export async function loadWorkoutReviewSelection(owner: string, attemptId: string): Promise<WorkoutReviewSelection | null> {
  const key = storageKey(owner, attemptId);
  await operations.get(key);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value || !Array.isArray(value.ids) || value.ids.some((id: unknown) => typeof id !== 'string') || typeof value.submitted !== 'boolean') throw new Error('No se pudo recuperar la selección guardada.');
  return { ids: [...new Set<string>(value.ids)], submitted: value.submitted };
}
export function saveWorkoutReviewSelection(owner: string, attemptId: string, selection: WorkoutReviewSelection): Promise<void> {
  const key = storageKey(owner, attemptId);
  const next = (operations.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => AsyncStorage.setItem(key, JSON.stringify(selection)));
  operations.set(key, next);
  void next.finally(() => { if (operations.get(key) === next) operations.delete(key); }).catch(() => undefined);
  return next;
}
