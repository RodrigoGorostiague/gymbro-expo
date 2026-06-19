# Design: Exercise Catalog

## Technical Approach

Add a first-class exercise catalog beside routines/sessions, then refactor routine editing to create `RoutineExercise` snapshots from catalog entries. The implementation stays inside the current Expo Router + React Context + AsyncStorage architecture: `DataContext` becomes the orchestration layer, `utils/storage.ts` owns persistence/migration, and route files stay thin UI shells.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Catalog linkage | `RoutineExercise` stores `catalogExerciseId` plus snapshot fields (`name`, `muscleGroups`, `variant`) | Live catalog references only | Matches spec isolation: catalog edits/deletes must not mutate existing routines or shares. |
| Schema migration | Add a one-time storage version reset that clears `@gymbro/routines` and `@gymbro/sessions`, but preserves user/shop data | Ad hoc manual reset, field-by-field migration | Proposal explicitly allows destructive reset; doing it in storage keeps startup deterministic. |
| Route integration | Add `app/(tabs)/exercises/index.tsx` as a real tab and `app/exercise/create.tsx` as a Stack modal | Inline form inside routine screen only | Fits current Expo Router file-based structure; SDK 56 docs confirm route files + `Tabs.Screen`/`Stack.Screen` are the native extension points. |
| Naming contract | Keep code fields in English (`variant`, `weight`, `reps`, `defaultSets`) while UI labels stay Spanish | Mixed Spanish/English model names from proposal | Existing types/storage already use English identifiers; consistency reduces refactor noise and type churn. |

## Data Flow

Catalog CRUD:

    Exercises tab/form -> DataContext exercise CRUD -> utils/storage -> @gymbro/exercises

Routine composition:

    Routine screen -> ExercisePicker -> selected Exercise
         -> clone snapshot/defaultSets -> RoutineExercise[]
         -> updateRoutine -> storage/share sync

Workout + analytics:

    RoutineExercise.catalogExerciseId
         -> CompletedExercise.catalogExerciseId on save
         -> analytics match by ID, fallback to name when ID missing

Inline create from routine flow uses the modal form with prefilled routine muscle groups; after save, the flow dismisses back to the routine screen and auto-adds the new catalog exercise.

## File Changes

| File | Action | Description |
|---|---|---|
| `types/index.ts` | Modify | Split catalog `Exercise` from `RoutineExercise`; add `MuscleGroup`, `ExerciseVariant`, `SetType`, share/session shape updates. |
| `utils/storage.ts` | Modify | Add `@gymbro/exercises`, load/save helpers, and one-time schema reset/version key. |
| `context/DataContext.tsx` | Modify | Load exercises with routines/sessions, expose catalog CRUD, update `addRoutine`, snapshot creation, and session recording. |
| `constants/muscleGroups.ts` | Create | Central enum values and display labels. |
| `components/MuscleGroupSelector.tsx` | Create | Reusable toggle-chip selector using existing Glass/Haptic patterns. |
| `components/ExercisePicker.tsx` | Create | Catalog picker filtered by routine muscle groups, with “create new” entry point. |
| `app/(tabs)/_layout.tsx` | Modify | Register the new catalog tab. |
| `app/(tabs)/exercises/index.tsx` | Create | Catalog listing, filter, edit/delete entry points. |
| `app/exercise/create.tsx` | Create | Create/edit modal form, optionally prefilled from routine context. |
| `app/routine/create.tsx` | Modify | Require routine muscle group selection. |
| `app/routine/[id].tsx` | Modify | Replace free-text exercise creation with picker + locked snapshot fields; only sets editable. |
| `app/routine/execute/[id].tsx` | Modify | Respect `tipo` semantics, hide reps input for `F`, write `catalogExerciseId`. |
| `app/(tabs)/routines/index.tsx` | Modify | Show muscle-group chips on cards. |
| `utils/analytics.ts` / `app/(tabs)/progress.tsx` | Modify | ID-first exercise history, fallback names for legacy sessions, set-type-aware tonnage. |
| `services/shareSync.ts` / `context/ShareContext.tsx` | Modify | Include `muscleGroups` and snapshot-based exercise shape in shared routine payloads. |

## Interfaces / Contracts

```ts
type SetType = 'C' | 'F' | number;
type MuscleGroup = 'pecho' | 'espalda' | 'cuadriceps' | 'femorales' | 'gemelos' | 'hombros' | 'bíceps' | 'tríceps' | 'core' | 'glúteos' | 'fullBody';

interface Exercise { id: string; name: string; muscleGroups: MuscleGroup[]; variant: 'mancuernas' | 'barra' | 'libre'; defaultSets: CatalogSet[]; }
interface RoutineExercise { id: string; catalogExerciseId: string; name: string; muscleGroups: MuscleGroup[]; variant: Exercise['variant']; sets: RoutineSet[]; }
interface CompletedExercise { exerciseId: string; catalogExerciseId?: string; name: string; sets: CompletedSet[]; }
```

`F` sets keep `reps = 0`; they count as completed sets but contribute `weight * 0` tonnage, preserving the current analytics formula.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Typecheck | New type splits and route params | `npx tsc --noEmit` |
| Manual integration | Catalog CRUD, routine picker, inline create, locked routine fields, session save, share accept/update | Device/simulator walkthrough per screen |
| Manual regression | Legacy session analytics fallback, destructive reset only once, shared routine rendering | Seed old storage/share docs and verify UI behavior |

## Migration / Rollout

On first launch after this change, run a storage-version migration that clears routines/sessions and writes the new version marker. Exercises start empty. No feature flag is required.

## Open Questions

- [ ] Should the catalog tab allow deleting an exercise that still appears in active routines without an extra warning message?
