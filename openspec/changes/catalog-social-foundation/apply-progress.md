# Apply Progress: Catalog Social Foundation

## Status
Complete. Phase 0 canonical-definition, migration/deletion/import, context/prescription UI, and final verification work are implemented and proven.

## Execution Mode
- Standard mode (`strict_tdd: false`)
- Delivery: single PR, maintainer-approved `size:exception`
- Native attempt: `catalog-foundation-final-evidence`, max-attempts 1, max-changed-lines 200. This verification-only work unit made no source changes.

## Resolved Policies
- Ship curated immutable system definitions with stable IDs; only conservative normalized-name legacy matches may resolve to them.
- Preserve unmatched legacy records as readable user-owned data.
- Materialize noncanonical global legacy records as independent owned copies for Rodaja and Brisas; system defaults remain shared.

## Work Unit Evidence
| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm test -- --run tests/storage.test.ts tests/catalogLibrary.test.ts` — PASS: 2 files, 16 tests. The initial RED command (`npm test -- --run tests/storage.test.ts`) failed with 3 missing storage APIs before implementation. |
| Runtime harness command/scenario and exact result | Vitest AsyncStorage failure injection — PASS: a forced `@gymbro/catalog-library/v2/brisas` write failure retained the journal; the next library load recovered both owner payloads and removed the journal. `npx tsc --noEmit` — PASS. |
| Rollback boundary | `utils/storage.ts` catalog-library keys/migration/deletion APIs and `tests/storage.test.ts`; revert together without changing retained v1 catalog, routines, mesocycles, or attempts. |

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm test -- --run tests/storage.test.ts tests/catalogLibrary.test.ts tests/mesocycles.test.ts` — PASS: 3 files, 23 tests. |
| Runtime harness command/scenario and exact result | Mocked AsyncStorage import write failure — PASS: `commitCatalogLibraryImport` leaves its journal after the recipient write fails; the next `loadCatalogLibrary('brisas')` recovers the complete routine graph and clears the journal. `npx tsc --noEmit` — PASS. |
| Rollback boundary | `utils/catalogLibrary.ts`, `utils/mesocycles.ts`, `utils/storage.ts`, catalog import types, and their three focused tests; revert together to remove imports without touching retained v1 data, attempts, or Phase 0.1 migration/deletion behavior. |

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm test -- --run tests/dataContext.test.ts tests/exerciseCatalog.test.ts` — PASS: 2 files, 20 tests. |
| Runtime harness command/scenario and exact result | React test-renderer `DataProvider` harness — PASS: it hydrates the committed Rodaja library, retains a routine definition snapshot, exposes `0` as the draft prescription, rejects system-definition deletion, and rejects a Brisas-targeted import before publishing. `npx tsc --noEmit` — PASS. |
| Rollback boundary | `context/DataContext.tsx`, `app/(tabs)/exercises/index.tsx`, `app/exercise/create.tsx`, `app/routine/[id].tsx`, `utils/decimalInput.ts`, and context/UI harness tests; revert together to restore legacy context hydration without changing the stored v2 migration/import foundation. |

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm test -- --run tests/exerciseCatalog.test.ts tests/storage.test.ts` — PASS: 2 files, 32 tests. `npm test -- --run tests/storage.test.ts tests/catalogLibrary.test.ts tests/mesocycles.test.ts` — PASS: 3 files, 23 tests. `npm test -- --run tests/dataContext.test.ts tests/exerciseCatalog.test.ts` — PASS: 2 files, 20 tests. |
| Runtime harness command/scenario and exact result | Vitest AsyncStorage failure-injection scenarios — PASS: a failed Brisas library write retains the journal and the next load recovers both owner libraries; a failed recipient import write retains the journal and the next Brisas load recovers the full import. Two-profile migration/import assertions prove independent Rodaja and Brisas custom copies, recipient-local routine/mesocycle references, and source-independence. React test-renderer `DataProvider` harness — PASS: committed owner hydration, retained snapshots, explicit `0 kg`, protected system deletion, and mismatched-recipient rejection. |
| Full verification | `npm test` — PASS: 16 files, 133 tests. `npx tsc --noEmit` — PASS (exit 0). |
| Refactor decision | No duplicate-validation refactor was needed: all existing RED cases pass and no production code was changed. Accounts, feeds, sharing UI, and other social scopes were excluded. |
| Rollback boundary | Only `openspec/changes/catalog-social-foundation/tasks.md` and `openspec/changes/catalog-social-foundation/apply-progress.md` were changed by this work unit; reverting them restores the pre-verification artifact state without touching Phase 0 source behavior. |

