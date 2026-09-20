import AsyncStorage from '@react-native-async-storage/async-storage';
import { GuidancePreferences, newGuidancePreferences } from '../utils/functionalGuidance';

export const guidanceKey = (owner: string) => `@gymbro/functional-guidance/v1/${encodeURIComponent(owner)}`;
const queues = new Map<string, Promise<unknown>>();
function enqueue<T>(owner: string, operation: () => Promise<T>): Promise<T> {
  const next = (queues.get(owner) ?? Promise.resolve()).catch(() => undefined).then(operation);
  queues.set(owner, next);
  void next.finally(() => { if (queues.get(owner) === next) queues.delete(owner); }).catch(() => undefined);
  return next;
}
export function readGuidancePreferences(owner: string): Promise<GuidancePreferences> {
  return enqueue(owner, async () => {
    const raw = await AsyncStorage.getItem(guidanceKey(owner));
    if (!raw) return newGuidancePreferences();
    const value = JSON.parse(raw);
    if (!value || value.schemaVersion !== 1 || !['unseen', 'accepted', 'dismissed'].includes(value.invitation)
      || !Array.isArray(value.dismissedTopicIds) || !value.dismissedTopicIds.every((id: unknown) => typeof id === 'string')
      || ![value.selectedRoutineId, value.reviewedResultId].every(id => id === null || typeof id === 'string')
      || typeof value.mesocycleTopicAcknowledged !== 'boolean') throw new Error('Preferencias de ayuda no disponibles.');
    return { schemaVersion: 1, invitation: value.invitation, dismissedTopicIds: value.dismissedTopicIds,
      selectedRoutineId: value.selectedRoutineId, reviewedResultId: value.reviewedResultId,
      mesocycleTopicAcknowledged: value.mesocycleTopicAcknowledged };
  });
}
export function writeGuidancePreferences(owner: string, value: GuidancePreferences) {
  const raw = JSON.stringify(value);
  return enqueue(owner, () => AsyncStorage.setItem(guidanceKey(owner), raw));
}
/** Explicit cleanup for a future account-deletion flow; sign-out preserves device preferences. */
export function removeGuidancePreferences(owner: string) {
  return enqueue(owner, () => AsyncStorage.removeItem(guidanceKey(owner)));
}
