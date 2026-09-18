import { describe, expect, test, vi } from 'vitest';
import { ACTIVE_WORKOUT_EXPIRY_MS, reconcileActiveWorkoutTiming } from '../utils/activeWorkoutTiming';
import { __emitAppState, AppState } from './helpers/reactNativeStub';

const draft = {
  version: 1 as const,
  owner: 'rodaja' as const,
  attemptId: 'attempt-1',
  routineId: 'routine-1',
  startedAtMs: 1_000,
  restTimerSeconds: 90,
  completedSets: {},
  setValues: {},
};

describe('workout timestamp recovery', () => {
  test('reconciles elapsed time from wall-clock timestamps after foregrounding', () => {
    expect(reconcileActiveWorkoutTiming(draft, 91_900).elapsedSeconds).toBe(90);
    expect(reconcileActiveWorkoutTiming(draft, 500).elapsedSeconds).toBe(0);
  });

  test('projects future rest and clears an expired deadline', () => {
    expect(reconcileActiveWorkoutTiming({ ...draft, restEndsAtMs: 21_000 }, 1_000)).toMatchObject({
      restRemainingSeconds: 20,
      isResting: true,
      cleanup: 'none',
    });
    expect(reconcileActiveWorkoutTiming({ ...draft, restEndsAtMs: 999 }, 1_000)).toMatchObject({
      draft: { ...draft },
      restRemainingSeconds: 0,
      isResting: false,
      cleanup: 'clear-rest',
    });
  });

  test('keeps an active rest countdown moving from 01:30 to 01:29 after a timing refresh', () => {
    const restDraft = { ...draft, restEndsAtMs: 91_000 };
    expect(reconcileActiveWorkoutTiming(restDraft, 1_000).restRemainingSeconds).toBe(90);
    expect(reconcileActiveWorkoutTiming(restDraft, 2_000).restRemainingSeconds).toBe(89);
  });

  test('expires exactly at five hours but retains the preceding second', () => {
    expect(reconcileActiveWorkoutTiming(draft, draft.startedAtMs + ACTIVE_WORKOUT_EXPIRY_MS)).toMatchObject({
      draft: null,
      cleanup: 'remove-draft',
    });
    expect(reconcileActiveWorkoutTiming(draft, draft.startedAtMs + ACTIVE_WORKOUT_EXPIRY_MS - 1)).toMatchObject({
      draft,
      elapsedSeconds: 17_999,
      cleanup: 'none',
    });
  });

  test('freezes elapsed and rest while paused, then excludes the pause from expiry', () => {
    const paused = { ...draft, pausedAtMs: 11_000, pausedDurationMs: 2_000, pausedRestRemainingSeconds: 30, restEndsAtMs: undefined };
    expect(reconcileActiveWorkoutTiming(paused, 31_000)).toMatchObject({ elapsedSeconds: 8, restRemainingSeconds: 30, isResting: true });
    const resumed = { ...paused, pausedAtMs: undefined, pausedDurationMs: 22_000, pausedRestRemainingSeconds: undefined, restEndsAtMs: 62_000 };
    expect(reconcileActiveWorkoutTiming(resumed, 32_000)).toMatchObject({ elapsedSeconds: 9, restRemainingSeconds: 30, isResting: true });
    expect(reconcileActiveWorkoutTiming(resumed, draft.startedAtMs + ACTIVE_WORKOUT_EXPIRY_MS + 22_000 - 1).draft).not.toBeNull();
  });

  test('emits foreground refreshes and removes lifecycle listeners', () => {
    const refreshActiveWorkoutTiming = vi.fn();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshActiveWorkoutTiming();
    });
    __emitAppState('active');
    expect(refreshActiveWorkoutTiming).toHaveBeenCalledTimes(1);
    subscription.remove();
    __emitAppState('active');
    expect(refreshActiveWorkoutTiming).toHaveBeenCalledTimes(1);
    expect(AppState.addEventListener).toHaveBeenCalled();
  });
});
