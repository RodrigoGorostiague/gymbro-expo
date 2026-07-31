import { ActiveWorkoutDraft } from '../types';

export const ACTIVE_WORKOUT_EXPIRY_MS = 5 * 60 * 60 * 1000;

export type ActiveWorkoutTiming = {
  draft: ActiveWorkoutDraft | null;
  elapsedSeconds: number;
  restRemainingSeconds: number;
  isResting: boolean;
  cleanup: 'none' | 'clear-rest' | 'remove-draft';
};

export function reconcileActiveWorkoutTiming(
  draft: ActiveWorkoutDraft,
  nowMs: number,
): ActiveWorkoutTiming {
  if (nowMs >= draft.startedAtMs + ACTIVE_WORKOUT_EXPIRY_MS) {
    return { draft: null, elapsedSeconds: 0, restRemainingSeconds: 0, isResting: false, cleanup: 'remove-draft' };
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - draft.startedAtMs) / 1000));
  if (!draft.restEndsAtMs || draft.restEndsAtMs > nowMs) {
    const restRemainingSeconds = draft.restEndsAtMs ? Math.ceil((draft.restEndsAtMs - nowMs) / 1000) : 0;
    return { draft, elapsedSeconds, restRemainingSeconds, isResting: restRemainingSeconds > 0, cleanup: 'none' };
  }

  const { restEndsAtMs: _restEndsAtMs, ...clearedDraft } = draft;
  return { draft: clearedDraft, elapsedSeconds, restRemainingSeconds: 0, isResting: false, cleanup: 'clear-rest' };
}
