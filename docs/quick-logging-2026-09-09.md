# Log ordinary working sets faster

The existing **Finalizar serie** control already confirms valid prefilled values with one tap. This slice keeps that control and adds two explicit shortcuts beside unfinished sets, including focus mode. It does not add automatic completion, progression or rewards.

## Shortcuts and safeguards

| Action | Effect |
|---|---|
| Copy previous series | Copies only valid load and reps from the immediately preceding series of the same exercise. The source may already be completed; the target must remain unfinished. |
| Use load in following series | Applies only the current valid load to later unfinished eligible series of the same exercise. Reps, effort targets, prescribed loads, set types and order remain unchanged. |

Both shortcuts are limited to ordinary numbered effective sets without backoff groups. Warmups, failure sets and backoffs are excluded to avoid flattening their distinct prescriptions. An invalid/missing source, completed target or absent eligible next series disables the action; accessibility hints describe eligibility. Loads require complete nonnegative numeric input (decimal point supported); bodyweight must be positive. Previous reps must be a positive integer. Blank, partial/non-numeric and comma-decimal inputs are not copied.

Actions operate only on the current owned active draft, not another exercise or participant. Pause, pending finalization, pending joint cancellation, starting and finishing states block the new handlers, including stale callbacks. Copying changes only runtime `setValues`; completed flags, timers, history, calendar/routine snapshots and rewards are untouched.

Values are saved through the existing draft mutation path and survive normal draft reentry. Rejected saves show an explicit retry action while retaining the current on-screen edit. This is not new offline storage or a guarantee of persistence after a failed save. Measured effort capture and quick actions for specialized series remain outside scope.

## Verification and delivery boundary

- Domain RED: **6 failed / 12 passed** against a no-op baseline (`/tmp/gymbro-quick-logging-red.log`). Route RED before integration: **3 failed / 59 passed** (`/tmp/gymbro-quick-logging-route-red.log`).
- Focused command: `npx vitest run tests/quickLogging.test.ts tests/activeWorkoutReentry.test.ts tests/workoutDraft.test.ts tests/mesocycleContinuity.test.ts` — **4 files / 120 tests passed, exit 0** (`/tmp/gymbro-quick-logging-green.log`).
- `npx tsc --noEmit` passed, exit 0 (`/tmp/gymbro-quick-logging-tsc.log`); `git diff --check` passed.
- Tests exercise actual route actions with mocked draft persistence, one existing completion control, paused/stale ownership guards, save rejection/retry and reentry. Final independent results appear below; physical-device/live-backend acceptance remains unverified.

Baseline for this delta: `/tmp/gymbro-quick-logging-baseline-20260909/manifest.json` records initial bytes/hashes/modes and new paths. Earlier uncommitted mesocycle-continuity work is not part of this feature's review scope.

Rollback only this delta against that baseline: remove `utils/quickLogging.ts`, `tests/quickLogging.test.ts` and this document; reverse the quick-action route additions and appended quick-logging tests. Preserve prior continuity changes in the same route/test files. No dependencies, backend schema, deployment or stored-shape migration changed.

## Bounded retry correction

Independent review identified one introduced P2: a failed-save retry reran the copy operation, replacing a newer edit (copy 25 → edit 30 → reject → retry restored 25). Retry now saves the **latest runtime inputs**, without reapplying either transformation. It is bound to the original owner, attempt and routine; stale alerts cannot save another session, and paused/finalizing/unmounted sessions are ignored. Repeated rejection stays caught and offers another guarded persistence retry.

The actual-route reproduction failed before correction (`/tmp/gymbro-quick-retry-red.log`). After correction, `npx vitest run tests/quickLogging.test.ts tests/activeWorkoutReentry.test.ts` passed **2 files / 90 tests**, exit 0 (`/tmp/gymbro-quick-retry-green.log`); `npx tsc --noEmit` passed, exit 0 (`/tmp/gymbro-quick-retry-tsc-final.log`); `git diff --check` passed. Regression coverage includes preserving/persisting intervening edits, repeated rejection, original-session binding and late unmounted failures. The prior independent 101-file/682-test pass predates this correction and is superseded by the final results below. Physical/live-backend acceptance remains unverified.


## Final independent validation

The narrow fix validator returned **PASS**: the original external reproduction now preserves 30 after retry instead of restoring 25 (`/tmp/gymbro-quick-independent-retry-final.log`). The final full suite passed **101 files / 689 tests**, exit 0 (`/tmp/gymbro-quick-independent-tests-final.log`); TypeScript passed, exit 0 (`/tmp/gymbro-quick-independent-tsc-final.log`), and `git diff --check` passed. Reviewed scope hashes remained unchanged throughout validation. The introduced P2 is corrected; this documentation-only update does not change code/test bytes.

This supersedes pre-correction automated results, not the remaining runtime boundary: physical-device behavior and authenticated live-backend persistence are still unverified. Mocked route tests do not establish offline reliability or deployment readiness.
