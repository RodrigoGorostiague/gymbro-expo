# Continue from the last compatible mesocycle workout

New planned workouts can start with the latest compatible recorded values from an earlier occurrence in the same mesocycle. This is launch-time prefilling, not calculated progression or a rewrite of future plans.

## Behavior and boundaries

| Field | Current behavior |
|---|---|
| Load and repetitions | Seed editable runtime inputs from valid performed sets. Preserve the planned load/repetition snapshot separately. External load, bodyweight and assistance require exact mode/unit agreement; no conversion. |
| Effort | As of 2026-09-17, preserve the target of the new plan. Show the previous recorded actual RIR/RPE as a reference beside previous load/reps; never prefill today’s actual effort. |
| Rest | Use the prior positive configured rest duration as a setup default when at least one set carries. A user-edited setup value wins. Never carry elapsed time, countdown state or pauses. Zero/invalid rest retains the existing route default. |
| Structure and identity | Preserve the target exercises, set IDs/order/types, variants and backoff grouping. No propagation of additions, removals, substitutions, notes, completion flags, rewards, dates or group membership. |

Eligibility requires the active owner, same active mesocycle, same routine identity, an earlier scheduled occurrence (including calendar shifts), and a non-future completion timestamp. The most recently completed eligible attempt wins, with deterministic ID tie-breaking. Its skipped, invalid or incompatible sets stay prescribed; they do not fall back to older performances.

A set carries only when its exercise identity/variant/mode/unit and its source-slot versus target-slot prescription match. Any different target load, reps, type, backoff or effort protects the entire set, including deliberate deloads. The app cannot distinguish an explicitly re-entered identical target from an untouched target because that intent is not stored. Unknown legacy mode/unit or missing source-slot snapshots do not carry. Rebuilt/version-changed identities are intentionally outside this slice.

Existing active drafts are never seeded again: resume uses their saved inputs, prescription and timers. The normal draft and finalization contracts persist the new session, preserving existing retry/reward identity. There is no new backend command, migration or source-attribution field.

## Verification

- Domain RED: baseline selector produced **3 failed / 19 passed** before implementation (`/tmp/gymbro-continuity-red.log`).
- Route RED: before wiring, **2 failed / 78 passed** across domain and execution suites (`/tmp/gymbro-continuity-route-red.log`).
- Focused command: `npx vitest run tests/mesocycleContinuity.test.ts tests/activeWorkoutReentry.test.ts tests/workoutAttempts.test.ts tests/workoutDraft.test.ts`.
- Final focused result: **4 files / 123 tests passed, exit 0** (`/tmp/gymbro-continuity-green.log`).
- Type check: `npx tsc --noEmit` **passed, exit 0** (`/tmp/gymbro-continuity-tsc.log`). `git diff --check` passed.
- Component harness exercises actual execution-route start and resume with mocked persistence, including explicit future adjustments and edited rest. Domain coverage includes shifted schedules, partial attempts, owner/lineage isolation, compatibility, targets, history immutability and distinct reward identity.
- Independent read-only verification: **PASS**, no introduced blockers reported; `npm test` **100 files / 658 tests passed, exit 0** (`/tmp/gymbro-continuity-independent-test.log`), `npx tsc --noEmit` **passed, exit 0** (`/tmp/gymbro-continuity-independent-tsc.log`), and `git diff --check` passed.
- The verifier confirmed the five implementation/test/documentation paths stayed unchanged throughout review; initial hashes: `/tmp/gymbro-continuity-independent-before.sha256`. This later documentation-only update does not change the reviewed source/test bytes.
- Authenticated physical-device acceptance and live persistence/backend roundtrips remain **not verified**. Automated route tests use mocked persistence; no deployment or real-device validation is claimed.

## Rollback and next work

Rollback only the selector import/launch wiring in `app/routine/execute/[id].tsx`, `utils/mesocycleContinuity.ts`, corresponding tests and this note. Stored drafts/attempts use existing shapes and need no data rollback.

Measured effort capture and historical effort references are available. See `execution-mesocycle-progression-2026-09-17.md` for the execution simplification and comparable exposure summaries. Richer correspondence across changed plans, explicit override provenance and computed progression remain separate work. Continuity never predicts increases or changes historical results.
