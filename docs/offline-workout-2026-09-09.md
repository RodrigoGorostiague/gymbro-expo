# Recover one active solo workout without connectivity

This slice keeps an already-started solo workout on the same device across network loss and app restart. Sets, partially typed values, timers, the routine snapshot, cancellation and an immutable completion command are saved in an owner-scoped AsyncStorage journal. History, gems and XP remain server-authoritative.

## Activation and verification

The app checks `offline_workout_capability`. Until the additive migration is deployed, existing online paths remain available and the UI reports offline storage unavailable. A pending journal **never** falls back to the legacy unconditional draft RPC.

**Deployment completed on 2026-09-10:** the authorized additive migration `20260909230000_offline_workout_sync.sql` was applied locally first, then to linked project `ieehjbpqnepcyqwxxuju`. Both migration histories contain 121/121 entries with none pending; the linked dry run reports up to date. Four function definitions match and grants were checked. This supersedes the original local-only activation status, not the physical-device verification boundary.

Protected deployment evidence: `/home/rodaja/gymbro-ledger-backups/deploy-offline-20260910/execution-result.json` and `backup-manifest.json`. Backup directory/files retain 0700/0600 permissions. The remote backup has an existing circular-foreign-key restore caveat; no restoration rehearsal was performed. No credentials or backup data are reproduced here.

Run `node scripts/test-offline-workout.mjs` for SQL and concurrent CAS checks. It clones schema only from the explicitly named local Docker container to a unique database, applies only the new migration there, rolls back fixture assertions, and drops that database in `finally`. It does not read linked remote credentials, reset existing databases, or replay historical clean-slate migrations.

## Final validation — 2026-09-09

The independent scoped validator confirmed all five admitted blockers resolved after one bounded correction: **136 added/deleted lines in nine existing paths**. The correction preserves the exact outstanding command across lost acknowledgments and newer edits, keeps local-save failure independent from transport acknowledgment, safely routes cancellation tombstones, rechecks account ownership after cancellation writes, and rejects remotely associated cancellation under the server lock.

- **103 test files / 713 tests passed**: `/tmp/gymbro-offline-fix-validator-tests.log`.
- **TypeScript and diff checks passed**: `/tmp/gymbro-offline-fix-validator-tsc.log`, `/tmp/gymbro-offline-fix-validator-diff.log`.
- **19 SQL assertions and concurrent CAS passed**, using a real disposable local schema-only database which was dropped: `/tmp/gymbro-offline-fix-validator-sql.log`.
- Independent lost-acknowledgment and owner-switch reproductions passed: `/tmp/gymbro-offline-fix-validator-repro.log`, `/tmp/gymbro-offline-fix-validator-owner-repro.log`. The original failing traces remain in `/tmp/gymbro-offline-independent-repro.log` and `/tmp/gymbro-offline-independent-owner-repro.log`.
- Correction mapping, diff and immutable candidate manifests: `/tmp/gymbro-offline-correction-20260909/fix-artifact.json`, `/tmp/gymbro-offline-correction-20260909/correction.diff`, `/tmp/gymbro-offline-correction-20260909/candidate-after-fix.json`.

**Still pending:** physical airplane-mode / app-kill / reopen / reconnect testing. Remote activation is complete as recorded above. Automated evidence does not certify device behavior or close the entire offline roadmap scope.

## Boundaries

| Boundary | Behavior |
| --- | --- |
| Local durability | Each accepted edit writes immediately, including typing without blur. The UI distinguishes writes in progress and storage failure. A failed write rejects; the last durable record remains recoverable. |
| Remote synchronization | Full expected-draft comparison under the training row lock; a lost response can acknowledge an already-applied identical draft. An acknowledgment advances only its captured local sequence. |
| Completion | The exact captured attempt ID/payload survives ambiguous failures. Existing server reward/XP receipts supply the only confirmed result. The finalizer preserves a different active draft. |
| Cancellation | A durable cancellation command clears only the expected remote draft. A new workout remains blocked until cancellation is confirmed. |
| Conflict / rejection | Keep local data, show the blocking reason, stop automatic retries. Manual retry does not force an overwrite or merge. No conflict-resolution editor is included. |
| Identity | Offline startup requires a genuine Supabase stored session and a matching previously confirmed owner. Missing/expired sessions that cannot be restored require online authentication; a remembered owner alone cannot log in. Logout removes the confirmation marker, not pending workout data. |
| Recovery | Snapshot-based reentry bypasses unloaded library and shop-overlay gates. Library mutations still require hydrated collection revisions. Five-hour-old work requires explicit resume and is not silently deleted. |
| Reconnect | Three active-app attempts at 15-second intervals, renewed on foreground, plus manual retry. No background execution guarantee; after retry exhaustion the user must retry or foreground the app. |

Offline mode does not start new workouts without a connection, make the general library available offline, or support collaborative workouts. A journal-owned solo session cannot invite participants. If another device associates it with a group or changes/deletes its active draft, synchronization stops without overwriting. New group sessions continue through the existing online entry points.

## Review and rollback

Review journal persistence and its tests first, the additive SQL boundary and isolated harness second, then provider/auth/route integration and runtime tests. These form three coherent work units with their own behavior tests; no commits have been created.

Roll back client activation independently of server reward logic. Preserve the owner-scoped journal keys (`gymbro:offline-workout:v1:<owner>`); never delete pending journals as a rollback or logout shortcut. Existing online finalization remains compatible with the additive server wrapper. Removing deployed SQL requires a separately reviewed migration, not rerunning historical reset scripts.
