# Tasks: Meaningful Progress Dashboard

## Review Workload Forecast

| Field | Value |
|---|---|
| Authored additions + deletions | PR1 260–340; PR2 320–400; PR3 300–390; PR4 300–390; PR5 340–400; PR6 300–390; PR7 350–400; PR8 300–390; total 2,470–3,100 |
| Likely groups | contracts/tests; repository; rewards; selectors ×2; UI/a11y; history |
| Dominant risks | staged collisions, migration loss, duplicate rewards, DST, false precision, a11y |
| Budgets | 400-line: High; 800-line session: High |
| Delivery | force-chained; feature-branch-chain; no `size:exception` forecast |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
800-line session budget risk: High

Tracker: draft/no-merge `feature/meaningful-progress-dashboard` → main. Diagram: `tracker ← PR1 ← PR2 ← PR3 ← PR4 ← PR5 ← PR6 ← PR7 ← PR8📍`; children target left with slice-only diffs.

| PR | Start → finished boundary; files | Verification / runtime | Rollback; out of scope |
|---|---|---|---|
| 1 | Baseline→contracts; package/lock/types/domain/tests | domain Vitest; N/A pure | File revert; no persistence/UI |
| 2 | Contracts→finalizers; domain/tests | focused Vitest; fixtures | File revert; no persistence/UI |
| 3 | Sessions→profile repository; storage/DataContext/tests | migration Vitest; profile switch | Backup restore; no rewards/UI |
| 4 | Pending→applied reward; ShopContext/storage/tests | failure Vitest; retry | Saga revert; no selectors/UI |
| 5 | Attempts→core selectors; analytics/tests | selector Vitest; DST | Selector revert; no UI/history |
| 6 | Core→filter/trend selectors; analytics/tests | trend Vitest; history fixture | Layer revert; no UI |
| 7 | Selectors→a11y dashboard; chart/components/screen | Vitest/typecheck; device | Presenter revert; no history |
| 8 | Attempts→capture/edit; execution/session/tests | Vitest/typecheck; device flow | Adapter revert; no catalog/share redesign |

## Phase 1: Contracts and Deterministic Domain (PR1–2)
- [x] 1.1 RED: configure dev-only Vitest, first verify Expo SDK 56 docs, and test profile/version snapshots, immutable/unknown identity, 69/70/99/100/zero/failure adherence, partial/full/duplicate rewards, three modes, attribution validity/default/custom values, compatibility, and non-additive exposure.
- [x] 1.2 GREEN: implement `types/index.ts`/`utils/workoutAttempts.ts`; preserve catalog snapshot/set-type ownership and replace trusted name fallback with unknown identity.

## Phase 2: Migration and Reward Saga (PR3–4)
- [x] 2.1a PR3: test profile isolation, backup/reset-once preservation/rollback, repeat-run behavior, and persistence-first result versus structural edits.
- [x] 2.1b PR4: test every attempt/shop/receipt/mark failure and duplicate reward recovery.
- [x] 2.2a PR3: implement profile attempt repository, migration, serialized mutations, and loading/error/retry state in `utils/storage.ts`/`context/DataContext.tsx`; record evidence.
- [x] 2.2b PR4: implement pending→receipt→shop→applied `context/ShopContext.tsx` recovery; record evidence.

## Phase 3: Selectors (PR5–6)
- [x] 3.1 PR5: test and implement half-open local 7-day/DST periods, profile-owned bounded aggregation, independent activity/adherence signals, and zero/missing-baseline comparisons.
- [x] 3.2 PR6: test and implement stable scoped/historical IDs, compatible two-point trends, weighted exposure, separate mode/unit indicators, capped labels, and unsupported/empty/insufficient/unknown/incompatible/dense/sparse outputs.

## Phase 4: UI, History, and Gates (PR7–8)
- [x] 4.1 RED then GREEN: test loading/error/retry, clear-filter empty, resize, non-color/a11y labels, and exposure-not-growth copy; implement `components/progress/*`, `components/LineChart.tsx`, and `app/(tabs)/progress.tsx`.
- [x] 4.2 RED then GREEN: integrate immutable capture/failure reps and allowed edits in `app/routine/execute/[id].tsx`/`app/session/[id].tsx`, rebasing—not overwriting—staged history and catalog work.
- [ ] 4.3 Per PR record lines, clean diff, test/runtime evidence, typecheck, rollback, and out-of-scope; after apply run ordinary bounded review, then SDD verification with full Vitest/typecheck and device checks for profiles, search, retry, orientation, screen reader, and Glass/theme visuals.
