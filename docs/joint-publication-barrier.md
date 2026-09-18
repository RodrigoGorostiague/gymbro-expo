# Joint workouts publish after the group closes

The server stores each completed result immediately, but exposes one joint publication only after every joined member finishes, cancels, or the group reaches its 24-hour deadline. The app can close while the server waits.

## Deployment

1. Apply the existing `20260911020000_rich_joint_routine_templates.sql` migration and then `20260911120000_joint_publication_barrier.sql` in migration order. The rich-template validator is required for effort targets and backoff groups.
2. Apply `20260911120100_schedule_joint_publications.sql`. It requires `pg_cron` and fails instead of silently omitting scheduling. Enable the extension in the target database before deploying if necessary.
3. Verify the active `gymbro-joint-publications` job in `cron.job`, then inspect its successful runs in `cron.job_run_details`. The schedule runs every minute and processes up to 500 eligible groups per transaction. Monitor failures and backlog; the 24-hour deadline is processed on the next successful tick, not an exact wall-clock alarm.
4. Deploy the app after the database. New clients use the versioned `finish_joint_workout_attempt_with_status` RPC; old clients retain their existing endpoint.

No deployment or production repair was performed during implementation. The migration repairs one bounded batch; the scheduled job drains the remaining backlog.

## Behavior

| Situation | Result |
|---|---|
| First member finishes | Immutable result saved; publication waits while any joined member is active. |
| Last member finishes or cancels | The shared finalizer creates one post, including joined cancelled members. |
| All members cancel | One joint post retains the actual roster and cancellation state. |
| 24 hours since group creation | Active members become expired; the group publishes even with every app closed. |
| Late queued result after expiry | The expired member's result enriches the existing post, without a duplicate. Explicit cancellations are not revived. |
| Lost acknowledgement or missing post | A repeated finish repairs publication; stored completed results are not replaced. |
| Invitation never accepted | Not included in the published roster. |
| Merge after a member becomes terminal | Rejected atomically; completed members cannot be stranded in another group. |
| Merge before completion | Retains the oldest creation time, so merging cannot reset the deadline. |
| Legacy premature post | Hidden while the group is active; retained rather than deleting existing interactions. |

Recorded active duration is independent of the 24-hour group deadline. The old five-hour rejection is removed; the shared representation uses nonnegative PostgreSQL integer seconds. Privacy rules remain unchanged: group members can inspect their shared group, while connection access does not reveal private results.

## Client recovery

The owner-scoped queue still prepares the publication before finalizing the canonical training attempt. A prepared command cannot publish until its corresponding attempt is saved. Server acknowledgement of `waiting` does **not** remove the command. Waiting state and retry errors survive restart and appear in Community; published commands leave the queue. Per-request timeouts release the queue for subsequent retries, and the server idempotency key protects ambiguous responses.

Feed sections render as each response arrives, with a 10-second per-section deadline and timer cleanup on refresh/account change/unmount: a recap endpoint failure no longer suppresses successfully loaded joint posts. A successful detail refresh clears previous errors.

## Verification and rollback

- `node scripts/test-joint-publication-barrier.mjs` clones only local schema into a uniquely named disposable database. It tests SQL regressions, concurrent finalizers, expiry, cancellation, membership freeze, authorization, and missing-post recovery, then drops only that database.
- `npx vitest run tests/joint*.test.ts tests/socialScreen.test.ts tests/activeWorkoutReentry.test.ts` covers queue persistence and UI regressions.
- `npx tsc --noEmit` checks the app types.
- The actual scheduled execution must be verified in the deployed database; the disposable harness invokes the job's function, not the production scheduler.

Rollback boundary: revert the joint publication client/service/UI/test changes and the two new migration definitions as one feature unit. On an already migrated database, use a reviewed forward repair; do not delete completed results, posts, or historical migrations. Disabling the cron job stops automatic expiry, so do not do that without an operational replacement. No commits, existing native lifecycle ledgers, or unrelated workout features were changed by this work.
