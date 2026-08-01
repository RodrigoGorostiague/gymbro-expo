# Tasks: Social Identity and Graph

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 2,000–2,700 |
| 800-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | DB/RLS → graph → identity → discovery/UI |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Schema/RLS | 1 | `supabase test db` | Local two JWTs | Migrations, compensating SQL |
| 2 | Graph commands | 2 | `supabase test db` | Function serve + JWT | Function and graph migrations |
| 3 | Auth/migration | 3 | `npx vitest run tests/authContext.test.ts tests/storageMigration.test.ts` | Expo sign-in/out | Auth, storage, types |
| 4 | Discovery/UI | 4 | `npx vitest run tests/socialGraph.test.ts tests/supabaseRls.test.ts` | Expo two-account script | Social service, context, routes |

## Phase 1: Backend Foundation

- [x] 1.1 Add `@supabase/supabase-js`, `supabase/config.toml`, `.env.example`, and `docs/supabase-beta.md`; document client/server secrets, CLI deploy, Free pause/quotas, monitoring, recovery, and compensating rollback.
- [x] 1.2 RED: add `supabase/tests/social_identity.sql` for unauthenticated/cross-user reads, hidden categories, alias collision, direct graph writes, and unauthorized Realtime-safe projections.
- [x] 1.3 Create ordered `supabase/migrations/*_social_identity.sql` for UID profiles, normalized aliases, public projection, indexes, RLS, publication, and owner profile updates.
- [x] 1.4 RED: add `supabase/tests/relationship_graph.sql` for request acceptance, invalid/self/blocked commands, Partner replacement/concurrency, block cleanup, and atomic failure.
- [x] 1.5 Create ordered graph-function migrations for canonical pairs, requests, relationships, blocks, cursor validation, `list_directory`, `search_aliases`, and trusted transactional commands.
- [x] 1.6 Create `supabase/functions/social-graph/index.ts` to require caller JWTs, reject caller UID input, invoke only approved RPCs, and return safe summaries.

## Phase 2: Auth and Data Migration

- [x] 2.1 RED: create `tests/authContext.test.ts` and `tests/storageMigration.test.ts` for session hydration, sign-out, first migration, retry, unmapped aliases, journal recovery, and source preservation.
- [x] 2.2 Update `types/index.ts`, `utils/storage.ts`, and `context/DataContext.tsx` for `UserId`, legacy aliases, UID-keyed data, journaled copy/verify/marker migration, and no source deletion.
- [x] 2.3 Create `services/supabase.ts`; update `context/AuthContext.tsx` and `app/index.tsx` for Supabase session events, AppState refresh, credential sign-in/out, and migration-before-data loading.

## Phase 3: Discovery and Graph Client

- [x] 3.1 RED: create `tests/socialGraph.test.ts` for normalized prefix pages, continuation/no duplicates, malformed cursors, self/pending/relationship/block exclusion, and safe errors.
- [x] 3.2 Create `services/socialGraph.ts` and `context/SocialContext.tsx` for RPC pages, Edge commands, authorized Realtime lifecycle, and no optimistic invariant bypass.
- [x] 3.3 Create `app/social/index.tsx` and `app/social/[uid].tsx` for profile privacy, directory/search pagination, request/relationship/block actions, and unavailable-state handling.

## Phase 4: Integration

- [x] 4.1 Update `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `context/KissContext.tsx`, `context/ShareContext.tsx`, and `components/ChatFab.tsx` to gate sessions and unmount legacy Firebase partner paths without replacement.
- [x] 4.2 RED/integration: create `tests/supabaseRls.test.ts` for protected queries/subscriptions and direct-write denial; run local migrations, function, and two-user graph scenarios.
- [x] 4.3 Validate `npx tsc --noEmit`, focused Vitest suites, and the Expo two-account script; record deployment/secrets/usage evidence only—no formal native review, verification, or archive closure.
