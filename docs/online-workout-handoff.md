# Online collaborative workout handoff

Modern mobile and web clients explicitly claim an acknowledged workout before inviting or accepting a partner. Supabase remains authoritative. Collaborative editing requires connectivity; ambiguous commands remain durable and read-only after a transport failure.

## Client protocol

1. Settle every outstanding solo command through its original `sync_offline_workout` route. Require an acknowledged, non-finalizing, non-cancelled journal.
2. Persist claim intent, then call `claim_online_workout(expected_draft)`. Persist the returned canonical draft and its `transportMode: "online"` before publishing presence or sending/accepting invitations.
3. Publish `publish_workout_start_activity` with the exact attempt ID. Use existing social invitation APIs and resolve the canonical group with `resolve_joint_workout_attempt`.
4. Update through `sync_online_workout`. Persist the route on each outgoing command, not just the latest draft. Missing route on older stored commands means offline, never online.

| RPC | Result |
| --- | --- |
| `online_workout_capability()` | Authenticated integer `1` |
| `claim_online_workout(expected_draft)` | `{status:"claimed",draft}` or `{status:"conflict",draft}` |
| `sync_online_workout(expected_draft,next_draft,attempt_input=null)` | `{status:"saved",draft}` or conflict |
| Same RPC with `next_draft=null` | `{status:"saved",draft:null,cancelled:true}` |
| Same RPC with the captured finalization attempt | `{status:"saved",draft:null,finalized}`; `finalized` is the existing complete finalizer response, including `receipt` and `experience_receipt` |

A lost claim response is retryable with the identical pre-claim draft while the canonical draft differs only by the added marker. Other edits conflict. The marker is not authorization: a private per-owner, per-attempt claim ledger is required.

## Group association and merges

For a **clean** draft, use the exact acknowledged server draft as `expected_draft` even when it still contains no group or the old group. Set only `next_draft.jointWorkoutId` to the result of `resolve_joint_workout_attempt(attemptId)`. The server proves the association through the start activity and active membership; a supplied UUID alone grants nothing.

A canonical-group mismatch returns `{status:"conflict",draft,canonicalJointWorkoutId}`. Do not rewrite an outstanding command or a frozen pending finalization in response. Preserve those bytes for explicit reconciliation. Clean journals may adopt remote state; dirty journals never silently rebase.

## Completion and cancellation

- Prepare the existing durable joint publication queue **before** training finalization.
- Capture the resolved group in both draft and attempt. Persist immutable `pendingFinalization`, then send its exact attempt through online CAS.
- Only a confirmed finalization receipt makes publication ready. Publish using `finish_joint_workout_attempt`; the existing queue recovers prepared entries from matching confirmed owner/attempt/group records after restart.
- Cancellation atomically leaves the canonical group, closes that attempt's presence, clears its matching draft, and stores a tombstone.
- Terminal retries compare the entire original expected/next/attempt command and return its receipt without touching a later session. Altered terminal commands conflict.

Legacy full-state writes, first-finalization calls, offline commands and restarts cannot overwrite or resurrect claimed IDs. The revoked internal finalizer preserves the complete contextual gems, offline draft preservation, joint and XP wrapper chain. Unclaimed RPC behavior remains compatible.

## Verification and rollback boundary

Run `node scripts/test-online-workout.mjs`: it clones only the local schema into a unique disposable database, applies this migration there when absent, runs SQL regressions and concurrent clients, and drops only its own database. It never runs hosted migrations or resets local application data.

Mobile verification covers durable route selection, ambiguous claim recovery, cancellation retry, clean adoption, dirty preservation, account changes, and publication queues. Physical iOS device behavior and web UI integration remain separate validation work.

Do not delete the claim table or restore permissive legacy wrappers after real claims exist: doing so would remove tombstone protection. Disable new social entry points if rollback is needed, preserve existing claims and receipts, and plan a forward migration. Source changes can be reversed relative to the external before snapshot without reverting unrelated uncommitted work.
