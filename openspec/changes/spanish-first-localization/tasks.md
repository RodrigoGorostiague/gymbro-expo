# Tasks: Spanish-First Localization

## Review Workload Forecast

| PR | Journey / strings | Authored lines | Dominant risk |
|---|---|---:|---|
| 1 | Progress/history, 70 | 230 | Dirty dashboard/session overlap |
| 2 | Shell/training/catalog, 105 | 350 | Broad shared-copy surface |
| 3 | Shop/partner/sharing, 65 | 210 | Notifications and final omissions |
| **Total** | **240** | **790** | Identity/behavior drift |

Delivery: force-chained; budgets: 800 total/400 child; 800-line risk: Medium; size exception: No. Move an untouched low-coupling journey before any child exceeds 400.

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

## Global Contract

Translate call-site literals directly into neutral Spanish only. Preserve behavior, identifiers, routes, enums, storage/API values, logs, parsers, formats, and user data/names. Before implementation, read Expo SDK 56 docs; add no dependency.

## Phase 1: PR 1 — Progress and History

Diagram: `tracker ← PR1 📍`
Start: clean integrated catalog/dashboard through task 4.2. End: progress, charts, legacy resolution, and session history/editing are Spanish. Base: tracker branch. Dependencies: prerequisite baseline only.

- [x] 1.1 Create authoritative `inventory-pr1.md` with file:line, surface, Translate/Preserve/Unreachable disposition, and ~70 visible, accessibility, alert/error, dynamic, terminology, and test entries.
- [x] 1.2 Translate only ledgered call sites in `app/(tabs)/progress.tsx`, `app/session/[id].tsx`, `components/progress/**`, `components/LineChart.tsx`, and presentation fallbacks in `context/DataContext.tsx`; preserve dirty work and numeric/name fidelity.
- [x] 1.3 Update copy-dependent tests; run `npx vitest run tests/analytics.test.ts tests/workoutAttempts.test.ts`, `npx tsc --noEmit`, and phone progress/history/error/screen-reader harness.

Rollback: revert PR1 only; no data rollback. Out of scope: training, catalog, shop, sharing.

## Phase 2: PR 2 — Shell, Training, and Catalog

Diagram: `tracker ← PR1 ← PR2 📍`
Start: PR1 accepted. End: navigation/auth/shared UI plus routine execution, exercises, and catalog are Spanish. Base: PR1 branch; clean diff excludes PR1.

- [x] 2.1 Create `inventory-pr2.md` and classify ~105 reachable visible/navigation/accessibility/alert/error/dynamic/terminology/test strings across likely paths `app/{_layout,index}.tsx`, `app/(tabs)/**`, `app/{routine,exercise}/**`, `components/{login,UI,ExercisePicker,MuscleGroupSelector,App*}.tsx`, `constants/muscleGroups.ts`.
- [x] 2.2 Translate ledgered call sites and affected assertions only; preserve catalog IDs, variants, set types, routes, parsing, and user-created names.
- [x] 2.3 Run `npx vitest run tests/storage.test.ts tests/exerciseCatalog.test.ts`, `npx tsc --noEmit`, and phone/tablet auth→routine→execution→catalog accessibility/error harness.

Rollback: revert PR2 after PR3; PR1 remains. Out of scope: shop, partner, notifications, final audit.

## Phase 3: PR 3 — Shop, Partner, Audit, and Release Gate

Diagram: `tracker ← PR1 ← PR2 ← PR3 📍`
Start: PR2 accepted. End: UI is Spanish and final evidence passes. Base: PR2 branch; clean diff excludes prior children.

- [x] 3.1 Create `inventory-pr3.md`; classify ~65 strings and translate direct call sites in `app/(tabs)/shop.tsx`, sharing/profile UI, `components/{ChatFab,ShareRoutineModal,ThemePreviewBar,CombineWithPartnerCard}.tsx`, `constants/{shopThemes,kiss,welcome,encouragement}.ts`, `context/{Shop,Kiss,Share}Context.tsx`, and notification presentation copy.
- [x] 3.2 Run the static reachable-English audit; publish reviewed `english-visible-exceptions.md` with proper-name/symbol/technical/unreachable evidence; confirm no identity, log, parser, dependency, or behavior diff.
- [x] 3.3 Update copy assertions; run `npx vitest run tests/rewardSaga.test.ts`, `npm test`, `npx tsc --noEmit`, and `npx expo export --platform android` to ignored/temp output.
- [ ] 3.4 Before dashboard/catalog task 4.3 resumes, manually walk phone/tablet × `rodaja`/`brisas`, normal/loading/empty/error/destructive/accessibility paths across dashboard, history, catalog, training, shop, sharing, and profile.

Rollback: revert PR3 independently. Out of scope: i18n runtime, locale switching, new dependencies, formatting/parsing changes.
