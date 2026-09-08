# Tasks: GymBro Web Platform

## Review Workload Forecast

Estimated changed lines: 4,500–6,500 total; remediation remains inside the prior forecast. Each remediation slice targets <800 authored lines. Delivery strategy: single-pr.

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

Maintainer-authorized `size:exception`; implementation tasks and both local closure corrections are complete, with automated checks and scoped independent validation passing. Manual product acceptance and remote delivery remain pending.

### Local closure review — 2026-09-08

- [x] Prevent concurrent first-time publication copies from overwriting each other when the recipient has no training-library row; add concurrency regression coverage.
- [x] Support valid email authentication callbacks opened in a fresh browser tab without weakening callback validation; add fresh-tab regression coverage in the web repository.

Publication APIs and their additive correction are committed locally as `9899923`; the initial web snapshot, including the callback correction, is committed in the separate web repository as `1be165a`. No push or deployment has occurred.

Validation: the isolated concurrency regression changed from one retained routine to both imports preserved; 89 pgTAP assertions passed. Web verification passed 89 unit tests, typechecking, 13 E2E tests with one expected skip, and a final production build. Both corrections passed scoped independent validation. Browser tests use mocked gateways, not real email delivery or live mobile/web interoperability.

The additive SQL correction was applied only to disposable schema-clone databases, which were removed. Applying it to the original local database and remote environments remains a separate delivery step; no original data was reset or modified.

### Suggested Remediation Slices

| Slice | Tasks | Focused test | Runtime harness | Rollback |
|---|---|---|---|---|
| R1 | 9.1–9.2 | `npm test -- packages/contracts`; `npm --prefix ../gymbro-web test -- src/infrastructure/supabase/catalog.test.ts` | Supabase catalog fixture | contracts/catalog gateway |
| R2 | 9.3–9.5 | `npm --prefix ../gymbro-web test -- src/app src/features/planning/routines` | Vite: Spanish routine/catalog flow | routes/routine UI |
| R3 | 9.6 | `npm --prefix ../gymbro-web test -- src/features/planning/routines/set-editor.test.tsx` | Vite: keyboard reorder | set editor |
| R4 | 9.7–9.8 | `npm --prefix ../gymbro-web test -- src/features/planning/mesocycles` | Vite: routine-first weekly plan | mesocycle UI |
| R5 | 9.9 | `npm --prefix ../gymbro-web test -- src/features/planning/draft-store.test.ts` | two-client stale save/reload | draft/CAS layer |
| R6 | 9.10–9.11 | `npm --prefix ../gymbro-web run test:e2e` | Pages preview, desktop/mobile Chromium | localization/E2E |

## Completed Baseline (13 tasks; cumulative apply-progress preserved)
- [x] 1.1 Shared contracts: `packages/contracts/**`.
- [x] 2.1 RED pgTAP: `supabase/tests/training_library_v2.sql`.
- [x] 2.2 CAS V2: `supabase/migrations/*_training_library_revisions_v2.sql`.
- [x] 3.1 Mobile V2: `services/trainingLibrary.ts`, `context/DataContext.tsx`, tests.
- [x] 4.1 Web scaffold/auth boundary: `/home/rodaja/Workspace/gymbro-web/**`.
- [x] 4.2 Route-threat RED tests: `src/app/routes.test.tsx`.
- [x] 4.3 Protected auth shell: `src/app/router.tsx`, `src/features/auth/**`.
- [x] 5.1 Initial planner: `src/features/planning/**`, `src/infrastructure/supabase/training.ts`; user acceptance superseded by Phase 9.
- [x] 6.1 Publication RED pgTAP: `supabase/tests/plan_publications.sql`.
- [x] 6.2 Publication RPCs: `supabase/migrations/*_plan_publications.sql`.
- [x] 7.1 Social/feed/notifications: `src/features/{circle,sharing,feed,notifications}/**`.
- [x] 8.1 Themes/accessibility: `src/features/theme/**`, `src/app/styles/**`.
- [x] 8.2 E2E/Pages: `e2e/**`, `playwright.config.ts`, `wrangler.toml`.

## Phase 9: Planning UX Remediation (Implementation Complete)
- [x] 9.1 Extend `packages/contracts/src/**` and tests with lossless mobile-compatible routine/mesocycle schemas; preserve existing definition snapshots, per-exercise sets, week entries, and unknown valid fields.
- [x] 9.2 Add `/home/rodaja/Workspace/gymbro-web/src/infrastructure/supabase/catalog.ts` and tests for existing catalog RPCs; load/filter exercises without backend migration.
- [x] 9.3 Split Spanish protected routes/shell in `/home/rodaja/Workspace/gymbro-web/src/{app/router.tsx,features/planning/routes/**}`; `/rutinas` and `/mesociclos` render distinct workflows.
- [x] 9.4 Build `/home/rodaja/Workspace/gymbro-web/src/features/planning/routines/library.tsx`; owners can list, open, create, edit, and safely delete routines.
- [x] 9.5 Replace comma parsing in `/home/rodaja/Workspace/gymbro-web/src/features/planning/{model.ts,routines/editor.tsx}` with a structured catalog picker; custom exercise definition creation remains out of scope.
- [x] 9.6 Add `/home/rodaja/Workspace/gymbro-web/src/features/planning/routines/set-editor.tsx`; edit each exercise’s sets independently and keyboard-reorder exercises without data loss.
- [x] 9.7 Build `/home/rodaja/Workspace/gymbro-web/src/features/planning/mesocycles/library.tsx`; creation is unavailable until an owned routine exists, with an actionable routine link.
- [x] 9.8 Add `/home/rodaja/Workspace/gymbro-web/src/features/planning/mesocycles/week-planner.tsx`; configure each week/day as rest or an owned routine snapshot and reorder entries.
- [x] 9.9 Add `/home/rodaja/Workspace/gymbro-web/src/features/planning/draft-store.ts` and update `src/infrastructure/supabase/training.ts`; account-scoped versioned drafts survive reload/conflict while CAS preserves newer mobile data.
- [x] 9.10 Localize `/home/rodaja/Workspace/gymbro-web/src/{app,features}/**` fully to Spanish; tests reject remaining user-facing English and retain accessible names/statuses.
- [x] 9.11 Expand `/home/rodaja/Workspace/gymbro-web/e2e/{planning,accessibility}.spec.ts` and planning integration tests; prove Spanish routes, prerequisite, keyboard access, mobile/web round trips, snapshot preservation, and stale-write safety.