## Completed Tasks
- [x] 0.1.1 Storage regression coverage for canonical foundation, zero loads, ownership, deletion, attempts, and journals.
- [x] 0.1.2 Canonical v2 definition/prescription/import contracts.
- [x] 0.1.3 Non-destructive v1-to-v2 storage migration, journal recovery, and safe custom deletion.
- [x] 0.2.1 Import graph regression coverage for invalid dependencies, invalid canonical data, owner mismatch, immutable default conflicts, dedupe, mapping, recovery, and source independence.
- [x] 0.2.2 Recipient-owned graph planner and journaled import commit.
- [x] 0.2.3 Routine-ID replacement projection for imported mesocycles without source share references.
- [x] 0.3.1 Context and UI regression coverage for committed owner libraries, protected definitions, and explicit zero prescriptions.
- [x] 0.3.2 Completed-library hydration plus owner-safe delete and import APIs through `DataContext`.
- [x] 0.3.3 Immutable definition affordances, routine prescription snapshots, and `0 kg` input fidelity.
- [x] 0.4.1 Final focused/full verification with migration journal recovery and two-profile import evidence.
- [x] 0.4.2 Duplicate-validation assessment after passing RED cases; no refactor required and social scope excluded.

11/11 complete.

## Remaining Work
None. Phase 0 is ready for independent SDD verification.

## Native Attempt
- Generation 1, ordinal 1: `storage-migration-and-safe-deletion`.
- Limits: one attempt, 800 changed lines; delivery remains maintainer-approved single-PR `size:exception`.
- Finished `passed`; evidence revision `sha256:a2a2502f072b4b494d1fef5020be7bb8b646c19d2b892f4348204227561a4bb5`.
- Native diagnosis: durable v1→v2 owner libraries with journal recovery, zero-load preservation, and safe custom deletion.
- Native process evidence: focused storage/catalog-library tests passed (16 tests), TypeScript passed, and the unrelated full-suite AuthProvider harness failures were recorded.
- Generation 2, ordinal 2: `atomic-training-content-imports` — passed with 236 changed lines and evidence revision `sha256:0684e6214e80424be76a229e6b322e97421759d8e85c3c3bf0bf29663fda77cd`.
- Limits: one attempt, 800 changed lines; delivery remains maintainer-approved single-PR `size:exception`.
- Native process evidence: focused import tests passed (3 files, 23 tests), TypeScript passed, and the full suite retained 8 unrelated AuthProvider harness failures.
- Generation 3, ordinal 3: `catalog-context-and-prescription-ui` — passed with 346 changed lines and evidence revision `sha256:0f7585d672d2d81f14a212a6e3cec0044e7c15e77d18a8494e9c6c2080421b17`.
- Native process evidence: focused context/UI tests passed (2 files, 20 tests); the combined catalog work-unit suites passed (5 files, 43 tests); `npm test` passed (16 files, 133 tests); and TypeScript passed.
- Final verification work unit: `catalog-foundation-final-evidence`, one permitted attempt and 200 changed-line limit. The three prescribed focused commands passed (32, 23, and 20 tests respectively); full `npm test` passed (16 files, 133 tests); and `npx tsc --noEmit` passed. No source changes were necessary.
