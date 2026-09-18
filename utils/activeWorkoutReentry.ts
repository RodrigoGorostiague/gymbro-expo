import { ActiveWorkoutDraft, Mesocycle, Routine, UserProfile, WorkoutLineage } from '../types';

export type WorkoutLaunchTarget = {
  owner: UserProfile | null;
  routineId: string;
  lineage?: WorkoutLineage;
};

export function matchesActiveWorkout(
  draft: ActiveWorkoutDraft | null,
  target: WorkoutLaunchTarget,
): boolean {
  if (!draft || !target.owner || draft.owner !== target.owner || draft.routineId !== target.routineId) {
    return false;
  }

  if (!target.lineage) return true;

  return draft.lineage?.mesocycleId === target.lineage.mesocycleId
    && draft.lineage.weekNumber === target.lineage.weekNumber
    && draft.lineage.plannedSessionId === target.lineage.plannedSessionId;
}

/**
 * A draft can be structurally valid while its persisted training plan was deleted.
 * Only drafts tied to a planned session need the lineage checks; older standalone
 * drafts remain resumable as long as their routine still exists.
 */
export function hasActiveWorkoutReentryIntegrity(
  draft: ActiveWorkoutDraft | null,
  routines: readonly Routine[],
  mesocycles: readonly Mesocycle[],
): boolean {
  if (draft?.pendingFinalization && draft.routineSnapshot?.id === draft.routineId
    && draft.pendingFinalization.attempt.id === draft.attemptId
    && draft.pendingFinalization.attempt.owner === draft.owner) return true;
  if (!draft || !routines.some((routine) => routine.id === draft.routineId)) return false;
  if (!draft.lineage) return true;

  const mesocycle = mesocycles.find(({ id }) => id === draft.lineage!.mesocycleId);
  const week = mesocycle?.weeks.find(({ weekNumber }) => weekNumber === draft.lineage!.weekNumber);
  const entry = week?.entries.find(({ id }) => id === draft.lineage!.plannedSessionId);
  return !!entry && 'ref' in entry && entry.ref.routineId === draft.routineId;
}
