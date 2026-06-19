# Proposal: exercise-catalog

## Intent

Exercises are currently embedded arrays inside routines with no independent identity. This prevents reuse across routines, makes analytics fragile (name-based matching), and doesn't match the user's mental model of "selecting exercises from a library." We need a standalone exercise catalog with CRUD, muscle group tagging, and set type semantics (warmup/working/failure), so routines can reference catalog exercises via snapshot and analytics can use stable IDs.

## Scope

### In Scope
- Exercise catalog as independent entity with full CRUD (name, muscleGroups[], variante, sets[])
- Muscle group enum: `pecho | espalda | cuadriceps | femorales | gemelos | hombros | bíceps | tríceps | core | glúteos | fullBody`
- Set type system: `C` (warmup, counts for volume), `F` (failure, no reps), numbers (working sets)
- Routine-muscle group multi-select during creation
- Exercise picker in routine flow (filtered by routine's muscle groups)
- Inline exercise creation from routine flow (auto-assigns routine's muscle groups)
- Locked exercise fields once added to routine (name/muscleGroups immutable, only sets editable)
- Dedicated catalog management tab
- Analytics migration to ID-based matching (with backward compat for old sessions)
- Sharing shape update (self-contained snapshots)
- Data migration: DELETE existing routines/sessions (start fresh)

### Out of Scope
- Per-user catalogs (catalog is GLOBAL)
- Exercise variant as functional filter (informational only)
- Retroactive catalog propagation to existing routines (snapshot model)
- Migration of existing exercise data (wipe and restart)

## Capabilities

### New Capabilities
- `exercise-catalog`: Independent exercise entity with CRUD, muscle group tagging, variante, and set templates
- `routine-muscle-groups`: Routine creation with multi-select muscle groups and exercise filtering
- `set-type-system`: Set types (C/F/number) with distinct execution semantics and volume calculation rules

### Modified Capabilities
- `routine-exercise-link`: Exercises in routines are now catalog references with snapshot (name/muscleGroups copied on add, sets are routine-specific)
- `analytics-exercise-matching`: Switch from name-based to ID-based exercise matching in progress tracking

## Approach

**Hybrid with snapshot**: Catalog is source of truth for exercise definitions. When added to a routine, a snapshot of name/muscleGroups is copied into `RoutineExercise`. Set configuration lives only in the routine. Catalog edits don't propagate to existing routines (matches user requirement). Sharing stays self-contained (no catalog sync needed).

**Data model**:
- `Exercise` (catalog): `{ id, name, muscleGroups: MuscleGroup[], variante: ExerciseVariante, sets: CatalogSet[] }`
- `RoutineExercise`: `{ catalogId, name, muscleGroups, sets: RoutineSet[] }` — snapshot + routine-specific sets
- `RoutineSet`: `{ id, tipo: SetType, peso, repeticiones }` where `SetType = 'C' | 'F' | number`
- Storage: New AsyncStorage key `@gymbro/exercises` for catalog

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `types/index.ts` | Modified | New `Exercise` (catalog), `RoutineExercise`, `MuscleGroup`, `SetType`, `ExerciseVariante` types |
| `context/DataContext.tsx` | Modified | Add catalog CRUD, change `addRoutine` signature, exercise selection flow |
| `utils/storage.ts` | Modified | New `@gymbro/exercises` key, `loadExercises`/`saveExercises` |
| `app/routine/[id].tsx` | Modified | Exercise picker instead of inline create, locked fields, new set structure |
| `app/routine/create.tsx` | Modified | Muscle group multi-select during routine creation |
| `app/routine/execute/[id].tsx` | Modified | Handle set `tipo` field (C/F/number), adjust completion logic |
| `app/(tabs)/routines/index.tsx` | Modified | Display muscle groups on routine cards |
| `app/(tabs)/progress.tsx` | Modified | Exercise picker with catalog reference, muscle group filter |
| `utils/analytics.ts` | Modified | Switch to ID-based matching, handle old sessions (name-only) |
| `services/shareSync.ts` | Modified | `SharedRoutineDoc` shape update (snapshot-based) |
| `context/ShareContext.tsx` | Modified | Resolve exercise snapshots in merged routines |
| `app/(tabs)/_layout.tsx` | Modified | New tab for exercise catalog |
| `app/(tabs)/exercises/index.tsx` | New | Catalog list/CRUD screen |
| `app/exercise/create.tsx` | New | Create/edit exercise form (modal) |
| `components/MuscleGroupSelector.tsx` | New | Reusable multi-select for muscle groups |
| `components/ExercisePicker.tsx` | New | Modal to select exercises from catalog (filtered) |
| `constants/muscleGroups.ts` | New | MuscleGroup enum values and display labels |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Analytics backward compat (old sessions have name only) | High | Dual matching: try `catalogId` first, fallback to name. Old sessions continue working via name. |
| Sharing data shape change (Firestore old docs) | Medium | Wipe existing data (user confirmed). New shares use snapshot model (self-contained). |
| No test runner — manual testing only | High | Split into 5 chained PRs (<400 lines each). Each PR is independently testable. |
| Set `tipo` changes execution flow | Medium | Clear semantics: C counts for volume, F has no reps, numbers are working sets. Document in code comments. |
| Muscle group filtering UX complexity | Medium | Reusable `MuscleGroupSelector` component. Inline exercise creation auto-assigns routine's groups. |

## Rollback Plan

Since we're wiping existing data (no migration), rollback is straightforward:
1. Revert the PR chain (5 PRs in reverse order)
2. Clear AsyncStorage keys: `@gymbro/exercises`, `@gymbro/routines`, `@gymbro/sessions`
3. Users start fresh with old code version

No data loss risk since we're deleting existing data at the start.

## Dependencies

- None (self-contained change)
- Existing patterns: GlassCard, GlassInput, GlassButton, HapticPressable for UI consistency
- AsyncStorage for persistence (existing pattern)
- Expo Router for navigation (existing pattern)

## Success Criteria

- [ ] User can create/edit/delete exercises in catalog with name, muscleGroups[], variante, sets[]
- [ ] User can create routine with name + multi-select muscle groups
- [ ] User can add exercises to routine from catalog (filtered by routine's muscle groups)
- [ ] User can create new exercise from within routine flow (auto-assigns routine's muscle groups)
- [ ] Once added to routine, exercise name/muscleGroups are locked (only sets editable)
- [ ] Set types (C/F/number) behave correctly during execution (C counts for volume, F has no reps)
- [ ] Analytics tracks exercises by ID (with backward compat for old name-only sessions)
- [ ] Sharing works with new snapshot-based routine shape
- [ ] Dedicated catalog tab displays and manages exercises
- [ ] All PRs <400 lines, independently testable

## Delivery Strategy

**Estimated size**: 800-1200 lines total  
**400-line budget risk**: HIGH  
**Strategy**: Feature-branch-chain with 5 PRs

1. **PR1 — Types & Storage foundation** (~150 lines): New types, enums, storage functions. No UI changes.
2. **PR2 — Exercise catalog CRUD** (~250 lines): New catalog tab, list/create/edit exercises, MuscleGroupSelector component.
3. **PR3 — Routine refactor** (~200 lines): Muscle groups on routine create, ExercisePicker, locked fields, inline exercise creation.
4. **PR4 — Execution & Sets** (~150 lines): Set tipo handling in execution screen, volume calculation rules.
5. **PR5 — Analytics & Sharing** (~200 lines): ID-based matching, sharing shape update, backward compat.

Each PR targets the feature branch, is independently testable, and has clear start/finish.
