# Design: Active Workout Timing Reconciliation Fix

## Technical Approach

Add a bounded, shared timing reconciler for `ActiveWorkoutDraft`. It will use one injected wall-clock value to derive elapsed time, active rest, and cleanup actions. `DataContext` will invoke it while loading the owner draft and expose an identity-guarded refresh method; `app/routine/execute/[id].tsx` will call that method on route focus and `AppState` `active`. This implements the three requirements in `specs/active-workout-timing-reconciliation/spec.md` without claiming background execution.

Expo SDK 56 assumptions: `useFocusEffect` runs on focus and cleans up on blur; `AppState.addEventListener('change', ...)` returns a removable subscription. Neither lifecycle signal is a timer; both request a fresh timestamp reconciliation.

## Architecture Decisions

| Decision | Options / tradeoff | Choice and rationale |
|---|---|---|
| Reconciliation authority | Screen-local timer repair is smaller, but cannot clean stale drafts during provider load and duplicates rules. | Create `utils/activeWorkoutTiming.ts` as a pure reconciler. A single timestamp calculation makes restart, focus, and foreground behavior identical and testable. |
| Expiry boundary | `>` would retain a draft at exactly five hours; a background timeout is unreliable. | Expire when `nowMs >= startedAtMs + 5 * 60 * 60 * 1000`. Reconciliation-triggered removal works after restart and requires no background loop. |
| Cleanup safety | Owner-only removal can delete a replacement draft after async work. | Require owner plus `attemptId` identity before persisting cleanup or publishing state. A late expired operation becomes a no-op when identity changed. |
| UI refresh | Intervals can drift or stop while unfocused/backgrounded. | Focus/foreground reconcile first; an interval only repaints the focused active screen and is cleared on blur/unmount. |

## Data Flow

```text
persisted owner draft / current draft
              |
              v
  reconcileActiveWorkoutTiming(draft, nowMs)
       | valid / active | rest expired | draft expired
       v                v              v
  timing projection   save cleared    identity-guarded remove
       |                deadline             |
       +-------> DataContext publish <-------+
                         |
                 execute focus / AppState active
                         v
                   elapsed + rest UI
```

The reconciler never schedules work. It returns elapsed as `max(0, floor((nowMs - startedAtMs)/1000))`; future rest as `ceil((restEndsAtMs - nowMs)/1000)`; expired rest as a draft copy without `restEndsAtMs`; and expiry as no draft. `DataContext` serializes refresh with its existing session mutation queue, reloads/compares the owner draft before destructive persistence, then publishes only if the active user and attempt still match.

## File Changes

| File | Action | Description |
|---|---|---|
| `utils/activeWorkoutTiming.ts` | Create | Pure lifetime, elapsed, and rest-deadline reconciliation contract. |
| `utils/storage.ts` | Modify | Load-time expiry/removal and conditional identity-safe cleanup helpers. |
| `context/DataContext.tsx` | Modify | Reconcile on owner load; expose serialized current-draft refresh and guarded publication. |
| `app/routine/execute/[id].tsx` | Modify | Reconcile on focus/foreground and repaint only while visible. |
| `tests/workoutRuntime.test.ts` | Modify | Deterministic reconciliation, boundary, and lifecycle tests. |
| `tests/storage.test.ts` | Modify | Persisted rest clearing, expiry, and replacement-preservation tests. |
| `tests/helpers/reactNativeStub.ts` | Modify | Register, emit, and remove observable AppState listeners. |
| `tests/helpers/expoRouterStub.ts` | Modify | Provide controllable focus-effect lifecycle seam if the runtime harness needs it. |

## Interfaces / Contracts

```ts
const ACTIVE_WORKOUT_EXPIRY_MS = 5 * 60 * 60 * 1000;

type ActiveWorkoutTiming = {
  draft: ActiveWorkoutDraft | null;
  elapsedSeconds: number;
  restRemainingSeconds: number;
  isResting: boolean;
  cleanup: 'none' | 'clear-rest' | 'remove-draft';
};

function reconcileActiveWorkoutTiming(
  draft: ActiveWorkoutDraft,
  nowMs: number,
): ActiveWorkoutTiming;
```

`DataContext` refresh accepts no caller-provided draft: it reads the current owner state, captures its `attemptId`, and rejects publication or destructive persistence if that identity no longer matches. Existing draft schema remains version 1.

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit | Elapsed clamp, future rest, expired-rest clearing, exact/pre-expiry five-hour boundaries | Call the pure reconciler with fixed `nowMs`; no fake interval needed. |
| Storage/context | Load cleanup and late expired cleanup preserving a replacement | AsyncStorage fixtures plus deferred promises and owner/attempt identity assertions. |
| Runtime integration | Route focus and AppState `active` catch up without ticks; listener/interval cleanup | Controlled focus and AppState seams in the existing React test renderer harness with fake clock/timers. |
| E2E | N/A | No E2E harness is configured; manual Android validation remains a later verification activity. |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Route focus and React Native lifecycle subscription are in-app UI lifecycle behavior.

## Migration / Rollout

No migration required. Existing version-1 drafts remain readable; the next load/focus/foreground reconciliation clears an expired rest deadline or removes an expired draft. Roll back the reconciler, context wiring, screen lifecycle hooks, and tests together.

## Open Questions

- [ ] None.
