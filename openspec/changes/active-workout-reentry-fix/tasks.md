# Tasks: Active Workout Re-entry Fix

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 260–360 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Two autonomous ≤200-line work-unit commits; one PR if aggregate remains under 400 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

Fresh-change boundary: create new work units only; do not reset, reopen, or complete the interrupted `complete-workout-reliability-fixes` WU-07R ledger.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Shared matcher plus Training/detail Continue | Commit 1, ≤180 lines | `npm test -- tests/activeWorkoutReentry.test.ts` | Start A, leave, Continue A; open B and start B | Helper, two routine entry surfaces, their tests |
| 2 | Lineage-safe mesocycle and execute restore gate | Commit 2, ≤200 lines | `npm test -- tests/activeWorkoutReentry.test.ts` | Resume exact card; open same routine/different card and remain in setup | Summary/execute routing and lineage tests |

## Phase 1: Re-entry Contract

- [x] 1.1 RED: create `tests/activeWorkoutReentry.test.ts` table cases for routine match, owner/routine mismatch, absent lineage, and each unequal lineage field returning false.
- [x] 1.2 GREEN: create `utils/activeWorkoutReentry.ts` with `WorkoutLaunchTarget` and `matchesActiveWorkout`; require exact lineage only for planned-session targets.

## Phase 2: Routine Continue Surfaces

- [x] 2.1 RED: add runtimeHarness tests proving `app/(tabs)/routines/index.tsx` and `app/routine/[id].tsx` label/route a matching owner draft as Continue, while routine B retains its normal start route.
- [x] 2.2 GREEN: wire the shared matcher into `app/(tabs)/routines/index.tsx` and `app/routine/[id].tsx`; route Continue using the draft attempt identity without changing lifecycle persistence.

## Phase 3: Lineage-Safe Planned Re-entry

- [x] 3.1 RED: add summary and execute runtimeHarness cases in `tests/activeWorkoutReentry.test.ts`: exact lineage continues with all three route params; missing or mismatched lineage starts selected context and execute remains setup.
- [x] 3.2 GREEN: update `app/mesocycle/summary/[id].tsx` and `app/routine/execute/[id].tsx` to use the matcher for CTA selection and defensive restore; preserve existing finish/cancel behavior.

## Phase 4: Verification

- [x] 4.1 Run `npm test -- tests/activeWorkoutReentry.test.ts` and `npx tsc --noEmit`; record exact results with each work unit.
- [ ] 4.2 Manually run both harness scenarios above; if unavailable, record the device/emulator constraint without marking runtime evidence passed.
