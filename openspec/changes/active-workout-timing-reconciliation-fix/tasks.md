# Tasks: Active Workout Timing Reconciliation Fix

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 300–390 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | One PR; three autonomous work units |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Shared reconciler and safe expiry | One PR | `npm test -- tests/storage.test.ts tests/workoutRuntime.test.ts` | AsyncStorage fixture: exact expiry and replacement race | `utils/activeWorkoutTiming.ts`, `utils/storage.ts`, storage tests |
| 2 | Focus/foreground UI refresh | One PR | `npm test -- tests/workoutRuntime.test.ts` | Emit focus/AppState active without interval ticks | Context, execute route, lifecycle stubs, runtime tests |
| 3 | Physical Android proof | One PR | `npx tsc --noEmit` | `npm run android`; background, resume, refocus, restart | Verification evidence only; no production rollback |

## Phase 1: Shared Reconciliation and Expiry (Unit 1, ≤200 lines)

- [x] 1.1 RED: Add fixed-clock cases in `tests/workoutRuntime.test.ts` for 90-second elapsed clamp, 20-second future rest, expired-rest projection, and five-hour exact/pre-expiry boundaries.
- [x] 1.2 Create `utils/activeWorkoutTiming.ts` with `ACTIVE_WORKOUT_EXPIRY_MS` and pure `reconcileActiveWorkoutTiming(draft, nowMs)` returning timing values plus `none`, `clear-rest`, or `remove-draft` cleanup.
- [x] 1.3 RED: Extend `tests/storage.test.ts` for persisted expired-rest clearing, exact expiry removal, and late expired cleanup preserving a replacement attempt.
- [x] 1.4 Update `utils/storage.ts` with owner-and-`attemptId` conditional draft save/remove helpers; reconcile load-time expiry and persist rest clearing without deleting a replacement.

## Phase 2: Lifecycle and Focus Integration (Unit 2, ≤200 lines)

- [x] 2.1 RED: Add controllable focus callbacks in `tests/helpers/expoRouterStub.ts` and observable register/emit/remove AppState listeners in `tests/helpers/reactNativeStub.ts`.
- [x] 2.2 RED: In `tests/workoutRuntime.test.ts`, prove focus and AppState `active` catch up elapsed without ticks, clear expired rest once, and remove listeners/intervals on blur or unmount.
- [x] 2.3 Update `context/DataContext.tsx` to reconcile the current owner on load and expose queued refresh that reloads, identity-checks, persists cleanup, and publishes only the same owner/attempt.
- [x] 2.4 Update `app/routine/execute/[id].tsx` to refresh on `useFocusEffect` and AppState `active`; retain intervals only for focused repainting and clean both subscriptions on blur/unmount.
- [x] 2.5 Run `npm test -- tests/storage.test.ts tests/workoutRuntime.test.ts` and `npx tsc --noEmit`.
- [x] 2.6 Regression correction: do not republish a semantically unchanged timing draft; preserve the rest repaint interval across focus-effect cleanup and cover the 01:30 → 01:29 transition.
- [x] 2.7 Visual countdown correction: keep a screen-local rest deadline while persistence is pending; cover the mounted 00:03 → 00:02 transition and one completion alert.

## Phase 3: Physical Android Validation (Unit 3, no code changes)

- [x] 3.1 Run `npm run android` on a physical Android device; start a workout, background for at least 45 seconds, resume, and record timestamp-derived elapsed catch-up. User-attested passed: tab switching, background/lock recovery, Expo Go relaunch, Continue re-entry, elapsed recovery, and completed-set inputs.
- [x] 3.2 Set/await rest, background or leave the execute route past its deadline, then return; verify rest clears once and remains inactive after another focus. User-attested passed: background/lock and route re-entry recovered rest correctly; rest remained inactive after completion.
- [x] 3.3 Restart at the exact five-hour draft boundary and just before it; verify expired draft removal, retained pre-expiry draft, and no regression to workout routing. User-attested passed: Expo Go relaunch and Continue re-entry preserved expected workout routing; no regression was observed in completed-set inputs.
