## Exploration: content-sharing-community-feed

### Current State
GymBro’s completed Supabase social foundation provides authenticated UID identity, profile visibility, relationship requests, Bro/Partner connections, directed blocks, cursor-based Community projections, and authenticated Realtime invalidation. Its manual two-account validation script remains unperformed; it is a dependency/risk, not scope to reopen.

Workout sessions are still local `AsyncStorage` records. A completed session contains a routine snapshot, completion time, duration, and completed exercise/set data. The legacy routine-share path remains Firebase-oriented and hard-codes a reciprocal partner, so it is not a safe basis for the new social feature. There is no current media upload path.

### Affected Areas
- `supabase/migrations/` — add server-owned post data, RLS, block/relationship-aware feed projections, and publication membership only if Realtime is admitted.
- `supabase/tests/` — prove cross-user, relationship, block, deletion, cursor, and storage authorization behavior.
- `services/socialGraph.ts` and a new content service — retain the current safe RPC/projection boundary rather than querying social tables directly.
- `context/SocialContext.tsx` or a focused feed context — own feed invalidation, refresh, and lifecycle cleanup.
- `app/social/index.tsx` — evolve Community from discovery/circle/requests into a relationship-safe feed entry point.
- Completed-workout/history screens and `types/index.ts` — create an explicit, minimal post snapshot from a local `WorkoutSession`; never expose the complete local record by default.
- `services/shareSync.ts`, `context/ShareContext.tsx`, `components/ShareRoutineModal.tsx` — legacy Firebase routine sharing is adjacent but remains out of this MVP unless separately migrated.

### Approaches
1. **Relationship-scoped structured workout posts (recommended)** — Publish an immutable, reduced workout summary with an optional caption; render posts only to the author and accepted Bro/Partner connections after both-direction block filtering.
   - Pros: Reuses the completed graph safely; no new permissions or public discovery leak; fits the 800-line delivery budget; avoids untrusted media and legacy Firebase sharing.
   - Cons: Does not create a globally discoverable social network; requires a deliberate post projection and local-session snapshot mapping.
   - Effort: Medium.

2. **Public Community posts with media attachments** — Make posts visible to all eligible Community members and introduce image uploads in the same phase.
   - Pros: Higher reach and richer expression.
   - Cons: Requires a product privacy decision, Supabase Storage bucket/policies, MIME/size enforcement, signed delivery, upload failure recovery, moderation/reporting workflow, and materially exceeds the bounded MVP.
   - Effort: High.

### Recommendation
Deliver a deliberately small, server-authorized MVP: a member may create one **workout recap** from a selected completed local session, consisting of an immutable summary (routine name, completion timestamp, duration, exercise count, aggregate completed-set/tonnage metrics where available) and a length-limited optional caption. Do not upload raw sets, local IDs, private notes, or media. Do not add likes, comments, reshares, routine import, or notifications.

Create posts and author deletion through authenticated commands/RPCs. Feed reads MUST be a server-owned cursor projection ordered by `(created_at DESC, id DESC)` with opaque keyset cursors; never offset-paginate or filter a broad result on-device. Each read and mutation MUST enforce: authenticated actor; author-only create/delete; post visibility only for author or currently accepted Bro/Partner; either-direction block denies discovery, read, Realtime delivery, and mutation; soft-deleted posts never reappear. A block or relationship removal MUST remove prior eligibility immediately on the next projection/refetch.

Keep media out of MVP. If adopted later, use a non-public Supabase Storage bucket with owner-prefixed object names, RLS `WITH CHECK` ownership, server-set MIME/size limits, and feed-projection-issued short-lived signed URLs—not public bucket URLs. Expo SDK 56 supports selecting a single image asset, but that capability does not justify combining an upload/moderation system with the first feed slice.

Use existing social Realtime as an invalidation precedent: subscribe only after authorization is established, consume no event payload as UI data, show “new posts available” and refetch rather than inserting into a scrolling feed, and tear down channels on unmount/background transitions. Relationship/block events also invalidate the feed. Baseline correctness remains focus refresh and pull-to-refresh; Realtime must not be a prerequisite for reading or posting.

For offline/error behavior, do not queue or cache other members’ posts because a later block or privacy change could expose revoked content. Show a retryable load error, preserve an unsent caption draft locally only for its author, and confirm publishing/deleting only after the server command succeeds. Failed media uploads are not applicable in this slice.

**Decision blocker — audience:** confirm whether a Community workout recap is visible to **accepted Bro/Partner connections only** (recommended default) or to every discoverable Community member. This changes the RLS/RPC contract and the product’s privacy promise; no other product decision blocks a proposal.

Bounded single-PR delivery sequence (target: ≤800 authored changed lines):
1. Post schema, command/projection, RLS, and focused pgTAP authorization/cursor/deletion coverage.
2. Typed client service plus invalidation lifecycle and unit coverage.
3. Community feed, recap composer from a completed session, author delete, pull-to-refresh, and explicit loading/empty/error states.

### Risks
- The unperformed manual two-account social validation remains a release dependency: validate relationship transition, blocking, and authorized Realtime before relying on the same invariants for feed visibility.
- Existing workout records are local and mutable; published data must be a reduced immutable snapshot, not a remote pointer to a local session.
- A public-audience decision or media requirement expands authorization, moderation, and review scope beyond this MVP budget.
- RLS alone is insufficient if a client can select broad posts and filter locally; projections and Realtime subscriptions must apply block and relationship eligibility server-side.

### Ready for Proposal
No — confirm the single audience decision above. With the recommended relationship-scoped audience, proceed to `sdd-propose` and retain the pending two-account validation as an explicit dependency/risk.
