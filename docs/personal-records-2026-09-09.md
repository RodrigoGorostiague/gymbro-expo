# Explain a higher load at the same repetitions

The private session recap now compares confirmed external-load sets against earlier comparable recorded history. It displays exercise, captured variant, repetitions, unit, previous best load and the session's new best. This is a narrow Stage 3 slice, not a complete records system or an unrestricted all-time claim.

## Comparison boundary

- New attempts freeze optional exercise `variant`; older snapshots remain unchanged and are excluded when variant is unknown. Never infer it from today's routine or catalog.
- Require the active owner, an applied reward marker, valid dates no later than now, and strictly earlier history. The recap also requires ready, owner-hydrated history. Pending offline commands do not qualify.
- Match exercise ID, exact captured variant, external-load mode, unit and repetition count. Reuse `getEligiblePerformances` (no warmups, unperformed sets, mismatched set identity or invalid values). No unit conversion or estimated strength formula.
- Compare maximum load per partition, including repeated exercise occurrences. First comparable marks and ties are not improvements. Ambiguous duplicate attempt IDs are excluded rather than selecting an arbitrary version.
- Derive on every recap render: corrected or deleted history changes the comparison. No record ledger, reward change, automatic progression or persistence command is added.

## Persistence evidence

Source inspection, not a live database test: `reward_attempt_shape` and `training_state_valid_attempts` in `supabase/migrations/20260802100000_reward_wallet.sql` validate required fields without rejecting extra exercise metadata. The canonical merge in `20260802170000_training_level_progression.sql:254–258` replaces only top-level reward/completion fields; lines 333–335 store and return the preserved input. Later finalizer wrappers delegate without rebuilding exercises. The existing client parser returns the attempt unchanged. No migration is required by these inspected contracts and none was written/applied.

## Verification and rollback

- RED: the focused test failed on the missing selector module before implementation (`/tmp/gymbro-records-baseline-20260909/red.log`).
- `npm test -- tests/personalRecords.test.ts tests/workoutAttempts.test.ts tests/trainingState.test.ts`: 3 files, 65 tests passed, including actual recap rendering/correction, capture roundtrip, eligibility and owner/history guards (`focused.log` in the same directory).
- `npx tsc --noEmit` and `git diff --check`: passed. Runtime tests use mocked persistence; physical-device and live backend roundtrip remain unverified. Independent reliability review reported no introduced findings. Final full verification: `npm test` passed 104 files / 734 tests; TypeScript and diff-check exited 0. Logs: `/tmp/gymbro-records-independent-tests.log`, `/tmp/gymbro-records-independent-tsc.log`, `/tmp/gymbro-records-independent-diff.log`. The six candidate hashes/modes were stable during review and all 27 pre-existing dirty paths were preserved.
- Reviewed Expo's versioned SDK 56 reference and SDK 57 Router documentation before code; no new Expo API or dependency was introduced.

Rollback only this slice: remove the selector, its test, this note and recap integration; revert optional variant capture/type additions. Preserve all earlier continuity, quick-logging and offline changes. Existing variant metadata can remain in stored JSON and is ignored by older clients.

## Extension — more repetitions at the same load (2026-09-10)

The private recap also shows the previous best and new repetitions at exactly the same external load, exercise, known captured variant and unit. Both record types share the confirmed-owner, strictly-earlier timestamp and eligible-set filters. No load rounding, tolerance, unit conversion or cross-modality comparison is performed. Repeated compatible exercise occurrences contribute their maximum, not their sum; separate loads remain separate comparison groups. First comparable marks and ties are not records.

This remains a comparison within compatible recorded history, not an unrestricted lifetime record. Corrections are derived again on render. There is no new capture field, reward calculation, ledger, backend command or migration in this extension. Earlier load-at-equal-repetitions behavior remains available unchanged.

Verification: RED had 15 failures / 21 existing passes before production edits. Focused `npm test -- tests/personalRecords.test.ts tests/workoutAttempts.test.ts tests/trainingState.test.ts` passed 3 files / 88 tests, including the actual private recap and history correction. TypeScript and diff-check passed. Evidence and isolated baseline: `/tmp/gymbro-rep-records-baseline-20260910/`. Final independent reliability review passed without findings: 104 files / 757 tests, TypeScript and diff-check exit 0. All four candidate hashes/modes stayed stable and 29 untouched prior paths were preserved. These tests do not establish physical-device or live backend behavior.

Rollback only this extension's selector parameterization/wrapper, repetition recap card and added tests/doc section using `records-only.diff` in that baseline directory. Preserve the earlier optional variant capture and load-record feature, plus all continuity, quick-logging and offline work. Migration authorization/execution belongs to a separate work unit.


## Extension — volume and immutable record awards (2026-09-10)

A later slice adds comparable per-exercise volume and separate immutable server receipts: 25 gems per record type/exercise/variant/unit/workout, at most 75 per group. Historical comparisons still recalculate; edits and retries do not mint new awards, and no historical backfill is performed. The earlier no-reward/no-migration statements describe only their original slices, not this extension.

See [volume and award status](contextual-record-rewards-2026-09-10.md) for the complete boundary and final independent evidence: 105 files / 799 tests, TypeScript and diff-check passed; 25 SQL assertions plus concurrency passed in a disposable database. The record-gem migration is now deployed locally and to linked project `ieehjbpqnepcyqwxxuju`; server rewards are active. The linked deployment applied `20260910190000_training_workout_handoff.sql` then `20260910200000_contextual_record_gems.sql`; local handoff already existed. Both histories match 123/123 with no pending migrations. Live-account payouts and actual-device validation remain unexercised. Prior offline deployment and historical test evidence are unchanged; backup and postflight details are in the linked status document.
