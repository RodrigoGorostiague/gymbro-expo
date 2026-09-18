# Apply Progress: Content-Sharing Community Feed

## Status

Blocked before implementation. No planned task is complete and no source, test, migration, or release artifact was changed by this apply attempt.

## Native Attempt Outcome

- Attempt: `single-pr-size-exception` / ordinal `1`
- Objective generation: `1`
- Outcome: `failed`
- Binding revision: `sha256:4a47e7eff03a4cb1d41bd53e8275f5ca3988306eadb40a785e28726f5ee5cb72`
- Evidence revision: `sha256:0797d03df3bbf0e8a2df25f4353e2b2f98ea9689832c458419c5e4dfce8c75ba`
- Dispatcher limits: `max_attempts=2`, `max_changed_lines=200`
- Blocker: The native attempt budget is incompatible with the approved 900–1,150-line single-PR `size:exception` scope. It must be reissued with a binding changed-line limit that covers the approved work before implementation can safely begin.

## Work Unit Evidence

| Work unit | Focused test command and exact result | Runtime harness command/scenario and exact result | Rollback boundary |
|---|---|---|---|
| Secure recap schema/RPCs | Not run — native budget conflict occurred before implementation. | Not run — no runtime-bearing code was started. | None; no files were changed by this attempt. |
| Typed feed boundary and invalidation | Not run — native budget conflict occurred before implementation. | Not run — no runtime-bearing code was started. | None; no files were changed by this attempt. |
| Community composer and release proof | Not run — native budget conflict occurred before implementation. | Not run — no runtime-bearing code was started. | None; no files were changed by this attempt. |

## Task State

- [ ] 1.1–1.3 Secure Recap Contract
- [ ] 2.1–2.3 Client Boundary and Lifecycle
- [ ] 3.1–3.3 Community Experience
- [ ] 4.1 Manual two-account release validation (remains a release dependency)
- [ ] 4.2 Enablement verification and rollback rehearsal

## Delivery

- Maintainer authorization: approved single PR `size:exception`.
- No commit, push, PR, archive, deployment, or formal review was performed.

## Resumption: 2026-08-08

The historical native attempt remains blocked and untouched. Normal scoped implementation resumed outside that runtime.

- Reconciled the recap contract with the approved MVP: normalized performed sets, import-safe templates, reactions, and comments remain in scope; local identifiers, private notes, media, and editable posts remain prohibited.
- Updated `supabase/tests/workout_recap_feed.sql` fixtures and assertions to require approved performed sets and reject local set identifiers.
- Corrected the current Supabase CLI invocation: `npx supabase test db --local supabase/tests/workout_recap_feed.sql`.
- Focused recap contract result: PASS, 37 tests, on the local Supabase stack.
- Focused engagement authorization result: PASS, 24 tests. It verifies publication and policy presence plus read/reaction/comment denial for unrelated, blocked, and removed members.
- Remaining before release: run the broader automated gates and record the two-account manual validation of relationship changes, blocks, recap engagement, and authorized Realtime invalidation.
