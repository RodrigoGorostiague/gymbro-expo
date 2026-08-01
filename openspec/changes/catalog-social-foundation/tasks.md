# Tasks: Catalog Social Foundation — Phase 0

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1,100–1,450 |
| 800-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Library/migration -> import graph -> UI/context |
| Delivery strategy | single PR with maintainer-approved `size:exception` |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Resolved Data Policies

- Initial catalog: curated standard immutable system definitions with stable IDs; only conservative normalized-name legacy matches are canonicalized and unmatched records stay readable as user-owned data.
- Legacy attribution: noncanonical global content is copied independently for Rodaja and Brisas; canonical defaults remain shared system data.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | v2 definitions, migration, deletion | PR 1 | `npm test -- --run tests/exerciseCatalog.test.ts tests/storage.test.ts` | Vitest AsyncStorage failure injection | v2 catalog keys/types/constants |
| 2 | atomic recipient-owned graph import | PR 2 | `npm test -- --run tests/storage.test.ts tests/mesocycles.test.ts` | Import valid/invalid mesocycle graph | import planner, journal, map rewrite |
| 3 | context and prescription UI | PR 3 | `npm test -- --run tests/dataContext.test.ts tests/exerciseCatalog.test.ts` | React runtime harness: edit and render `0 kg` | DataContext and catalog/routine screens |

## Phase 0.1: Contract and migration

- [x] 0.1.1 RED: extend `tests/exerciseCatalog.test.ts`/`tests/storage.test.ts` for 16-group acceptance/rejection, `0 kg`, default immutability, custom ownership, referenced deletion, and preserved attempt snapshots.
- [x] 0.1.2 Implement `constants/muscleGroups.ts`, `constants/exerciseDefinitions.ts`, and v2 definition/prescription/import types in `types/index.ts`.
- [x] 0.1.3 Implement `utils/storage.ts` compatibility read, idempotent v1->v2 staging/journal recovery, committed hydration, and safe custom deletion/replacement without attempt mutation.

## Phase 0.2: Recipient import graph

- [x] 0.2.1 RED: add invalid edge/group/owner/conflicting-default, canonical-dedupe, complete-map, atomic-failure, and source-independence cases to `tests/storage.test.ts` and `tests/mesocycles.test.ts`.
- [x] 0.2.2 Implement pure graph validation, recipient IDs/ownership, deterministic definition dedupe, and journaled `commitImport` in `utils/storage.ts`.
- [x] 0.2.3 Implement routine-ID replacement-map projection in `utils/mesocycles.ts`; retain routine and attempt snapshots when references cannot resolve.

## Phase 0.3: Context and prescription UX

- [x] 0.3.1 RED: add `tests/dataContext.test.ts` and `tests/exerciseCatalog.test.ts` cases proving only committed state hydrates, race serialization, protected actions, mutable prescriptions, and `0 kg` rendering.
- [x] 0.3.2 Update `context/DataContext.tsx` to expose completed-library, owner-safe catalog, deletion, and import operations only after recovery.
- [x] 0.3.3 Update `app/exercise/create.tsx`, `components/ExercisePicker.tsx`, and `app/routine/[id].tsx` to protect definitions, edit prescriptions, and retain snapshots/explicit zero loads.

## Phase 0.4: Verification

- [x] 0.4.1 Run the three focused work-unit commands, then `npm test`; record journal-failure and two-profile import evidence.
- [x] 0.4.2 Refactor duplicate validation only after all RED cases pass; exclude accounts, feeds, sharing UI, and other social scopes.
