import AsyncStorage from '@react-native-async-storage/async-storage';
import { finishJointWorkout, JointCompletedWorkout, JointVisibility } from './jointWorkouts';

export type PendingJointWorkoutPublication = {
  workoutId: string;
  visibility: JointVisibility;
  completedWorkout: JointCompletedWorkout;
};

const storageKey = (owner: string) => `@gymbro/joint-workout-publications/v1/${owner}`;

function isPendingPublication(value: unknown): value is PendingJointWorkoutPublication {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const publication = value as Record<string, unknown>;
  return typeof publication.workoutId === 'string'
    && ['public', 'circle', 'private'].includes(String(publication.visibility))
    && !!publication.completedWorkout
    && typeof publication.completedWorkout === 'object'
    && !Array.isArray(publication.completedWorkout);
}

export async function loadPendingJointWorkoutPublications(owner: string): Promise<PendingJointWorkoutPublication[]> {
  const raw = await AsyncStorage.getItem(storageKey(owner));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPendingPublication) : [];
  } catch {
    return [];
  }
}

async function savePendingJointWorkoutPublications(owner: string, publications: readonly PendingJointWorkoutPublication[]): Promise<void> {
  if (!publications.length) {
    await AsyncStorage.removeItem(storageKey(owner));
    return;
  }
  await AsyncStorage.setItem(storageKey(owner), JSON.stringify(publications));
}

export async function queueJointWorkoutPublication(owner: string, publication: PendingJointWorkoutPublication): Promise<void> {
  const pending = await loadPendingJointWorkoutPublications(owner);
  await savePendingJointWorkoutPublications(owner, [
    ...pending.filter((item) => item.workoutId !== publication.workoutId),
    publication,
  ]);
}

export async function removePendingJointWorkoutPublication(owner: string, workoutId: string): Promise<void> {
  const pending = await loadPendingJointWorkoutPublications(owner);
  await savePendingJointWorkoutPublications(owner, pending.filter((item) => item.workoutId !== workoutId));
}

export async function flushPendingJointWorkoutPublications(
  owner: string,
  publish: (workoutId: string, visibility: JointVisibility, completedWorkout: JointCompletedWorkout) => Promise<void> = finishJointWorkout,
): Promise<number> {
  const pending = await loadPendingJointWorkoutPublications(owner);
  let published = 0;
  for (const publication of pending) {
    try {
      await publish(publication.workoutId, publication.visibility, publication.completedWorkout);
      await removePendingJointWorkoutPublication(owner, publication.workoutId);
      published += 1;
    } catch {
      // Keep the durable command for the next retry; the server command is idempotent.
    }
  }
  return published;
}
