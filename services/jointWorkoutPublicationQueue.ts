import AsyncStorage from '@react-native-async-storage/async-storage';
import { finishJointWorkout, JointCompletedWorkout, JointVisibility } from './jointWorkouts';
import { asSharePayload } from './workoutRecapFeed';

export type PendingJointWorkoutPublication = {
  attemptId: string;
  workoutId: string;
  visibility: JointVisibility;
  completedWorkout: JointCompletedWorkout;
};

const storageKey = (owner: string) => `@gymbro/joint-workout-publications/v1/${owner}`;
const quarantineKey = (owner: string) => `@gymbro/joint-workout-publications-quarantine/v1/${owner}`;
const ownerOperations = new Map<string, Promise<void>>();

type StoredPublication = PendingJointWorkoutPublication & {
  version: 1;
  owner: string;
  state: 'prepared' | 'ready';
};

type StoredQueue = {
  version: 1;
  owner: string;
  commands: StoredPublication[];
};

export class JointWorkoutPublicationQueueError extends Error {
  constructor(
    readonly code: 'invalid-owner' | 'invalid-command' | 'corrupt-json' | 'invalid-storage',
    message: string,
  ) {
    super(message);
    this.name = 'JointWorkoutPublicationQueueError';
  }
}

function runForOwner<T>(owner: string, operation: () => Promise<T>): Promise<T> {
  const previous = ownerOperations.get(owner) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const tail = result.then(() => undefined, () => undefined);
  ownerOperations.set(owner, tail);
  return result.finally(() => {
    if (ownerOperations.get(owner) === tail) ownerOperations.delete(owner);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function validOwner(owner: string): boolean {
  return owner.trim().length > 0 && owner.length <= 128;
}

function validLabel(value: unknown, max = 120): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function isCompletedWorkout(value: unknown): value is JointCompletedWorkout {
  if (!isRecord(value) || !hasOnly(value, ['routineName', 'durationSeconds', 'exercises', 'sharePayload'])
    || !validLabel(value.routineName) || !Number.isInteger(value.durationSeconds)
    || (value.durationSeconds as number) < 0 || (value.durationSeconds as number) > 18_000
    || !Array.isArray(value.exercises) || value.exercises.length > 100) return false;
  const validSet = (set: unknown) => isRecord(set) && hasOnly(set, ['weight', 'reps', 'completed'])
    && typeof set.weight === 'number' && Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 10_000
    && typeof set.reps === 'number' && Number.isInteger(set.reps) && set.reps >= 0 && set.reps <= 1_000
    && typeof set.completed === 'boolean';
  const validExercise = (exercise: unknown) => isRecord(exercise) && hasOnly(exercise, ['name', 'muscleGroupIds', 'sets'])
    && validLabel(exercise.name) && Array.isArray(exercise.muscleGroupIds) && exercise.muscleGroupIds.length <= 32
    && exercise.muscleGroupIds.every((muscle) => validLabel(muscle))
    && Array.isArray(exercise.sets) && exercise.sets.length <= 100 && exercise.sets.every(validSet);
  return value.exercises.every(validExercise)
    && (value.sharePayload === undefined || asSharePayload(value.sharePayload) !== null);
}

function isPublicationInput(value: unknown): value is PendingJointWorkoutPublication {
  if (!isRecord(value) || !hasOnly(value, ['attemptId', 'workoutId', 'visibility', 'completedWorkout'])) return false;
  return validLabel(value.attemptId, 128) && validLabel(value.workoutId, 128)
    && (value.visibility === 'public' || value.visibility === 'circle' || value.visibility === 'private')
    && isCompletedWorkout(value.completedWorkout);
}

function asStoredPublication(value: unknown, owner: string): StoredPublication | null {
  if (!isRecord(value) || !hasOnly(value, ['version', 'owner', 'state', 'attemptId', 'workoutId', 'visibility', 'completedWorkout'])
    || value.version !== 1 || value.owner !== owner || (value.state !== 'prepared' && value.state !== 'ready')) return null;
  const input = { attemptId: value.attemptId, workoutId: value.workoutId, visibility: value.visibility, completedWorkout: value.completedWorkout };
  return isPublicationInput(input) ? { ...input, version: 1, owner, state: value.state } : null;
}

function asLegacyPublication(value: unknown, owner: string): StoredPublication | null {
  if (!isRecord(value) || !hasOnly(value, ['workoutId', 'visibility', 'completedWorkout'])) return null;
  const input = { attemptId: 'legacy', workoutId: value.workoutId, visibility: value.visibility, completedWorkout: value.completedWorkout };
  return isPublicationInput(input) ? { ...input, version: 1, owner, state: 'ready' } : null;
}

async function quarantine(owner: string, reason: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(quarantineKey(owner), JSON.stringify({ version: 1, owner, reason, quarantinedAt: new Date().toISOString(), value }));
}

async function save(owner: string, publications: readonly StoredPublication[]): Promise<void> {
  if (!publications.length) {
    await AsyncStorage.removeItem(storageKey(owner));
    return;
  }
  const queue: StoredQueue = { version: 1, owner, commands: [...publications] };
  await AsyncStorage.setItem(storageKey(owner), JSON.stringify(queue));
}

async function load(owner: string): Promise<StoredPublication[]> {
  if (!validOwner(owner)) throw new JointWorkoutPublicationQueueError('invalid-owner', 'The publication queue owner is invalid.');
  const raw = await AsyncStorage.getItem(storageKey(owner));
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await quarantine(owner, 'corrupt-json', raw);
    await AsyncStorage.removeItem(storageKey(owner));
    throw new JointWorkoutPublicationQueueError('corrupt-json', 'The joint workout publication queue contains corrupt JSON.');
  }

  const legacy = Array.isArray(parsed);
  if (!legacy && (!isRecord(parsed) || parsed.version !== 1 || parsed.owner !== owner || !Array.isArray(parsed.commands)
    || !hasOnly(parsed, ['version', 'owner', 'commands']))) {
    await quarantine(owner, 'invalid-storage', parsed);
    await AsyncStorage.removeItem(storageKey(owner));
    throw new JointWorkoutPublicationQueueError('invalid-storage', 'The joint workout publication queue has an invalid owner or format.');
  }
  const source = (legacy ? parsed : (parsed as StoredQueue).commands) as unknown[];
  const publications = source.flatMap((value) => {
    const publication = legacy ? asLegacyPublication(value, owner) : asStoredPublication(value, owner);
    return publication ? [publication] : [];
  });
  if (publications.length !== source.length) await quarantine(owner, 'invalid-command', source.filter((value) => !(legacy ? asLegacyPublication(value, owner) : asStoredPublication(value, owner))));
  if (legacy || publications.length !== source.length) await save(owner, publications);
  return publications;
}

export async function loadPendingJointWorkoutPublications(owner: string): Promise<PendingJointWorkoutPublication[]> {
  return runForOwner(owner, async () => (await load(owner)).map(({ attemptId, workoutId, visibility, completedWorkout }) => ({ attemptId, workoutId, visibility, completedWorkout })));
}

async function upsert(owner: string, publication: PendingJointWorkoutPublication, state: StoredPublication['state']): Promise<void> {
  if (!validOwner(owner)) throw new JointWorkoutPublicationQueueError('invalid-owner', 'The publication queue owner is invalid.');
  if (!isPublicationInput(publication)) throw new JointWorkoutPublicationQueueError('invalid-command', 'The joint workout publication command is invalid.');
  const pending = await load(owner);
  await save(owner, [...pending.filter((item) => item.workoutId !== publication.workoutId), { ...publication, version: 1, owner, state }]);
}

export async function queueJointWorkoutPublication(owner: string, publication: PendingJointWorkoutPublication): Promise<void> {
  await runForOwner(owner, () => upsert(owner, publication, 'ready'));
}

export async function prepareJointWorkoutPublication(owner: string, publication: PendingJointWorkoutPublication): Promise<void> {
  await runForOwner(owner, () => upsert(owner, publication, 'prepared'));
}

export async function removePendingJointWorkoutPublication(owner: string, workoutId: string): Promise<void> {
  await runForOwner(owner, async () => {
    if (!validLabel(workoutId, 128)) throw new JointWorkoutPublicationQueueError('invalid-command', 'The joint workout publication ID is invalid.');
    const pending = await load(owner);
    await save(owner, pending.filter((item) => item.workoutId !== workoutId));
  });
}

export async function flushPendingJointWorkoutPublications(
  owner: string,
  publish: (workoutId: string, visibility: JointVisibility, completedWorkout: JointCompletedWorkout) => Promise<void> = finishJointWorkout,
  finalizedAttempts: readonly { id: string; owner: string; jointWorkoutId?: string }[] = [],
): Promise<number> {
  return runForOwner(owner, async () => {
    let pending = await load(owner);
    const finalized = new Set(finalizedAttempts.filter((attempt) => attempt.owner === owner && attempt.jointWorkoutId).map((attempt) => `${attempt.id}:${attempt.jointWorkoutId}`));
    pending = pending.map((publication) => publication.state === 'prepared' && finalized.has(`${publication.attemptId}:${publication.workoutId}`)
      ? { ...publication, state: 'ready' }
      : publication);
    await save(owner, pending);
    let published = 0;
    for (const publication of [...pending]) {
      if (publication.state !== 'ready') continue;
      try {
        await publish(publication.workoutId, publication.visibility, publication.completedWorkout);
        pending = pending.filter((item) => item.workoutId !== publication.workoutId);
        await save(owner, pending);
        published += 1;
      } catch {
        // Keep the durable command for the next retry; finish_joint_workout is idempotent.
      }
    }
    return published;
  });
}
