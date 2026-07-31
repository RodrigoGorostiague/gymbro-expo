# Tasks: Mesocycle Planning

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 850-1050 |
| 800-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 -> PR 2 -> PR 3 |
| Delivery strategy | auto-forecast |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
800-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Add mesocycle domain, storage, provider actions | PR 1 | `npx vitest tests/storage.test.ts` | `npx tsc --noEmit` | `types/index.ts`, `utils/storage.ts`, `context/DataContext.tsx` |
| 2 | Add navigation, list, create flow, copy cleanup | PR 2 | `npx tsc --noEmit` | Open Mesocycles tab -> create block -> restart app | `app/(tabs)/_layout.tsx`, `app/_layout.tsx`, `app/(tabs)/mesocycles/index.tsx`, `app/mesocycle/create.tsx`, routine copy edits |
| 3 | Add detail editor, unavailable fallback, execute CTA, final tests | PR 3 | `npx vitest tests/storage.test.ts && npx tsc --noEmit` | Open planned session -> execute resolved routine; delete routine -> verify unavailable row | `app/mesocycle/[id].tsx` plus mesocycle resolver/wiring |

## Phase 1: Foundation
- [x] 1.1 Add `Mesocycle`, `MesocycleWeek`, `PlannedSession`, `MesocycleStatus` in `types/index.ts` with snapshot routine metadata.
- [x] 1.2 Add mesocycle AsyncStorage key plus `loadMesocycles()` / `saveMesocycles()` normalization in `utils/storage.ts` and cover restore/delete-only persistence in `tests/storage.test.ts`.
- [x] 1.3 Extend `context/DataContext.tsx` with `mesocycles`, `add/update/delete/getMesocycle()`, and `resolvePlannedRoutine()` while preserving current routine/share hydration.

## Phase 2: Navigation and Creation
- [x] 2.1 RED: add route smoke assertions for `mesocycles/index`, `mesocycle/create`, `mesocycle/[id]` registration and invalid-id fallback notes in `tests/storage.test.ts` or a new focused route contract test.
- [x] 2.2 Update `app/(tabs)/_layout.tsx`, `app/_layout.tsx`, and `app/(tabs)/routines/index.tsx` so Mesocycles is first-class and routines read as reusable templates/library items.
- [x] 2.3 Create `app/(tabs)/mesocycles/index.tsx` with empty state, status summary, create CTA, and delete action that leaves routines untouched.
- [x] 2.4 Create `app/mesocycle/create.tsx` form for name, goal, status, weeks, and optional start date with save-to-detail flow.

## Phase 3: Detail and Session Planning
- [x] 3.1 RED: add failing tests for unresolved `routineId` references and execute CTA suppression while keeping the plan row visible.
- [x] 3.2 Create `app/mesocycle/[id].tsx` to edit weeks, add planned sessions from existing routines, and store day label/order/progression/note fields.
- [x] 3.3 Wire `resolvePlannedRoutine()` into detail rows so valid refs launch `/routine/execute/[id]` and missing refs show snapshot warning only.

## Phase 4: Verification
- [x] 4.1 Extend `tests/storage.test.ts` for mesocycle hydration, repeated routine reuse across weeks, status updates, and mesocycle-only deletion.
- [x] 4.2 Run `npx vitest tests/storage.test.ts tests/exerciseCatalog.test.ts` and `npx tsc --noEmit`; manual smoke: create mesocycle, execute a planned routine, delete a referenced routine, reopen plan.
