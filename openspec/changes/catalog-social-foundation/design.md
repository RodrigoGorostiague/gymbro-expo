# Design: Catalog Social Foundation

## Technical Approach

Release 1 Phase 0 replaces the mutable global v1 catalog with a versioned, ownership-aware local library. It preserves routine and attempt snapshots while a pure planning step validates an incoming graph, resolves canonical definitions, and computes replacement IDs; one journaled commit writes the new state before `DataContext` publishes it. This implements `catalog-data-integrity` and `training-content-imports` from the proposal only: no accounts, social graph, feed, sharing UI, joint workouts, duels, or economy.

## Architecture Decisions

| Decision | Options / tradeoff | Choice and rationale |
|---|---|---|
| Definition versus prescription | Keep mutable `Exercise`; split model | Add immutable `ExerciseDefinition` (`id`, canonical muscle groups, load semantics, provenance) and mutable `RoutineExercisePrescription` (`definitionId`, copied display snapshot, sets/rest/notes). Defaults are `system`; customs are owned by `UserProfile`. A routine retains its snapshot so later definition deletion or replacement cannot rewrite history. |
| Canonical identity | Names; generated local IDs; stable canonical IDs | Ship system definitions in `constants/exerciseDefinitions.ts` with stable IDs. Custom definitions retain a stable origin ID plus owner. Imports dedupe systems by ID and customs by origin/fingerprint within the recipient library, never by display name alone. |
| Persistence atomicity | Multiple best-effort writes; new database | Keep AsyncStorage (SDK 56 documents it as asynchronous key/value storage). Use a v2 library payload plus a transaction journal/commit marker and the existing mutation queues; recovery completes or discards an uncommitted staged payload before hydration. This is realistic without adding a backend or SQLite. |
| Deletion | Reject always; cascade delete | Only delete a recipient-owned custom definition. Reject if live local prescriptions reference it unless an explicit replacement definition is selected; rewrite those references in the same commit. Never modify workout attempts/sessions or embedded routine snapshots. System/foreign-owned definitions are not deletable. |

## Data Flow

```text
legacy keys + v1 catalog/routines/mesocycles
  -> compatibility reader -> normalized v2 library -> journaled commit
import graph -> validate/resolve/dedupe -> replacement map -> staged v2 payload
                                                   -> commit marker -> hydrate DataContext
```

`DataContext` must hydrate the completed library before exposing exercises, routines, or mesocycles. Import plans include definitions, routine prescriptions, and mesocycle planned-routine references; all new recipient entities get recipient ownership and new local IDs, while the replacement map rewrites every edge. Invalid muscle groups, unknown references, owner mismatch, conflicting immutable defaults, or duplicate IDs fail before any write. `0` remains a finite valid load in definition defaults, prescriptions, draft input, and attempt snapshots; falsy checks are forbidden.

## File Changes

| File | Action | Description |
|---|---|---|
| `types/index.ts` | Modify | v2 library, provenance/ownership, immutable definition, prescription, import-plan/result, and legacy-compatible types. |
| `constants/muscleGroups.ts` | Modify | Export the 16 canonical values, labels, and validation guard. |
| `constants/exerciseDefinitions.ts` | Create | Stable, immutable system exercise definitions. |
| `utils/storage.ts` | Modify | v1 compatibility read, v2 migration/journal recovery, atomic library commit, reference scan/delete replacement, import planning and commit. |
| `utils/mesocycles.ts` | Modify | Apply validated routine-ID replacement maps without changing historical records. |
| `context/DataContext.tsx` | Modify | Hydrate/publish a completed v2 library and expose ownership-safe catalog/import operations. |
| `app/exercise/create.tsx` | Modify | Disable immutable/default and non-owner definition edits; preserve explicit zero drafts. |
| `components/ExercisePicker.tsx`, `app/routine/[id].tsx` | Modify | Build/edit prescriptions rather than definitions and display retained snapshots. |
| `tests/exerciseCatalog.test.ts`, `tests/storage.test.ts`, `tests/dataContext.test.ts`, `tests/mesocycles.test.ts` | Modify/Create | Storage, migration, ownership, import, and projection seams. |

## Interfaces / Contracts

```ts
type DefinitionSource = { kind: 'system' } | { kind: 'custom'; owner: UserProfile; originId: string };
interface ExerciseDefinition { id: string; source: DefinitionSource; name: string; muscleGroups: MuscleGroup[]; loadMode: ExerciseLoadMode; loadUnit: LoadUnit; variant: string; defaultSets: CatalogSet[] }
interface RoutineExercisePrescription { id: string; definitionId?: string; snapshot: ExerciseDefinitionSnapshot; sets: RoutineSet[]; restSeconds?: number; notes?: string }
interface ImportPlan { recipient: UserProfile; definitions: ExerciseDefinition[]; routines: Routine[]; mesocycles: Mesocycle[] }
```

`commitImport(plan)` returns only after all replacement mappings and the journaled payload are durable; on error it returns no published changes. Read compatibility may synthesize a legacy snapshot when `definitionId` cannot resolve.

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit | 16-group validation, zero load, default immutability, custom ownership/dedupe, replacement-map completeness | Vitest table tests against pure validators/planner. |
| Storage | v1 migration/idempotence, journal recovery after each failed write, live-reference deletion/replacement, no attempt mutation | Mocked AsyncStorage failure injection (existing `tests/storage.test.ts` pattern). |
| Integration | DataContext exposes only committed hydration; routine/mesocycle import is all-or-nothing | Context test with two profiles and serialized mutation races. |
| UI | Protected edit/delete affordances and `0 kg` rendering | Existing React test-renderer style catalog tests. |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

On first v2 load, read v1 keys without deleting them, normalize valid legacy groups and preserve unresolved data as snapshots, stage v2, then mark committed. Retain v1 compatibility until a later explicitly approved cleanup release. A failed/partial journal is ignored or restored on next launch; the prior committed payload remains authoritative. Rollback is application downgrade reading retained v1 data, or v2 recovery without touching attempts/sessions.

## Open Questions

- [x] Initial system definitions: ship a curated standard catalog with stable IDs in `constants/exerciseDefinitions.ts`. System records are immutable; migration only canonicalizes conservative normalized-name matches and keeps unmatched legacy records readable as user-owned data.
- [x] Legacy attribution: migrate every noncanonical global legacy record into independent recipient-owned copies for both Rodaja and Brisas. Canonical defaults remain shared system data.
