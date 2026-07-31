import { ActiveWorkoutDraft, UserProfile, WorkoutLineage } from '../types';

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
