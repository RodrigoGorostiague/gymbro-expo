# Proposal: Content-Sharing Community Feed

## Intent

Let members share a private workout recap with accepted Bro/Partner connections, without exposing local workout records or public Community activity. Legacy Firebase routine sharing is unchanged.

## Scope

### In Scope
- Create an immutable, reduced recap: routine name, completion time, duration, exercise count, available aggregate metrics, and optional length-limited caption.
- Provide server-owned create, author-delete, cursor-projected feed, and Community feed/composer/refresh/error states.
- Enforce authentication, author-only mutation, accepted Bro/Partner visibility, and either-direction block denial for reads, mutations, and Realtime invalidation.

### Out of Scope
- Community-wide/public posts, media/Storage, likes, comments, reshares, notifications, routine import, and raw sets/private notes/local IDs.
- Migrating or modifying Firebase routine sharing.
- Reopening Phase 4's manual two-account social validation.

## Capabilities

### New Capabilities
- `workout-recap-feed`: Relationship-scoped creation, deletion, and consumption of reduced immutable workout recaps.

### Modified Capabilities
None. No baseline OpenSpec capabilities exist.

## Approach

Add Supabase post storage and command/projection RPCs. Opaque keyset cursors use `(created_at DESC, id DESC)` and apply eligibility server-side. The client creates the minimal snapshot, refreshes on focus/pull-to-refresh, and treats Realtime only as invalidation—never feed data or an offline cache.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `supabase/migrations/` | New | Post model, RLS, RPCs, Realtime membership. |
| `supabase/tests/` | New | Authorization, block, deletion, cursor coverage. |
| `services/socialGraph.ts`, content service | Modified/New | Server boundary, invalidation. |
| `context/SocialContext.tsx`, `app/social/index.tsx` | Modified | Feed lifecycle, UI. |
| `types/index.ts`, history screens | Modified | Recap snapshot selection. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Privacy leak after eligibility change | Med | Server-side projection and refetch; no local filtering/cache. |
| Social foundation validation is incomplete | Med | Treat Phase 4 manual two-account validation as a release dependency. |
| Scope exceeds 800-line single-PR budget | Med | Preserve no-media and relationship-only boundaries; split only if forecast requires it. |

## Rollback Plan

Disable the feed and remove new RPCs, policies, publication membership, and data in a follow-up migration. Local sessions and legacy sharing remain untouched.

## Dependencies

- Phase 4 manual two-account validation of relationship transitions, blocks, and authorized Realtime before release.

## Success Criteria

- [ ] Only an author and current unblocked Bro/Partner connections can access a recap.
- [ ] Blocking or relationship removal removes eligibility on the next refetch; soft-deleted recaps never return.
- [ ] The recap contains only the approved immutable summary and optional caption, with no media.
- [ ] Feed pagination is server-authorized keyset pagination; refresh and retry remain usable without Realtime.
