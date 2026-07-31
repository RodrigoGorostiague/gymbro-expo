# Apply Progress: Active Workout Re-entry Fix

## Work Unit 1 — Shared matcher and routine Continue

- [x] 1.1 RED: added the table-driven re-entry contract. The initial focused command failed because Vitest includes only `tests/**/*.test.ts`; after using the supported `.test.ts` filename, it failed RED because `utils/activeWorkoutReentry` did not exist.
- [x] 1.2 GREEN: added `matchesActiveWorkout`, requiring the current owner and routine match and exact lineage only when a planned-session target is supplied.
- [x] 2.1 RED: added runtime-harness coverage for Training, routine detail, and routine B's normal start route.
- [x] 2.2 GREEN: Training and routine detail now expose `Continuar` only for the current owner's matching routine draft. Both preserve the existing selected-routine execute route and do not alter draft persistence.

## Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm test -- tests/activeWorkoutReentry.test.ts` — exit 0; 1 file, 8 tests passed. |
| Runtime harness command/scenario and exact result | `npx vitest run tests/activeWorkoutReentry.test.ts -t "offers Continue only"` — exit 0; runtime harness rendered Training and routine detail with draft A, pressed Continue A, then pressed Start B; 1 test passed, 7 skipped. |
| Rollback boundary | Revert `utils/activeWorkoutReentry.ts`, the Continue wiring in `app/(tabs)/routines/index.tsx` and `app/routine/[id].tsx`, and `tests/activeWorkoutReentry.test.ts`; no draft lifecycle or mesocycle behavior is removed. |

## Scope

- Native attempt: ordinal 1, generation 1, work unit `WU-01`, exact 180 changed-line cap.
- Delivery: single-PR bounded unit; no commit, push, or PR created.
- Remaining: Phase 3 lineage-safe mesocycle/execute work and final per-unit verification evidence.

## Work Unit 2 — Lineage-safe planned re-entry and restore

- [x] 3.1 RED: added runtime-harness cases for an exact planned-session continuation, a mismatched planned-session normal start route, and a mismatched execute-route setup screen.
- [x] 3.2 GREEN: mesocycle cards show `Continuar` only when owner, routine, and all planned-session lineage values match. The execute restore effect uses the same matcher, so a same-routine but lineage-mismatched route remains in setup. Finish and cancellation paths are unchanged.
- [x] 4.1: ran the focused regression suite and TypeScript typecheck.
- [ ] 4.2: physical device/emulator interaction was not exercised in this batch. Runtime-harness evidence below is passing, but the manual device validation remains pending.

## Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm test -- tests/activeWorkoutReentry.test.ts` — exit 0; 1 file, 10 tests passed. |
| Runtime harness command/scenario and exact result | `npx vitest run tests/activeWorkoutReentry.test.ts -t "continues only|keeps setup"` — exit 0; exact lineage Continue, mismatched lineage Start, and mismatched execute setup scenarios passed (2 tests; 8 skipped). |
| Rollback boundary | Revert the mesocycle Continue selection in `app/mesocycle/summary/[id].tsx`, the execute restore predicate in `app/routine/execute/[id].tsx`, the AppState test stub, and the associated tests in `tests/activeWorkoutReentry.test.ts`; WU-01 routine continuation and draft lifecycle remain intact. |

## Scope

- Native attempt: ordinal 2, generation 2, work unit `WU-02`, exact 200 changed-line cap.
- WU-01 was reset only because the user approved the next bounded unit; its passed evidence remains in the runtime ledger.
- Delivery: single-PR bounded units; no commit, push, or PR created.
- Remaining: physical device/emulator validation for task 4.2 only.
