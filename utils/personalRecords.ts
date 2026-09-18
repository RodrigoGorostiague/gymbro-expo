import { LoadUnit, WorkoutAttempt } from '../types';
import { getEligiblePerformances } from './workoutAttempts';

export interface PersonalLoadRecord {
  key: string;
  exerciseId: string;
  name: string;
  variant: string;
  unit: LoadUnit;
  reps: number;
  load: number;
  previousLoad: number;
}
type Observation = Omit<PersonalLoadRecord, 'previousLoad'> & { volume: number };
export type PersonalVolumeRecord = Omit<PersonalLoadRecord, 'previousLoad' | 'load' | 'reps'> & { volume: number; previousVolume: number };
export type PersonalRepRecord = Omit<PersonalLoadRecord, 'previousLoad'> & { previousReps: number };
type RecordDimension = 'load' | 'reps' | 'volume';
function observations(attempt: WorkoutAttempt, dimension: RecordDimension): Observation[] {
  const identities = new Map<string, number>();
  attempt.exercises.forEach((exercise) => exercise.sets.forEach(({ plan }) => identities.set(plan.id, (identities.get(plan.id) ?? 0) + 1)));
  const values = attempt.exercises.flatMap((exercise) => {
    // Unknown historical variants cannot be recovered from today's routine/catalog.
    if (!exercise.exerciseId || typeof exercise.variant !== 'string' || !exercise.variant.trim()) return [];
    return getEligiblePerformances(dimension === 'volume' ? exercise.sets.filter(({ plan }) => identities.get(plan.id) === 1) : exercise.sets).flatMap((value): Observation[] => {
      if (value.mode !== 'external-load' || value.durationSeconds !== undefined || value.bodyweightIncluded) return [];
      return [{ key: JSON.stringify([exercise.exerciseId, exercise.variant, value.mode, value.unit, dimension === 'load' ? value.reps : dimension === 'reps' ? value.load : 0]),
        exerciseId: exercise.exerciseId!, name: exercise.recordedName, variant: exercise.variant!,
        unit: value.unit, reps: value.reps, load: value.load, volume: value.load * value.reps }];
    });
  });
  if (dimension !== 'volume') return values;
  const totals = new Map<string, Observation>();
  for (const value of values) {
    const prior = totals.get(value.key);
    totals.set(value.key, { ...value, volume: value.volume + (prior?.volume ?? 0) });
  }
  return [...totals.values()].filter((value) => Number.isFinite(value.volume));
}

function selectPersonalRecords(
  attempts: readonly WorkoutAttempt[], owner: string | null, attemptId: string, now: Date, dimension: RecordDimension,
): Array<Observation & { previousValue: number }> {
  if (!owner || !Number.isFinite(now.getTime())) return [];
  const owned = attempts.filter((attempt) => attempt.owner === owner);
  // Ambiguous duplicate IDs are not silently resolved by array order.
  const counts = new Map<string, number>();
  owned.forEach((attempt) => counts.set(attempt.id, (counts.get(attempt.id) ?? 0) + 1));
  const confirmed = owned.filter((attempt) => counts.get(attempt.id) === 1
    && attempt.rewardApplication.state === 'applied'
    && Number.isFinite(Date.parse(attempt.completedAt)) && Date.parse(attempt.completedAt) <= now.getTime());
  const target = confirmed.find((attempt) => attempt.id === attemptId);
  if (!target) return [];
  const before = new Map<string, number>();
  for (const previous of confirmed) {
    if (Date.parse(previous.completedAt) >= Date.parse(target.completedAt)) continue;
    for (const value of observations(previous, dimension)) before.set(value.key, Math.max(before.get(value.key) ?? -Infinity, value[dimension]));
  }
  const best = new Map<string, Observation>();
  for (const value of observations(target, dimension)) {
    if (!best.has(value.key) || value[dimension] > best.get(value.key)![dimension]) best.set(value.key, value);
  }
  return [...best.values()].flatMap((value) => {
    const previousValue = before.get(value.key);
    return previousValue !== undefined && value[dimension] > previousValue ? [{ ...value, previousValue }] : [];
  });
}

/** Higher external load at identical reps, within known-variant confirmed history only. */
export function selectPersonalLoadRecords(
  attempts: readonly WorkoutAttempt[], owner: string | null, attemptId: string, now = new Date(),
): PersonalLoadRecord[] {
  return selectPersonalRecords(attempts, owner, attemptId, now, 'load')
    .map(({ previousValue, volume: _volume, ...record }) => ({ ...record, previousLoad: previousValue }));
}

/** More reps at identical external load; no rounding, tolerance or unit conversion. */
export function selectPersonalRepRecords(
  attempts: readonly WorkoutAttempt[], owner: string | null, attemptId: string, now = new Date(),
): PersonalRepRecord[] {
  return selectPersonalRecords(attempts, owner, attemptId, now, 'reps')
    .map(({ previousValue, volume: _volume, ...record }) => ({ ...record, previousReps: previousValue }));
}

/** Sum of eligible external-load work per exercise/variant/unit within one attempt. */
export function selectPersonalVolumeRecords(
  attempts: readonly WorkoutAttempt[], owner: string | null, attemptId: string, now = new Date(),
): PersonalVolumeRecord[] {
  return selectPersonalRecords(attempts, owner, attemptId, now, 'volume')
    .map(({ previousValue, load: _load, reps: _reps, ...record }) => ({ ...record, previousVolume: previousValue }));
}
