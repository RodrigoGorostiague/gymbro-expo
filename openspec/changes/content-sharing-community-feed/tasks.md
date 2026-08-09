# Tasks: Content-Sharing Community Feed

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 900–1,150 (session budget: 800) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Schema/tests → client boundary/context → Community UI/release proof |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Secure recap schema/RPCs | PR 1 exception | `npx supabase test db --local supabase/tests/workout_recap_feed.sql` | Two local actors exercise RPCs | Migration, policies, RPCs, publication |
| 2 | Typed feed boundary and invalidation | PR 1 exception | `npm test -- tests/workoutRecapFeed.test.ts tests/socialGraph.test.ts` | Authenticated app refetch after event | Service, types, SocialContext |
| 3 | Community composer and release proof | PR 1 exception | `npm test -- tests/workoutRecapFeed.test.ts && npx tsc --noEmit` | Two-account manual script | Community UI and feature flag |

## Phase 1: Secure Recap Contract

- [ ] 1.1 RED: create `supabase/tests/workout_recap_feed.sql` cases for anonymous/non-connection/blocked/non-author denial, forbidden local IDs and private fields, immutable performed sets, import-safe templates, engagement authorization, soft delete, relationship removal, cursor ordering/invalid cursor, and Realtime RLS; run the focused pgTAP command.
- [ ] 1.2 Create `supabase/migrations/20260801000000_workout_recap_feed.sql`: immutable allowlisted table, indexes, RLS/publication, and protected create/delete/list RPCs with accepted `bro`/`partner` and either-block checks.
- [ ] 1.3 GREEN: make all pgTAP cases pass; prove list returns only the approved projection, clamps 1–50, and returns no protected data for malformed cursors.

## Phase 2: Client Boundary and Lifecycle

- [ ] 2.1 RED: add `tests/workoutRecapFeed.test.ts` for allowlisted `WorkoutSession` mapping, RPC arguments/errors, cursor pages, and payload-free invalidation; run its focused Vitest command.
- [ ] 2.2 Add reduced input/projection types in `types/index.ts` and `services/workoutRecapFeed.ts`; map aggregate-only sessions and call the three RPCs without caching event/feed payloads.
- [ ] 2.3 Extend `context/SocialContext.tsx` with feed commands and recap subscription cleanup/revision; update `tests/socialGraph.test.ts` to prove refetch invalidation and unmount cleanup.

## Phase 3: Community Experience

- [ ] 3.1 RED: extend `tests/workoutRecapFeed.test.ts` renderer cases for loading, empty, retry, refresh, deduped next page, publish/delete, and no stale protected content.
- [ ] 3.2 Modify `app/social/index.tsx` to select a completed local session, compose bounded captions, render authorized recap cards and controls, and keep the feed disabled behind its availability flag.
- [ ] 3.3 GREEN: pass focused Vitest tests and `npx tsc --noEmit`; retain no media, edit, raw set/note, local-ID, or Firebase-sharing path.

## Phase 4: Release Dependency

- [ ] 4.1 Execute and record manual two-account validation: accepted Bro and Partner visibility; both block directions; relationship removal; author delete; and authorized Realtime invalidation/refetch. Release remains blocked until it passes.
- [ ] 4.2 Before enablement, run `npm test && npx tsc --noEmit`; rollback by disabling the Community flag, then use a compensating migration to revoke feed RPC/policy/publication access while retaining rows.
