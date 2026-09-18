# Proposal: Social Identity and Graph — Release 1 Phase 1

## Intent

Replace fixed local aliases with Supabase Auth UID identity and a secure social graph, so members can be discovered and form durable relationships without trusting client-side mutations.

## Scope

### In Scope
- Supabase Auth session, UID-keyed profiles, aliases, and one-time legacy alias-to-UID local-data migration.
- Public-by-default profile categories with per-category visibility controls.
- Indexed randomized public directory and normalized alias-prefix search with cursors.
- Request lifecycle; one Partner and many Bros; atomic Partner replacement/demotion; durable directed blocking.
- Supabase Postgres schema and functions, Row Level Security (RLS), Edge Function graph commands, Realtime, and SQL cursor discovery/search.
- Versioned forward-only SQL migrations and a Supabase Free operational policy for the beta.

### Out of Scope
- Content sharing, feed, joint workouts, duels, economy, messaging, and notifications.
- Formal native review, verification, or archive closure until review tooling is repaired.

## Capabilities

### New Capabilities
- `social-identity`: Supabase UID identity, profiles, aliases, category privacy, discovery, and alias search.
- `relationship-graph`: Postgres- and Edge-Function-authoritative requests, Partner/Bro relationships, replacement, and blocks.

### Modified Capabilities
None; `openspec/specs/` has no existing capability specifications.

## Approach

Use Supabase Auth with React Native session persistence and separate public Postgres projections. Edge Functions verify the caller and invoke trusted SQL functions that transact on canonical relationship pairs: acceptance cancels conflicts, demotes prior Partners to Bros, and establishes reciprocal Partner state. Blocks cancel pending access and deny future graph actions. RLS permits only eligible reads and denies direct client graph writes; SQL functions provide cursor-based discovery/search, and Realtime publishes only RLS-authorized social state.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `context/AuthContext.tsx`, `utils/storage.ts`, `types/index.ts` | Modified | UID session and legacy ownership migration. |
| `supabase/migrations/`, `supabase/functions/` | New | Versioned schema, RLS, trusted SQL, and Edge Function commands. |
| `services/`, `context/SocialContext.tsx` | New/Modified | Supabase client boundary, auth session, RPC/Edge Function calls, and Realtime subscriptions. |
| `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/social/` | Modified/New | Session gate and social entry surfaces. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Alias migration or graph race loses access | Med | Idempotent migration, transactions, tests, and rollback marker. |
| Profile or graph data leaks | Med | Public projections, RLS, backend-only mutations, and scoped Realtime reads. |
| Free beta pauses or exceeds quotas | Med | Treat as beta-only; monitor activity and usage, and define a paid-plan decision before production. |

## Rollback Plan

Disable social routes and Edge Function commands, apply a compensating data-preserving SQL migration if needed, retain UID/profile and relationship history, and use the migration marker to restore legacy local-key access without deleting data.

## Dependencies

- Supabase Free project with Auth, Postgres, RLS, Realtime, and Edge Functions enabled.
- Beta-only operations: Free projects pause after one week of inactivity; current Free quotas and no automated backups require activity/usage monitoring and recovery/runbook planning before production.

## Success Criteria

- [ ] Authenticated users retain migrated local data under their UID.
- [ ] Directory/search honor privacy, pagination, and blocks.
- [ ] Concurrent Partner replacement and blocking preserve graph invariants.
- [ ] Direct client database writes cannot create or mutate graph state; RLS and trusted commands enforce access.
- [ ] The plan defines forward-only SQL migrations, compensating rollback, RLS-scoped Realtime, and Supabase Free beta constraints.
- [ ] Work is planned as a maintainer-approved single PR within the 800-line review budget.
