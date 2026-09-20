import type { Routine, WorkoutAttempt } from '../types';
import { prepareRoutineSave, seedRoutineDraft } from './routineEditor';
import { calculateCompletion } from './workoutAttempts';

export interface GuidancePreferences {
  schemaVersion: 1;
  invitation: 'unseen' | 'accepted' | 'dismissed';
  dismissedTopicIds: string[];
  selectedRoutineId: string | null;
  reviewedResultId: string | null;
  mesocycleTopicAcknowledged: boolean;
}
export const newGuidancePreferences = (): GuidancePreferences => ({
  schemaVersion: 1, invitation: 'unseen', dismissedTopicIds: [], selectedRoutineId: null,
  reviewedResultId: null, mesocycleTopicAcknowledged: false,
});
export function isGuidanceRoutineUsable(routine: Routine): boolean {
  try { prepareRoutineSave(seedRoutineDraft('', routine.id, routine, '', routine)); return true; }
  catch { return false; }
}
export function isGuidanceAttemptConfirmed(attempt: WorkoutAttempt, owner: string, now: number): boolean {
  const time = Date.parse(attempt.completedAt);
  return attempt.owner === owner && !!attempt.id && attempt.rewardApplication?.state === 'applied'
    && Number.isFinite(time) && time <= now && attempt.exercises.some(exercise =>
      calculateCompletion(exercise.sets.map(set => set.plan), exercise.sets.map(set => set.result)).validSets > 0);
}
export type GuidanceAction = { type: 'blocked' | 'create' | 'select' | 'complete' }
  | { type: 'edit' | 'train' | 'recap'; id: string };
export function selectFunctionalGuidance(input: {
  owner: string | null; ready: boolean; busy: boolean; preferences: GuidancePreferences;
  routines: readonly Routine[]; attempts: readonly WorkoutAttempt[]; sessionIds: readonly string[]; now?: number;
}) {
  const { owner, ready, busy, preferences, routines } = input;
  const confirmed = owner && ready ? input.attempts.filter(a => isGuidanceAttemptConfirmed(a, owner, input.now ?? Date.now())) : [];
  const usable = ready ? routines.filter(isGuidanceRoutineUsable) : [];
  const recorded = confirmed.length > 0;
  const reviewed = confirmed.some(a => a.id === preferences.reviewedResultId);
  const visible = ready && !!owner && !busy && !reviewed && preferences.invitation !== 'dismissed'
    && (preferences.invitation === 'accepted' || !recorded);
  let next: GuidanceAction = { type: 'blocked' };
  if (ready && owner && !busy) {
    const result = confirmed.filter(a => input.sessionIds.includes(a.id)).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))[0];
    const selected = routines.find(r => r.id === preferences.selectedRoutineId);
    if (reviewed) next = { type: 'complete' };
    else if (result) next = { type: 'recap', id: result.id };
    else if (recorded) next = { type: 'blocked' }; // Wait for the confirmed recap to hydrate.
    else if (selected) next = { type: isGuidanceRoutineUsable(selected) ? 'train' : 'edit', id: selected.id };
    else if (usable.length === 1) next = { type: 'train', id: usable[0].id };
    else if (usable.length > 1 || routines.length > 1) next = { type: 'select' };
    else if (routines.length === 1) next = { type: 'edit', id: routines[0].id };
    else next = { type: 'create' };
  }
  return { visible, prepared: usable.length > 0, recorded, reviewed, next };
}
