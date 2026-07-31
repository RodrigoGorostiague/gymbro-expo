# Tasks: Complete Workout Reliability Fixes

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 700–950 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | One approved `size:exception` PR; 12 original plus interrupted WU-07R and two remaining corrective units ≤200 lines each |
| Delivery strategy / chain | exception-ok / size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Internal Work Units

| ID | Scope / cap | Focused test command | Runtime scenario | Rollback boundary |
|---|---|---|---|---|
| WU-01 | `utils/mesocycles.ts` + test; ≤100 | M | Routine/Rest/empty date | Utility/test |
| WU-02 | `app/mesocycle/create.tsx` + test; ≤160 | M | Create routine/Rest | Screen/test |
| WU-03 | `app/mesocycle/[id].tsx` + test; ≤160 | M | Edit selection/date | Screen/test |
| WU-04 | `utils/storage.ts` + test; ≤100 | C | Rename/reload | Mutation/test |
| WU-05 | types/storage + test; ≤190 | S | Invalid draft ignored | Schema/storage/test |
| WU-06 | `context/DataContext.tsx` + test; ≤190 | S | Switch/cancel owner | Context/test |
| WU-07 | execute screen + test; ≤190 | E | Restart/foreground | Screen/test |
| WU-07R | **Interrupted partial:** central lifecycle + execute wiring already applied; do not mark complete | Existing: `npx tsc --noEmit`, S (5), workout-runtime (1) | Attempt 10 interrupted | Existing partial only |
| WU-07R-A | Training/routine-detail Continue routing + parallel-start guard; ≤180 | R | Training/routine detail: Continue/reject second start | `app/(tabs)/routines/index.tsx`, `app/routine/[id].tsx`, re-entry test |
| WU-07R-B | mesocycle lineage-safe active state + re-entry regression; ≤180 | R | Matching lineage resumes; mismatched lineage starts safely | `app/mesocycle/summary/[id].tsx`, re-entry test |
| WU-08 | context/storage + test; ≤200 | W | Retry/write failure | Transaction/test |
| WU-09 | `components/ExecutionFab.tsx` + test; ≤180 | E | Edge drag/reset | FAB/test |
| WU-10 | root/config; ≤120 | T | N/A—build-time | Provider/config |
| WU-11 | regression tests; ≤160 | A | Contract suite | Added tests |
| WU-12 | Android evidence; ≤40 | T | Device nav/FAB/recovery | Evidence only |

Commands: M=`npm test -- tests/mesocycleNavigation.test.ts`; C=`npm test -- tests/exerciseCatalog.test.ts`; S=`npm test -- tests/storage.test.ts`; E=`npm test -- tests/executeWorkout.test.tsx`; R=`npm test -- tests/activeWorkoutReentry.test.tsx`; W=`npm test -- tests/workoutAttempts.test.ts`; T=`npx tsc --noEmit`; A=`npm test -- tests/storage.test.ts tests/workoutAttempts.test.ts tests/mesocycleNavigation.test.ts tests/executeWorkout.test.tsx tests/exerciseCatalog.test.ts tests/activeWorkoutReentry.test.tsx`.

## Phase 1: Planning and Catalog
- [x] 1.1 **WU-01** RED/GREEN: add local-civil first-entry derivation for routine, Rest, and empty schedules in `utils/mesocycles.ts` and `tests/mesocycleNavigation.test.ts`.
- [x] 1.2 **WU-02** RED/GREEN: make `app/mesocycle/create.tsx` create first-week routine/Rest entries and derive their date; prove both selections.
- [x] 1.3 **WU-03** RED/GREEN: align `app/mesocycle/[id].tsx` selected styling/semantics and derived date with creation; prove edit persistence.
- [x] 1.4 **WU-04** RED/GREEN: preserve name-only `updateCatalogExercise` changes through `utils/storage.ts` reload in `tests/exerciseCatalog.test.ts`.

## Phase 2: Draft Recovery and Completion
- [x] 2.1 **WU-05** RED/GREEN: define `ActiveWorkoutDraft` and owner-keyed validated load/save/remove in `types/index.ts`, `utils/storage.ts`; ignore/quarantine invalid records.
- [x] 2.2 **WU-06** Manual-acceptance exception: hydrate/reset drafts by profile and owner-only cancellation through `context/DataContext.tsx`; the user explicitly waived the missing focused DataContext provider harness.
- [x] 2.3 **WU-07** RED/GREEN: restore meaningful inputs/rest and reconcile timestamps on foreground in `app/routine/execute/[id].tsx`; state no background guarantee.
- [ ] 2.4 **WU-07R** remains **interrupted partial**: central lifecycle + `app/routine/execute/[id].tsx` wiring are already applied; do not claim completion or extend this unit. Evidence: `npx tsc --noEmit` passed; `tests/storage.test.ts` (5) and workout-runtime (1) passed.
- [ ] 2.5 **WU-07R-A** RED/GREEN (≤180 lines): add `tests/activeWorkoutReentry.test.tsx` cases proving Training and `app/routine/[id].tsx` show/route Continue for the owner’s draft and reject a parallel start; implement only `app/(tabs)/routines/index.tsx` and `app/routine/[id].tsx`. Evidence: `npm test -- tests/activeWorkoutReentry.test.tsx` passes; runtime: start, leave, Continue, then attempt a second start; rollback: both entry surfaces plus these test cases.
- [ ] 2.6 **WU-07R-B** RED/GREEN (≤180 lines): add the lineage regression in `tests/activeWorkoutReentry.test.tsx`—resume only when routine and planned-session lineage match; mismatched lineage must start safely—and implement active-state routing only in `app/mesocycle/summary/[id].tsx`. Evidence: `npm test -- tests/activeWorkoutReentry.test.tsx` passes; runtime: matching lineage resumes, mismatched lineage does not; rollback: mesocycle summary routing plus lineage test cases.
- [ ] 2.7 **WU-08** RED/GREEN: serialize attempt-first idempotent completion, eligible future-default propagation, then draft removal; retain draft on conflict/write failure.

## Phase 3: Android Execution Surface
- [ ] 3.1 **WU-09** RED/GREEN: create execution-only bounded, accessible, resettable `components/ExecutionFab.tsx` and mount it from `app/routine/execute/[id].tsx`.
- [ ] 3.2 **WU-10** add `SafeAreaProvider` and SDK-56 `expo-navigation-bar` build-time policy in root/config files; typecheck.

## Phase 4: Verification
- [ ] 4.1 **WU-11** run the focused regression suite and repair only failures within its originating work unit.
- [ ] 4.2 **WU-12** rebuild and record physical Android gesture/three-button safe-area, contrast, drag/reset, recovery/cancel/retry evidence.
