# Apply Progress: Complete Workout Reliability Fixes

## WU-01 — First-entry date derivation

- [x] 1.1 **WU-01** Added local-civil start-date derivation for routine and Rest entries; empty schedules return no date.
- RED: `npm test -- tests/mesocycleNavigation.test.ts` failed before implementation because `deriveFirstEntryStartDate` did not exist (the pre-existing current-date-dependent rest assertion also failed).
- GREEN: `npm test -- tests/mesocycleNavigation.test.ts` passed: 1 file, 10 tests.

## Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test | `npm test -- tests/mesocycleNavigation.test.ts` — exit 0; 1 file, 10 tests passed. |
| Runtime harness | `npx vitest run tests/mesocycleNavigation.test.ts -t "derives a local-civil date"` — exit 0; routine, Rest, and empty scenarios passed (1 test; 9 skipped). |
| Rollback boundary | Revert `deriveFirstEntryStartDate` and its regression test in `utils/mesocycles.ts` and `tests/mesocycleNavigation.test.ts`; no later work unit behavior is removed. |

## Scope

- Delivery: approved single PR with internal bounded work units (`size:exception`).
- WU-01 changed 20 authored lines, within the 100-line cap.
- Remaining: WU-02 through WU-12.

## WU-02 — First-week schedule selection

- [x] 1.2 **WU-02** Added routine and Rest selection controls that create the first-week entry and derive its local-civil start date.
- RED: `npm test -- tests/mesocycleNavigation.test.ts` failed because the creation screen had no `Programar Upper` selection control.
- GREEN: `npm test -- tests/mesocycleNavigation.test.ts` passed: 1 file, 11 tests.

## Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test | `npm test -- tests/mesocycleNavigation.test.ts` — exit 0; 1 file, 11 tests passed. |
| Runtime harness | `npx vitest run tests/mesocycleNavigation.test.ts -t "creates a first-week routine or rest entry"` — exit 0; routine and Rest creation scenarios passed (1 test; 10 skipped). |
| Rollback boundary | Revert first-week selection and date derivation integration in `app/mesocycle/create.tsx` plus its scenario in `tests/mesocycleNavigation.test.ts`. |

## Scope

- WU-02 changed 49 authored lines, within the 160-line cap.
- Remaining: WU-03 through WU-12.

## WU-03 — Edit selection and date

- [x] 1.3 **WU-03** Added selected routine semantics/styles in the editor and derives/persists the first-entry date.
- RED: editor had no accessible selected routine control.
- GREEN: `npm test -- tests/mesocycleNavigation.test.ts` passed: 1 file, 12 tests.

| Evidence | Result |
|---|---|
| Focused test | `npm test -- tests/mesocycleNavigation.test.ts` — exit 0; 1 file, 12 tests passed. |
| Runtime harness | `npx vitest run tests/mesocycleNavigation.test.ts -t "persists a selected routine"` — exit 0; edit selection/date scenario passed (1 test; 11 skipped). |
| Rollback boundary | Revert editor selection/date integration in `app/mesocycle/[id].tsx` and its test in `tests/mesocycleNavigation.test.ts`. |

- WU-03 changed within the 160-line cap; remaining: WU-04 through WU-12.

## WU-04 — Name-only catalog persistence

- [x] 1.4 **WU-04** Proved the existing catalog mutation persists a name-only edit through reload.
| Focused test | `npm test -- tests/exerciseCatalog.test.ts` — exit 0; 1 file, 17 tests passed. |
| Runtime harness | `npx vitest run tests/exerciseCatalog.test.ts -t "persists a name-only"` — exit 0; 1 test passed, 16 skipped. |
| Rollback boundary | Revert the name-only reload regression in `tests/exerciseCatalog.test.ts`; storage behavior is unchanged. |
- WU-04 remains within the 100-line cap; remaining: WU-05 through WU-12.

## WU-05 — Owner-keyed active drafts
- [x] Added validated owner-keyed draft load/save/remove; malformed or wrong-owner records are removed.
| Focused test | `npm test -- tests/storage.test.ts` — exit 0; 1 file, 5 tests passed. |
| Runtime harness | `npx vitest run tests/storage.test.ts -t "active workout drafts"` — exit 0; 2 tests passed, 3 skipped. |
| Rollback boundary | `types/index.ts`, `utils/storage.ts`, and `tests/storage.test.ts` draft additions. |

## WU-07 — Foreground timestamp reconciliation
- [x] Restores a matching active draft and recalculates elapsed/rest display from wall-clock timestamps on foreground; no background timer guarantee is claimed.
| Focused test | `npm test -- tests/workoutRuntime.test.ts` — exit 0; 1 file, 1 test passed. |
| Runtime harness | `npx tsc --noEmit` — exit 0. No screen harness exists; manual ADB validation remains WU-12. |
| Rollback boundary | `app/routine/execute/[id].tsx` and `tests/workoutRuntime.test.ts`. |

### Physical Android validation — waiting for operator observation

- 2026-07-30: Wi-Fi device `192.168.0.194:42575` is the single authorized ADB device. Expo Go (`host.exp.exponent/.experience.ExperienceActivity`) is foregrounded.
- Status: waiting. No UI interaction or elapsed/rest/draft observation has been fabricated or recorded.

## WU-07R — In progress: central draft lifecycle

- Added owner-validated `startActiveWorkout` and `updateActiveWorkout` operations to `DataContext`; the start operation rejects a different active attempt for the same owner and update requires the same owner/attempt identity.
- Evidence: `npx tsc --noEmit` and `npm test -- tests/storage.test.ts` both exit 0 (1 file, 5 tests).
- Not complete: execute-screen start/update persistence, Continue entry surfaces, lineage-aware mesocycle routing, and `tests/activeWorkoutReentry.test.tsx` remain required.
- Execute wiring added: start persists the owner draft, input/set/rest mutations update it, success clears only after `addAttempt`, and explicit cancellation clears then navigates back.
- Evidence after wiring: `npx tsc --noEmit` and `npm test -- tests/workoutRuntime.test.ts` both exit 0 (1 file, 1 test).
- Still incomplete: all Continue entry UI, lineage-safe mesocycle routing, and the specified re-entry regression suite.

## WU-06 — Profile draft ownership and cancellation

- [x] User-accepted manual-validation exception. Profile-scoped draft hydration, logout clearing, and owner-only cancellation are partially applied in `context/DataContext.tsx`.
| Existing automated evidence | Prior executor evidence reports `npx tsc --noEmit` and `npm test -- tests/storage.test.ts` passed. |
| Focused provider harness | Not created or run. No suitable DataContext provider harness exists; the user explicitly waived it. This is not reported as a passing test. |
| Runtime acceptance | User manually validated and explicitly accepted WU-06. |
| Rollback boundary | Revert the WU-06 draft hydration, logout clearing, and owner-only cancellation changes in `context/DataContext.tsx`; the acceptance exception is recorded in `wu-06-manual-acceptance.md`. |
