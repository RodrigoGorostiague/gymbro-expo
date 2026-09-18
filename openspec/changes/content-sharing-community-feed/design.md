# Design: Content-Sharing Community Feed

## Technical Approach

Add a Supabase-owned, no-media `workout_recaps` model and RPC command/projection boundary. The Expo client derives an approved immutable recap from an existing local `WorkoutSession`: normalized exercises and performed sets are allowed, while private notes, local IDs, and media are not. Optional templates are separately validated as import-safe payloads. Community renders only the server-authorized feed projection and refetches it on focus, refresh, retry, or authorized Realtime invalidation.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Persistence boundary | SQL table plus `create_workout_recap`, `delete_workout_recap`, and `list_workout_recaps` RPCs | Direct client table CRUD; Edge Function | Matches existing server-owned social projections and keeps validation/eligibility out of the client. |
| Audience | Author plus current accepted `bro`/`partner`, excluding either-direction blocks | Public feed; cached recipient list | Eligibility is evaluated per command/page from `relationships` and `blocks`, so changes take effect on refetch. |
| Snapshot | Immutable approved fields, normalized performed sets, and optional import-safe templates | Raw `WorkoutSession`; editable post | Preserves useful training context without local identifiers or private data, and removes edit semantics. |
| Pagination | Opaque base64 cursor for `(created_at DESC, id DESC)` | Offset; client filtering | Stable, duplicate-free server-authorized ordering consistent with existing RPC cursors. |
| Realtime | RLS-authorized Postgres Changes as invalidation only | Payload rendering; offline cache | Preserves the existing `SocialContext` revision pattern without trusting event contents. |

## Data Flow

```
WorkoutSession (AsyncStorage)
  -> recap mapper (approved aggregates only)
  -> create_workout_recap RPC
  -> workout_recaps
  -> list_workout_recaps RPC -> Community feed

relationships / blocks / recap change -> authorized Realtime -> revision -> refetch RPC
```

The migration validates an exact recap shape, caption length, ownership, and immutable insert-only content; rejects disallowed keys. It exposes only a projection (`id`, author alias, approved summary, caption, `created_at`) after `require_actor`, active Bro/Partner, and `not is_blocked_pair` checks. Delete is a soft delete by the author; no update/edit RPC exists. Base-table policies and publication authorization must apply the same viewer predicate so an ineligible or blocked subscriber receives neither data nor invalidation.

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/20260801000000_workout_recap_feed.sql` | Create | Table, constraints/index, protected RPCs, RLS, and Realtime publication membership. |
| `supabase/tests/workout_recap_feed.sql` | Create | pgTAP authorization, schema rejection, deletion, block/relationship, cursor, and anonymous tests. |
| `services/workoutRecapFeed.ts` | Create | Typed RPC adapter, recap/page mapping, and authorized invalidation subscription. |
| `context/SocialContext.tsx` | Modify | Expose feed commands and increment the existing revision on recap invalidation with cleanup. |
| `types/index.ts` | Modify | Define reduced recap input/projection types only; retain `WorkoutSession` unchanged. |
| `app/social/index.tsx` | Modify | Add composer from a selected completed session plus loading/empty/retry/refresh/pagination/delete UI. |
| `tests/socialGraph.test.ts` | Modify | Cover context subscription cleanup/revision behavior. |
| `tests/workoutRecapFeed.test.ts` | Create | RPC argument mapping, allowed-field mapper, cursor pagination, and invalidation-only client tests. |

## Interfaces / Contracts

```ts
type WorkoutRecapInput = {
  routineName: string; completedAt: string; durationSeconds: number;
  exerciseCount: number; metrics: Record<string, number>; caption?: string;
};
type WorkoutRecapPage = { recaps: WorkoutRecap[]; nextCursor: string | null };
```

`list_workout_recaps(cursor, page_size)` clamps 1–50, orders `created_at DESC, id DESC`, returns `page_size + 1`, and safely rejects malformed cursors without data. `create_workout_recap(input)` and `delete_workout_recap(id)` authenticate and re-evaluate block status; deletion returns no deleted recap.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| SQL | All spec scenarios, including RED cases | pgTAP actors for unauthenticated/non-connection/blocked/non-author, forbidden fields, relationship removal, soft delete, ordering/cursor/invalid cursor, and Realtime RLS eligibility. |
| Unit | Mapper and service boundary | Vitest: reduced field allowlist, no session leakage, RPC names/args, cursor mapping, failures. |
| Integration | Community lifecycle | React renderer: loading/empty/error/retry/refresh, next-page dedupe, and Realtime revision causes refetch without event rendering. |
| Manual release | Two-account social validation | Verify accepted Bro and Partner visibility, both block directions, relationship removal, author deletion, and authorized Realtime; release remains blocked until recorded. |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

Forward-only migration creates isolated feed data and does not touch Firebase or local sessions. Roll out behind a bounded Community feed availability flag/configuration: deploy schema/RPC/policies/publication first, ship the client disabled, enable for internal two-account validation, then enable generally only after it passes. Roll back by disabling the client surface first, then applying a compensating migration to revoke RPCs/remove publication membership and policies; retain rows for recovery rather than destructive deletion.

## Open Questions

- [ ] None blocking design. Manual two-account social validation is an outstanding release dependency.
