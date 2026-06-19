## Exploration: exercise-catalog

### Current State

The app manages exercises as **embedded arrays inside Routine**. There is no independent exercise entity. The type system is:

```
Routine { id, name, exercises: Exercise[], createdAt, isShared?, shareId? }
Exercise { id, name, sets: ExerciseSet[] }
ExerciseSet { id, weight, reps }
```

**Storage**: AsyncStorage key `@gymbro/routines` holds `Routine[]`. No separate exercise storage.

**CRUD**: DataContext exposes `addRoutine(name)`, `updateRoutine(routine)`, `deleteRoutine(id)`. Exercises are mutated by modifying `routine.exercises[]` and calling `updateRoutine()`. There is no exercise-level CRUD.

**Execution** (`app/routine/execute/[id].tsx`): Builds a runtime map of set values keyed by `${exerciseId}-${setId}`. On completion, creates `CompletedExercise[]` with `exerciseId`, `name`, and `CompletedSet[]`. Sessions are persisted to `@gymbro/sessions`.

**Analytics** (`utils/analytics.ts`): Matches exercises **by name string** (case-insensitive) via `getExerciseProgress()`. `getUniqueExerciseNames()` collects names from all sessions. Charts show maxWeight and totalReps per exercise over time.

**Sharing** (`services/shareSync.ts`): Sends `{ name, exercises }` to Firestore. `SharedRoutineDoc.routine` is `{ name: string, exercises: Exercise[] }`. Recipient gets a merged Routine with `isShared=true`.

**UI patterns**: Glass morphism design with `GlassCard`, `GlassInput`, `GlassButton`, `HapticPressable`. Forms are inline (no form library). Navigation via Expo Router (Stack + Tabs). Multi-select doesn't exist yet — the closest pattern is `SelectablePulse` for single-select chips in progress.tsx.

**Enum patterns**: The codebase uses **string union types** (not TypeScript enums): `UserProfile = 'rodaja' | 'brisas'`, `ThemeDecoration = 'star' | 'moon' | ...`, `ShopThemeCategory = 'profile' | 'basic' | ...`. Constants use `as const` objects (e.g., `GEM_REWARDS`, `FIREBASE_COLLECTIONS`).

### Affected Areas

| File | Why affected |
|------|-------------|
| `types/index.ts` | Core type changes: new `Exercise` (catalog), new `ExerciseSet` with `tipo`, new `RoutineExercise` (link), new `MuscleGroup` enum, `Routine` gets `muscleGroups[]` |
| `context/DataContext.tsx` | Must add exercise catalog CRUD, change `addRoutine` signature (muscle groups), change how exercises are added to routines (select from catalog, not inline create) |
| `utils/storage.ts` | New AsyncStorage key for exercise catalog (`@gymbro/exercises`), new `loadExercises`/`saveExercises` functions |
| `app/routine/[id].tsx` | Major rewrite: exercises are selected from catalog (not created inline), set structure changes (add `tipo`), exercise name/muscle group locked once added |
| `app/routine/create.tsx` | Must add muscle group multi-select during routine creation |
| `app/routine/execute/[id].tsx` | Set completion must handle new `tipo` field (C=calentamiento, number, F=fallo). Exercise display may show muscle group info |
| `app/(tabs)/routines/index.tsx` | Display muscle groups on routine cards, exercise count may change meaning |
| `app/(tabs)/progress.tsx` | Exercise matching currently by name — needs to work with catalog reference (exerciseId). Exercise picker may need muscle group filter |
| `utils/analytics.ts` | `getExerciseProgress()` matches by name — must switch to exerciseId or handle both. `getUniqueExerciseNames()` needs to resolve catalog names |
| `services/shareSync.ts` | `SharedRoutineDoc.routine` shape changes — must include catalog exercises or snapshot them. Sharing must serialize exercise references + their catalog data |
| `context/ShareContext.tsx` | Merged routines from shares must resolve exercise catalog references |
| `components/ShareRoutineModal.tsx` | May need to pass additional data for new routine shape |
| `app/(tabs)/routines/pending-shares.tsx` | Display may need to show muscle group info |
| `app/_layout.tsx` | May need new routes for exercise catalog management screen |

**New files likely needed**:
- `app/(tabs)/exercises/index.tsx` — Exercise catalog list/CRUD screen (new tab or separate screen)
- `app/exercise/create.tsx` or modal — Create/edit exercise form
- `components/MuscleGroupSelector.tsx` — Reusable multi-select component for muscle groups
- `components/ExercisePicker.tsx` — Modal/screen to select exercises from catalog filtered by muscle group
- `constants/muscleGroups.ts` — MuscleGroup enum values and display labels

