# Design: Social Identity and Graph — Release 1 Phase 1

## Technical Approach

Replace the alias-only `AuthContext` with a Supabase Auth session and a UID-backed `SocialProvider`. Supabase Auth owns the authenticated UID; local persistence only retains the session needed by the mobile client. Postgres owns profiles and the graph, RLS owns read/write boundaries, Edge Functions own trusted commands, and Realtime exposes only authorized social changes. Existing sharing, messages, feeds, joint workouts, duels, and economy are not extended.

## Architecture Decisions

| Option | Tradeoff | Decision and rationale |
|---|---|---|
| Client graph writes | RLS alone cannot atomically preserve reciprocity, one Partner, replacement, and block precedence | Use Edge Functions plus trusted Postgres functions and transactions; the function verifies the JWT UID and canonicalizes pairs. |
| Query directory from app | Client filtering leaks caller-specific block/privacy state and cannot provide stable pages | Use SQL `list_directory`/`search_aliases` functions with keyset cursors; clients receive only safe rows and opaque cursor tokens. |
| Reuse `UserProfile` aliases as identity | Loses durable account identity | Introduce `UserId = string`; retain `LegacyAlias` only for migration and move ownership keys to UID. |
| Direct table access for graph commands | A client could bypass state-machine invariants | Deny client graph writes with RLS; Edge Functions call schema-local trusted SQL functions. |
| Firebase backend | Requires Firebase Auth/Firestore/Functions and does not match the beta decision | Use Supabase Free for this real-user beta only; reassess before production because Free projects pause after one week idle and have finite quotas. |
| Preserve legacy social providers | They target a hard-coded partner and open Firebase collections | Do not mount `KissProvider`, `ShareProvider`, or `ChatFab` in the authenticated tree until their separate scopes are designed; no replacement feature is added here. |

## Data Flow

```text
Supabase Auth listener -> AuthContext (uid/session) -> migrateLegacyAlias(uid)
                                                 -> DataContext loads UID keys
Social screens -> SocialProvider -> Edge Function -> trusted SQL transaction -> Postgres
                                               <- safe projection/page + opaque cursor
SocialProvider <- RLS-authorized Realtime changes <- Postgres publication
```

`profiles` holds owner settings keyed by `auth.users.id`. `public_profiles` is a trusted projection with a normalized unique alias, visible categories, `bucket`, `rank`, and search fields. `relationships` uses a canonical sorted pair key and reciprocal `partner`/`bro` state; `relationship_requests` records direction; `blocks` is directed. Trusted SQL functions lock and transact affected members. A block cancels requests/removes active relationships; Partner acceptance cancels conflicts and demotes prior Partners to Bro atomically.

Directory uses indexed `bucket`, `rank`, `uid`; alias search uses normalized prefix plus `uid`. SQL keyset cursors carry the last ordered values and are validated by the server-owned function; results exclude self, blocks, and existing/pending pairs before projection. RLS protects private tables and Realtime subscriptions; direct writes are denied except owner private-profile updates. Edge Functions verify JWTs and invoke only approved command functions. Service-role credentials remain server-only.

## File Changes

| File | Action | Description |
|---|---|---|
| `services/supabase.ts` | Create | Supabase Auth, database, Edge Function, and Realtime client boundary. |
| `context/AuthContext.tsx`, `types/index.ts`, `utils/storage.ts`, `context/DataContext.tsx` | Modify | UID session, journaled migration, UID ownership. |
| `context/SocialContext.tsx`, `services/socialGraph.ts` | Create | Edge Function, SQL discovery/search, and Realtime client boundary. |
| `supabase/migrations/*.sql` | Create | Ordered schema, indexes, RLS policies, read functions, and graph command functions. |
| `supabase/functions/social-graph/` | Create | JWT-verified trusted command entry point. |
| `app/_layout.tsx`, `app/index.tsx`, `app/(tabs)/_layout.tsx`, `app/social/*` | Modify/Create | Session gate, sign-in, Social routes. |
| `context/KissContext.tsx`, `context/ShareContext.tsx`, `components/ChatFab.tsx` | Modify | Remove hard-coded partner path; no replacement. |
| `tests/authContext.test.ts`, `tests/socialGraph.test.ts`, `tests/storageMigration.test.ts`, `tests/supabaseRls.test.ts` | Create | Future provider, command, migration, and RLS coverage; not created in this correction. |

## Interfaces / Contracts

```ts
type GraphCommand = 'sendRequest' | 'respondRequest' | 'setRelationship' | 'block' | 'unblock';
type PageCursor = { bucket?: number; rank?: number; alias?: string; uid: string };
type PublicProfile = { uid: string; alias: string; categories: Record<string, unknown> };
```

Commands accept a target UID (never caller UID), return a safe graph summary, and reject self-targets, blocks, invalid states, and unavailable targets. RLS permits owner private-profile access and approved safe reads only; clients cannot mutate projections, graph tables, push tokens, kisses, or shared routines. Legacy open Firebase collections become inaccessible pending redesign.

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit | Alias normalization, cursor validation, graph transition/block precedence | Vitest pure helpers and transaction fakes; write RED cases first. |
| Integration | Auth hydration, idempotent migration/journal recovery, trusted commands under concurrent Partner replacement | Supabase local stack with two authenticated contexts. |
| Authorization | Unauthenticated, cross-user, projection, graph, and Realtime denial | Supabase RLS and Edge Function integration coverage. |
| E2E | Session gate, discovery/search pagination, relationship actions | Manual device/emulator script; automation is not currently available. |

## Threat Matrix

| Boundary | Applicability | Design response / RED tests |
|---|---|---|
| Documentation-like paths | N/A — no executable classification | None. |
| Git repository selection | N/A — no VCS operation | None. |
| Commit state | N/A — no commit automation | None. |
| Push state | N/A — no push automation | None. |
| PR commands | N/A — no PR automation | None. |

## Migration / Rollout

On first authenticated session, select a legacy alias, copy alias-scoped records to UID keys through a journal, verify writes, then record `complete:{uid}` without deleting sources. Re-entry resumes safely. Introduce all backend changes through ordered, forward-only `supabase/migrations` files; corrections use compensating, data-preserving migrations rather than manual production edits or destructive rollback. Before enabling Social routes, apply migrations, configure RLS/Realtime, and deploy Edge Functions. Roll back by disabling routes/commands and applying a compensating migration while retaining UID data, markers, and legacy keys.

## Free Beta Operations

Supabase Free is authorized only for the real-user beta. Free projects pause after one week of inactivity and currently have finite database, egress, and active-user quotas; the beta needs an activity/recovery runbook and usage monitoring. It is not a production availability or backup commitment. A production rollout requires an explicit plan and backup/uptime decision before this constraint is removed.

## Open Questions

- [ ] Confirm the Supabase project has the selected Auth providers and beta operational owner before implementation.
- [ ] Confirm whether legacy aliases map to pre-created accounts or are selected only during each account's first migration.
