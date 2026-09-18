import AsyncStorage from '@react-native-async-storage/async-storage';
import { routineSchema } from '../packages/contracts/src';
import { RoutineEditorDraft } from '../utils/routineEditor';

const queues = new Map<string, Promise<unknown>>();
export const routineDraftKey = (owner: string, sourceId: string) =>
  `gymbro:routine-editor:v1:${encodeURIComponent(owner)}:${encodeURIComponent(sourceId)}`;
function queue<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(operation);
  queues.set(key, next);
  void next
    .finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    })
    .catch(() => undefined);
  return next;
}
export function writeRoutineDraft(draft: RoutineEditorDraft): Promise<void> {
  const key = routineDraftKey(draft.owner, draft.sourceId);
  const value = JSON.stringify(draft);
  return queue(key, () => AsyncStorage.setItem(key, value));
}
export function removeRoutineDraft(
  owner: string,
  sourceId: string,
): Promise<void> {
  const key = routineDraftKey(owner, sourceId);
  return queue(key, () => AsyncStorage.removeItem(key));
}
export function readRoutineDraft(
  owner: string,
  sourceId: string,
): Promise<RoutineEditorDraft | null> {
  const key = routineDraftKey(owner, sourceId);
  return queue(key, async () => {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as RoutineEditorDraft;
    if (
      !value ||
      value.version !== 1 ||
      value.owner !== owner ||
      value.sourceId !== sourceId ||
      !value.operationId ||
      !value.routine?.id ||
      !routineSchema.safeParse(value.routine).success ||
      (value.base !== null && !routineSchema.safeParse(value.base).success) ||
      !value.inputs ||
      typeof value.inputs !== 'object' ||
      !Object.values(value.inputs).every(
        (input) =>
          input &&
          typeof input.weight === 'string' &&
          typeof input.reps === 'string' &&
          (input.durationSeconds === undefined ||
            typeof input.durationSeconds === 'string'),
      )
    ) {
      throw new Error(
        'No se pudo leer el borrador local. No se ha sobrescrito.',
      );
    }
    return value;
  });
}
