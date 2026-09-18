# Contextual record volume and gem rewards

## Status

Implemented, independently verified, and deployed locally and to the linked server on 2026-09-10 (Argentina time). All four review lenses completed with no severe blockers. Two informational recap findings were corrected and independently validated. This does not complete roadmap Stage 3.

**Server-side record-gem rewards are active.** The linked project `ieehjbpqnepcyqwxxuju` applied `20260910190000_training_workout_handoff.sql` followed by `20260910200000_contextual_record_gems.sql`. Local handoff was already installed, so only the gem migration was applied locally. Both histories now match **123/123 migrations**, with no pending migrations; offline deployment remains intact. Read-only postflight confirmed matching function definitions, actor guards, restricted entrypoint/predecessor permissions, and the 25-gem policy. No live-account payout or physical handoff acceptance was exercised.

## Behavior

The recap adds exercise volume: the sum of performed external load × repetitions, grouped by exercise ID, captured variant and unit. It compares earlier confirmed owner history, not unrestricted all-time performance. Unknown variants, warmups, invalid/unperformed sets, duplicate set IDs, other owners, future history, first comparable marks and ties do not qualify. Existing load-at-equal-repetitions and repetitions-at-equal-load comparisons remain available.

The server awards **25 gems once per record type, exercise, variant and unit in a workout**. Several improved repetition/load partitions cannot multiply that type's award. The three types therefore award at most 75 gems per group; different groups can earn separately. Existing XP and legacy PR XP rules are unchanged.

### Comparisons are not reward receipts

- Recap comparisons derive from editable confirmed training history and reflect corrections.
- Awards derive from immutable `experience_attempts.snapshot` evidence at first finalization. A strictly earlier comparable baseline must exist. The new score must also exceed every already-confirmed eligible immutable mark, preventing backdating from rewarding an already-beaten score.
- Award evidence and amounts live in the existing idempotent wallet ledger. Editing/deleting history, replaying completion, or reopening an already-finalized attempt does not mint another award. There is no historical backfill or clawback.
- The recap reads authenticated immutable receipts separately. A missing RPC or network error is shown as unavailable, not as zero awards. Late responses from a previous recap are ignored. Unavailable owner history is distinct from an active receipt query; re-entering a query clears stale results. Award labels use the matching owner/session/exercise/variant snapshot name, or a neutral exercise label when unavailable.

An offline or out-of-order completion can display a historical comparison without earning gems if a stronger mark has already been confirmed. Corrections likewise may change the comparison without changing its past receipt. Recorded performances remain user-entered; the server calculates eligibility and payout, not physical truth. Clients supply neither trusted award counts nor trusted amounts.

## Implementation boundary

`private.contextual_record_scores` calculates compatible scores. `private.contextual_record_improvements` evaluates immutable owner history. The additive migration wraps the existing finalizer, takes its lifecycle/owner locks, preserves canonical reconciliation and existing XP, and adds uniquely keyed `contextual_record` ledger entries. Offline synchronization uses this same finalizer. The authenticated read RPC exposes only the current owner's record receipts.

The policy does not infer old variants, normalize units, change progression, create a second wallet, or award from client display state. SQL rejects duplicated set identities conservatively for all types; existing load/repetition display compatibility remains unchanged. No device or app-to-live-backend reward roundtrip is claimed.

## Verification

Baseline and incremental evidence: `/tmp/gymbro-volume-rewards-baseline-20260910/`.

- RED: `red-js.log` (volume selector missing), `red-sql.log` (reward RPC missing).
- `npx vitest run tests/personalRecords.test.ts tests/recordRewards.test.ts tests/workoutAttempts.test.ts tests/rewardWallet.test.ts`: **4 files, 97 tests passed**, `focused-final.log`. Includes real recap rendering, corrections versus immutable awards, late responses, service validation and existing wallet behavior.
- `node scripts/test-record-rewards.mjs`: **25 SQL assertions passed**, plus concurrent same-ID retry and distinct tied-attempt payout checks; `sql-final.log`. Includes offline finalization/lost acknowledgments, no backfill, edit-resistant baselines and owner/grant checks.
- `npx tsc --noEmit`: exit 0, `tsc-final.log`.
- The SQL harness clones only the local schema into a unique disposable database and drops that database in cleanup. It does not apply this migration to the shared local database or linked backend.

Final independent verification after the bounded UI correction: **105 files / 799 tests passed**, TypeScript and diff-check exit 0. Evidence: `/tmp/gymbro-volume-ui-correction-20260910/independent-full-tests.log`, `independent-tsc.log`, and `independent-diffcheck.log`. Scoped independent validation passed READ-1 (truthful availability/loading) and READ-2 (recorded-name labels); the correction changed 59 lines in two files. All 44 candidate path hashes/modes were checked before this docs-only closure; all code, tests and SQL remain frozen.

The resumed disposable-database run also passed **25 SQL assertions and both concurrency checks**, including offline retries, against the handoff schema: `/tmp/gymbro-volume-resumed-sql.log`. The test database was dropped. This is SQL execution evidence, not deployment or an app-to-live-server payout.

Physical device, airplane-mode/app-kill, and live reward roundtrip validation remain pending. The separately authorized deployment completed before this documentation closure; the test counts above remain historical evidence, not tests rerun during deployment. Fresh protected local and remote schema/data backups, hashes, apply logs and postflight evidence are in `/home/rodaja/gymbro-ledger-backups/deploy-handoff-gems-20260911T010121Z/`. Local backup TOC was validated; no restore rehearsal was performed. The remote data backup retains a known circular `mesocycle_days` foreign-key restore caveat. No source, test or SQL files changed during this closure.

## Rollback

Before deployment, restore only this unit's baseline files and remove its new paths using the manifest; preserve all preceding work. After deployment, use a separately reviewed forward migration to disable new awards and restore finalizer routing. Preserve existing ledger evidence and wallet balances: do not delete awards or reset the database as rollback. Client rollback alone does not disable server awards.
