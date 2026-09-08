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
  if (draft.pendingFinalization) return { draft, elapsedSeconds: draft.pendingFinalization.attempt.durationSeconds, restRemainingSeconds: 0, isResting: false, cleanup: 'none' };
  const pausedDurationMs = Math.max(0, draft.pausedDurationMs ?? 0);
  const currentPauseMs = draft.pausedAtMs ? Math.max(0, nowMs - draft.pausedAtMs) : 0;
  const effectiveNowMs = nowMs - pausedDurationMs - currentPauseMs;
  if (effectiveNowMs >= draft.startedAtMs + ACTIVE_WORKOUT_EXPIRY_MS) {
    return { draft: null, elapsedSeconds: 0, restRemainingSeconds: 0, isResting: false, cleanup: 'remove-draft' };
  }

  const elapsedSeconds = Math.max(0, Math.floor((effectiveNowMs - draft.startedAtMs) / 1000));
  if (draft.pausedAtMs) {
    return { draft, elapsedSeconds, restRemainingSeconds: Math.max(0, draft.pausedRestRemainingSeconds ?? 0), isResting: (draft.pausedRestRemainingSeconds ?? 0) > 0, cleanup: 'none' };
  }
  if (!draft.restEndsAtMs || draft.restEndsAtMs > nowMs) {
    const restRemainingSeconds = draft.restEndsAtMs ? Math.ceil((draft.restEndsAtMs - nowMs) / 1000) : 0;
    return { draft, elapsedSeconds, restRemainingSeconds, isResting: restRemainingSeconds > 0, cleanup: 'none' };
  }

  const { restEndsAtMs: _restEndsAtMs, ...clearedDraft } = draft;
  return { draft: clearedDraft, elapsedSeconds, restRemainingSeconds: 0, isResting: false, cleanup: 'clear-rest' };
}
