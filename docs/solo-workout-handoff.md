# Continue one solo workout across clients

Supabase owns the active draft. A client may keep durable unsynchronized work, but must never replace a newer server draft silently. This foundation covers solo workouts; joint participation keeps its existing lifecycle.

## Client contract

1. Call `start_training_workout({ draft_input })` for a new solo workout. The draft requires its original `routineSnapshot`, owner, attempt ID, timestamps, completed sets, and input values.
2. Use the returned `{ status: 'started' | 'existing', draft }`, including its routine and attempt IDs. A concurrent start returns the winner instead of creating a second workout. Claiming an existing modern solo draft also enables legacy-write protection.
3. Save, cancel, or finalize with `sync_offline_workout({ expected_draft, next_draft, attempt_input })`. Preserve the exact acknowledged draft as `expected_draft`; null is not a valid expected draft.
4. On `status: 'conflict'`, retain unsynchronized local work and show the conflict. Never fall back to `save_training_state`.

Cancellation sends `next_draft: null` and `attempt_input: null`. Finalization sends the captured immutable attempt both in `next_draft.pendingFinalization.attempt` and `attempt_input`. Existing receipt handling remains authoritative and retry-safe.

Draft input keys remain `exerciseId-setId`. Final attempt result keys remain `exerciseId:setId`; these are distinct formats. Absolute rest and start timestamps are preserved, not restarted on another client.

## Mobile reconciliation

- A clean acknowledged journal adopts server progress, cancellation, or completion on load and foreground; active polling also refreshes it every 15 seconds.
- Dirty, failed-local-save, cancelled, pending-finalization, and outstanding-command journals retain their data and CAS base. A remote read is invalidated by local edits, account changes, or a new hydration generation.
- A keystroke during asynchronous storage adoption restores the prior base before processing the local edit. It is not silently rebased onto unseen server data.
- Pending synchronization is serialized without a lifetime retry limit. Transport failures back off up to two minutes; foreground permits an immediate retry. Conflicts and authorization failures require attention rather than blind retry.
- An already-open execution screen applies canonical remote revisions. If start returns another routine, it routes there and does not publish a duplicate start activity.

## Server compatibility

`training_states.workout_handoff_enabled` persists after cancellation and finalization. It prevents legacy blind same-attempt writes, null clears, and resurrection once a modern solo workout is claimed. Authenticated clients cannot invoke the renamed internal writer directly.

Legacy accounts that have not opted in retain existing solo behavior. An existing draft without a snapshot is returned untouched and is not opted in automatically. Joint starts after opt-in require real active membership, and joint identity cannot be changed through the compatibility writer. Existing joint lifecycle tests remain required.

The migration requires the already-installed offline sync migration. The separately authorized linked deployment on 2026-09-10 (Argentina time) applied `20260910190000_training_workout_handoff.sql` followed by `20260910200000_contextual_record_gems.sql` to `ieehjbpqnepcyqwxxuju`. Local handoff already existed; only gems were applied locally. Both histories match 123/123 with no pending migrations. Read-only postflight confirmed identical function definitions and permissions; this does not establish physical cross-client acceptance or a live-account reward payout. Protected backups and deployment evidence: `/home/rodaja/gymbro-ledger-backups/deploy-handoff-gems-20260911T010121Z/`. No restore rehearsal was performed; the remote data dump has the known circular `mesocycle_days` foreign-key caveat.

## Verification and rollback boundary

Run `node scripts/test-training-workout-handoff.mjs`: it clones schema only into a uniquely named local database, checks handoff/offline/joint SQL contracts in rolled-back transactions, tests two concurrent first-ever starts and CAS writes, then drops only that test database. It requires the existing local `supabase_db_gymbro` container and loopback database port 54322.

The mobile/journal work and its tests form one behavior unit; the additive migration, RPC client, and SQL harness form the atomic-start unit. Revert only this work's delta, not the unrelated preexisting offline-workout edits.

Database rollback requires quiescing upgraded clients, dropping the new public start and compatibility-writer functions, renaming `save_training_state_before_handoff` back, restoring its original execute grants, and removing the metadata column and this migration-history row. That deliberately removes handoff protections and should not be performed while clients are active. It does not require deleting workout records or resetting Supabase.