### Data Flow Diagrams

#### Current: Create Routine
```
UI (create.tsx) → addRoutine(name) → DataContext → saveRoutines() → AsyncStorage
```

#### Current: Add Exercise to Routine
```
UI ([id].tsx) → inline object creation { id, name: '', sets: [...] }
  → local state setExercises()
  → save() → updateRoutine(routine) → DataContext → saveRoutines() → AsyncStorage
```

#### Current: Execute Routine
```
UI (execute/[id].tsx) → getRoutine(id) → buildSetValues()
  → user fills weight/reps → completeSet()
  → finishWorkout() → addSession({ exercises: CompletedExercise[] })
  → DataContext → saveSessions() → AsyncStorage
```

#### Current: Analytics
```
progress.tsx → getUniqueExerciseNames(sessions) → extracts names from CompletedExercise.name
  → user picks exercise chip
  → getExerciseProgress(sessions, exerciseName) → matches by name.toLowerCase()
```

#### Current: Share
```
UI ([id].tsx) → ShareRoutineModal → shareRoutine(routineId, routine)
  → ShareContext → createShare(user, routine) → shareSync.ts
  → Firestore: { routine: { name, exercises: Exercise[] } }
```

#### Proposed: Create Routine (with muscle groups)
```
UI (create.tsx) → name + muscleGroups[] → addRoutine(name, muscleGroups)
  → DataContext → saveRoutines() → AsyncStorage
```

#### Proposed: Add Exercise to Routine (from catalog)
```
UI ([id].tsx) → ExercisePicker (filtered by routine.muscleGroups)
  → user selects catalog exercise → creates RoutineExercise { catalogId, sets[] }
  → local state → save() → updateRoutine() → AsyncStorage
```

#### Proposed: Analytics (with catalog reference)
```
progress.tsx → sessions have CompletedExercise with exerciseId (catalog ref)
  → resolve name from catalog OR keep name snapshot in session
  → getExerciseProgress(sessions, exerciseId) → matches by ID
```

### Dependency Graph

```
types/index.ts
├── context/DataContext.tsx
│   ├── app/routine/[id].tsx
│   ├── app/routine/create.tsx
│   ├── app/routine/execute/[id].tsx
│   ├── app/(tabs)/routines/index.tsx
│   └── app/(tabs)/progress.tsx
├── utils/storage.ts
├── utils/analytics.ts
│   └── app/(tabs)/progress.tsx
├── services/shareSync.ts
│   └── context/ShareContext.tsx
│       ├── context/DataContext.tsx (merge logic)
│       ├── components/ShareRoutineModal.tsx
│       └── app/(tabs)/routines/pending-shares.tsx
└── components/LineChart.tsx (uses ExerciseProgressPoint from analytics)
```

### Approaches

#### 1. Full catalog with reference-based routines (Recommended)

Exercise becomes a standalone catalog entity stored independently. Routines hold **references** to catalog exercises (by ID) plus local set configuration. A `RoutineExercise` (or `RoutineExerciseEntry`) type links `catalogExerciseId` → sets with the new `tipo` field.

- **Pros**: Clean separation, catalog reusable across routines, analytics can use stable IDs, muscle group filtering is natural
- **Cons**: Migration of existing data needed, sharing becomes more complex (must snapshot or sync catalog), more files to change
- **Effort**: High — ~15+ files touched, new screens, data migration, sharing redesign

#### 2. Enriched inline exercises with catalog-like management

Keep exercises embedded in routines but add a "catalog" layer that's essentially a deduplicated list of all exercises across routines. The catalog is derived, not stored separately. New exercises are created in a catalog UI but copied into the routine.

- **Pros**: Less breaking change, sharing stays simple (exercises still inline), no ID resolution needed
- **Cons**: Catalog changes don't propagate to existing routines, muscle group filtering requires scanning all routines, doesn't fully match user's mental model of "select from catalog"
- **Effort**: Medium — ~10 files, but the UX won't feel right

#### 3. Hybrid: catalog stored separately, routines snapshot exercises on add

Catalog is the source of truth for exercise definitions. When an exercise is added to a routine, a **snapshot** of the relevant fields (name, muscleGroups) is copied into the routine entry. Set configuration lives only in the routine. Catalog edits don't retroactively update routines.

- **Pros**: Sharing stays simple (routine is self-contained), analytics can use either name or catalogId, matches user requirement that "name/muscle group can't be edited once added"
- **Cons**: Some data duplication, catalog edits don't propagate (but user explicitly wants this)
- **Effort**: Medium-High — ~12 files, but sharing and analytics need minimal changes

### Recommendation

