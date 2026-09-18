import { ActualEffort, LoadUnit, Mesocycle, Routine, WorkoutAttempt, WorkoutLineage } from '../types';
import { derivePlannedEntryDate, flattenMesocycleEntries, isExecutablePlannedSession } from './mesocycles';
import { readActualEffort } from './actualEffort';
import { isValidPerformance } from './workoutAttempts';
import { reconcileSessionSetValues, snapshotWorkoutRoutine } from './workoutDraft';

export interface PreviousSetPerformance { weight: number; reps: number; durationSeconds?: number; unit: LoadUnit; actualEffort?: ActualEffort; attemptId: string; completedAt: string }

/** Launch-only suggestions. Never writes a calendar prescription or a historical attempt. */
export function seedMesocycleWorkout(
  routine: Routine, mesocycles: readonly Mesocycle[], attempts: readonly WorkoutAttempt[],
  owner: string | null, lineage?: WorkoutLineage, now = Date.now(),
) {
  const working = snapshotWorkoutRoutine(routine);
  const seed = { previous: {} as Record<string, PreviousSetPerformance>, routine: working, values: reconcileSessionSetValues(working, {}), restTimerSeconds: undefined as number | undefined };
  const block = lineage && mesocycles.find((item) => item.id === lineage.mesocycleId && item.status === 'active');
  if (!owner || !lineage || !block) return seed;
  const slots = flattenMesocycleEntries(block);
  const target = slots.find((slot) => slot.weekNumber === lineage.weekNumber && slot.entry.id === lineage.plannedSessionId);
  if (!target || !('ref' in target.entry) || target.entry.ref.routineId !== routine.id || !isExecutablePlannedSession(target.entry)) return seed;
  const dateOrder = (slot: typeof target) => derivePlannedEntryDate(block, slot.entry.id, slot.dayOffset)?.getTime() ?? slot.dayOffset;
  const sources = attempts.flatMap((attempt) => {
    const source = slots.find((slot) => slot.weekNumber === attempt.lineage?.weekNumber && slot.entry.id === attempt.lineage?.plannedSessionId);
    const completedAt = Date.parse(attempt.completedAt);
    if (attempt.owner !== owner || attempt.lineage?.mesocycleId !== block.id || attempt.routineId !== routine.id
      || !Number.isFinite(completedAt) || completedAt > now || !source || dateOrder(source) >= dateOrder(target)
      || !('ref' in source.entry) || !isExecutablePlannedSession(source.entry)
      || source.entry.ref.routineId !== routine.id || source.entry.routineSnapshot?.id !== routine.id) return [];
    return [{ attempt, prescription: source.entry.routineSnapshot, completedAt }];
  }).sort((a, b) => b.completedAt - a.completedAt || b.attempt.id.localeCompare(a.attempt.id));
  const source = sources[0];
  if (!source) return seed;
  let carried = false;
  for (const exercise of working.exercises) {
    const original = source.prescription.exercises.find((item) => item.id === exercise.id);
    const identity = exercise.catalogExerciseId ?? exercise.id;
    const observations = source.attempt.exercises.filter((item) => item.exerciseId === identity);
    if (!original || observations.length !== 1 || (original.catalogExerciseId ?? original.id) !== identity
      || (observations[0].variant !== undefined && observations[0].variant !== exercise.variant)
      || original.variant !== exercise.variant || original.loadMode !== exercise.loadMode || original.loadUnit !== exercise.loadUnit
      || !exercise.loadMode || !exercise.loadUnit) continue;
    for (const set of exercise.sets) {
      const planned = original.sets.find((item) => item.id === set.id);
      const captured = observations[0].sets.find((item) => item.plan.id === `${original.id}:${set.id}`);
      // Any different prescription protects the complete set, including deliberate deloads.
      if (!planned || !captured || set.tipo !== planned.tipo || set.weight !== planned.weight || set.reps !== planned.reps
        || set.durationSeconds !== planned.durationSeconds || set.loadBasis !== planned.loadBasis || set.dropGroupId !== planned.dropGroupId
        || set.backoffGroupId !== planned.backoffGroupId || set.effortTarget?.kind !== planned.effortTarget?.kind
        || set.effortTarget?.value !== planned.effortTarget?.value || captured.plan.type !== set.tipo
        || captured.plan.backoffGroupId !== set.backoffGroupId) continue;
      const { result } = captured;
      const value = result.performance;
      if (!result.performed || result.setId !== captured.plan.id || !value || value.mode !== exercise.loadMode
        || value.unit !== exercise.loadUnit || !isValidPerformance(value)) continue;
      const load = value.mode === 'external-load' ? value.load : value.mode === 'bodyweight' ? value.bodyweight : value.assistance;
      seed.values[`${exercise.id}-${set.id}`] = { weight: String(load), reps: String(value.reps), ...(value.durationSeconds !== undefined ? { durationSeconds: String(value.durationSeconds) } : {}) };
      seed.previous[`${exercise.id}-${set.id}`] = { weight: load, reps: value.reps, ...(value.durationSeconds !== undefined ? { durationSeconds: value.durationSeconds } : {}), unit: value.unit, actualEffort: readActualEffort(result.actualEffort), attemptId: source.attempt.id, completedAt: source.attempt.completedAt };
      // Keep the planned target; previous actual effort is only a reference.
      carried = true;
    }
  }
  if (carried && Number.isInteger(source.attempt.restTimerSeconds) && source.attempt.restTimerSeconds > 0) {
    seed.restTimerSeconds = source.attempt.restTimerSeconds;
  }
  return seed;
}
