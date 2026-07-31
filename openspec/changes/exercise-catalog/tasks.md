# Tasks: Exercise Catalog

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 800-1200 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 → PR5 |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Types, storage reset, DataContext exercise CRUD | PR 1 | Base = tracker branch |
| 2 | Catalog tab, form modal, muscle-group selector | PR 2 | Base = PR 1 branch |
| 3 | Routine create/edit picker flow and locked snapshots | PR 3 | Base = PR 2 branch |
| 4 | Execute-screen set types and progress/routine UI | PR 4 | Base = PR 3 branch |
| 5 | Analytics ID matching and share payload updates | PR 5 | Base = PR 4 branch |

## Phase 1: Foundation

- [x] 1.1 Update `types/index.ts` with `MuscleGroup`, `ExerciseVariant`, `SetType`, catalog `Exercise`, `RoutineExercise`, `CompletedExercise.catalogExerciseId`, and shared payload shapes.
- [x] 1.2 Extend `utils/storage.ts` with `@gymbro/exercises`, load/save helpers, and a one-time schema version reset that clears routines/sessions only.
- [x] 1.3 Refactor `context/DataContext.tsx` to load exercises, expose exercise CRUD, require `addRoutine(name, muscleGroups)`, and persist snapshot-based routine/session writes.

## Phase 2: Catalog UI

- [x] 2.1 Create `constants/muscleGroups.ts` and `components/MuscleGroupSelector.tsx` with all 11 labels and reusable multi-select chip behavior.
- [x] 2.2 Create `app/(tabs)/exercises/index.tsx` for list/filter/delete flows and register the tab in `app/(tabs)/_layout.tsx`.
- [x] 2.3 Create `app/exercise/create.tsx` and register it in `app/_layout.tsx` as a modal for create/edit exercise with validation for non-empty name and at least one muscle group.

## Phase 3: Routine Composition

- [x] 3.1 Update `app/routine/create.tsx` to require routine muscle groups before creation and surface validation errors from the spec.
- [x] 3.2 Create `components/ExercisePicker.tsx` to filter catalog entries by routine muscle groups and expose a “create new” entry point.
- [x] 3.3 Refactor `app/routine/[id].tsx` to replace free-text exercises with snapshot adds, locked name/muscle-group/variant fields, editable sets only, and inline create auto-add flow.

## Phase 4: Execution, Analytics, Sharing, Verification

- [x] 4.1 Update `app/routine/execute/[id].tsx`, `app/(tabs)/routines/index.tsx`, and `app/(tabs)/progress.tsx` for set `tipo` behavior, routine muscle-group chips, and catalog-backed exercise selection.
- [x] 4.2 Refactor `utils/analytics.ts`, `services/shareSync.ts`, and `context/ShareContext.tsx` for ID-first matching, legacy name fallback, tonnage rules, and snapshot-based shared routines.
- [ ] 4.3 Verify with `npx tsc --noEmit` plus manual walkthroughs for catalog CRUD, routine picker/inline create, locked snapshots, failure-set execution, legacy analytics fallback, and shared routine accept/update.