**Approach 3 (Hybrid with snapshot)** is the best fit. It matches the user's explicit requirement that once an exercise is added to a routine, its name and muscle group are locked. Sharing remains self-contained (no need to sync catalog across Firestore). Analytics can continue matching by name (snapshot) or optionally by catalogId for more robustness. The catalog is a "template library" — you create exercises there, then pull them into routines.

Key design decisions:
- `Exercise` (catalog): `{ id, name, muscleGroups: MuscleGroup[], variante: ExerciseVariante, sets: CatalogSet[] }`
- `CatalogSet`: `{ id, tipo: SetType, peso: number, repeticiones: number }` where `SetType = 'C' | 'F' | number`
- `RoutineExercise`: `{ catalogId: string, name: string, muscleGroups: MuscleGroup[], sets: RoutineSet[] }` — snapshot of catalog data + routine-specific sets
- `RoutineSet`: `{ id, tipo: SetType, peso: number, repeticiones: number }`
- `Routine`: `{ id, name, muscleGroups: MuscleGroup[], exercises: RoutineExercise[], ... }`
- `MuscleGroup`: string union type — `'pecho' | 'espalda' | 'biceps' | 'triceps' | 'hombros' | 'cuadriceps' | 'isquiotibiales' | 'gluteos' | 'pantorrillas' | 'core' | 'fullbody'`
- `ExerciseVariante`: `'mancuernas' | 'barra' | 'libre'`

### Risks

1. **Analytics backward compatibility**: Existing sessions have `CompletedExercise.name` but no `exerciseId`. Analytics must handle both old (name-only) and new (catalogId) sessions. Old sessions will still work via name matching.

2. **Sharing data shape change**: `SharedRoutineDoc.routine.exercises` changes from `Exercise[]` to `RoutineExercise[]`. Firestore documents created before the change will have the old shape. Need to handle both on read or migrate.

3. **Data migration**: Existing routines have exercises with free-text names and no catalogId. A migration step is needed to either: (a) create catalog entries from existing exercise names, or (b) leave old routines as-is and only use catalog for new exercises.

4. **No test runner**: There's no test infrastructure. The refactor touches core data types used everywhere. Manual testing will be the only verification — high risk of regression.

5. **Set `tipo` field**: The new set type system (C=calentamiento, number=working set, F=fallo) changes how sets are displayed and tracked. Execution screen must handle warmup sets differently (maybe not count for tonnage?) and failure sets (no rep target?).

6. **Muscle group filtering**: When adding exercises to a routine, exercises should be filtered by matching muscle groups. But the user also wants to create new exercises from within the routine flow — this needs a seamless UX (inline create → auto-assign routine's muscle groups → add to catalog → add to routine).

### Scope Estimate

- **Files modified**: 12–15 existing files
- **New files**: 4–6 (catalog screen, exercise form, muscle group selector, exercise picker, constants)
- **Complexity**: High — this is a fundamental data model change that touches every layer (types → storage → context → UI → sharing → analytics)
- **Estimated total lines changed**: 800–1200 lines across all files
- **400-line budget risk**: HIGH — this MUST be split into chained PRs

**Suggested PR chain**:
1. **PR1 — Types & Storage foundation**: New types, enums, storage functions, no UI changes yet
2. **PR2 — Exercise catalog CRUD**: New catalog screen, create/edit exercise, list exercises
3. **PR3 — Routine refactor**: Muscle groups on routine create, exercise picker instead of inline create, locked fields
4. **PR4 — Execution & Sets**: New set tipo handling in execution screen
5. **PR5 — Analytics & Sharing**: Update analytics to use catalogId, fix sharing for new shape

### Open Questions

1. **Muscle group enum values**: What exact muscle groups should be in the enum? I proposed a standard list but the user should confirm.
2. **Set `tipo` semantics**: How should `C` (calentamiento) and `F` (fallo) sets behave during execution? Should warmup sets count for tonnage? Should failure sets have a rep target or just be marked as done?
3. **Catalog scope**: Is the catalog global (shared between both users) or per-user? Currently routines are per-device with sharing as a separate mechanism.
4. **Migration strategy**: Should existing exercises be auto-imported into the catalog, or should old routines just keep working with their inline data?
5. **Exercise variant (`variante`)**: Is this purely informational (displayed as a label) or does it affect anything (e.g., filtering, analytics)?
6. **Catalog management UI**: Should there be a dedicated tab for the exercise catalog, or is it accessed only through the routine flow?

### Ready for Proposal

**Yes** — with the open questions above resolved. The recommendation (Approach 3: Hybrid with snapshot) is clear and the scope is well-mapped. The orchestrator should ask the user the open questions before proceeding to proposal, especially the muscle group enum values and migration strategy.
