# Proposal: GymBro Web Platform

## Intent
Create a sibling desktop-first web application for planning and social participation through the same GymBro identity and Supabase backend. Rebuild the mobile product language in accessible DOM/CSS, not React Native UI.

## Scope

### In Scope
- Email/password registration, sign-in, recovery, profile bootstrap, and existing user/profile data.
- Advanced routine and mesocycle creation/editing in a planning-first architecture.
- Circle management, discovery, requests, feed, reactions, comments, and in-app notifications.
- Targeted private sharing with accepted contacts and copy-on-accept semantics.
- Feed publication of routines/mesocycles with private, circle, or community visibility; authorized viewers obtain versioned copies.
- Reproduce each user’s equipped mobile theme.

### Out of Scope
- Workout execution, timers/drafts, joint-live execution, push/browser/email notifications, and store browsing/purchases.
- Live collaborative plans, anonymous links, and mobile UI reuse.

## Capabilities

### New Capabilities
- `web-account-access`: Browser registration, authentication, recovery, and profile bootstrap.
- `desktop-training-planning`: Concurrent-safe routine and mesocycle authoring.
- `web-social-circle`: Circle workflows, feed engagement, and in-app notifications.
- `plan-publication`: Authorized, provenance-preserving publication and versioned copying.
- `equipped-theme-web`: Accessible desktop rendering of equipped themes.

### Modified Capabilities
- None.

## Approach
Build an independent React/TypeScript sibling outside `/home/rodaja/Workspace/GymBro`, with app, feature, domain, and Supabase-adapter boundaries. Treat actor-bound RPC projections as authorization truth. Deliver in phases: (0) contracts, concurrency, ownership, authorization; (1) auth/planning; (2) social/private sharing/publication; (3) theme/accessibility hardening. A single PR is preferred, but the platform will likely exceed 800 changed lines; task planning must enforce reviewable work units or request a size exception.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `<sibling-web>/src/{app,features,domain,infrastructure}` | New | Desktop client |
| `supabase/migrations`, `supabase/tests` | Modified | RPCs, authorization, concurrency |
| `types`, `utils`, theme assets | Modified | Versioned portable contracts/tokens |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Stale planning writes; contract/client drift | High | CAS/item RPCs; generated/versioned contracts |
| Ownership, authorization, provenance, moderation, blocks/deletion, mobile regressions | High | Explicit backend owner, policies, compatibility tests, staged rollout |

## Rollback Plan
Disable web deployment and publication entry points; revert additive backend migrations/RPC exposure while preserving mobile-compatible schemas and existing private shares.

## Dependencies
- Shared Supabase project, browser redirect configuration, backend ownership, generated RPC contracts, concurrency hardening, moderation baseline, and mobile compatibility gates.

## Success Criteria
- [ ] Existing and newly registered users can recover access and see the same profile/planning data.
- [ ] Authorized planning, social, sharing, publication, copying, block, and deletion scenarios pass database/client tests with no stale overwrite.
- [ ] Keyboard and screen-reader checks pass; equipped themes remain recognizable.
- [ ] Every delivery unit stays within 800 changed lines or records an approved exception.
