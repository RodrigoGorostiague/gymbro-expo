# Proposal: Catalog Social Foundation

## Intent
Establish the Release 1 Phase 0 data foundation so training content has stable identity, ownership, safe sharing/import, and faithful historical records before any social product surface is built.

## Scope

### In Scope
- Support `0 kg` as an intentional prescription and execution value.
- Canonicalize the existing 16 muscle groups and validate local/imported values.
- Introduce immutable default exercise definitions and owner-scoped custom definitions.
- Keep routine exercise prescriptions mutable: sets, repetitions, load, rest, and notes.
- Safely delete custom definitions without dangling live references; retain historical snapshots.
- Atomically import exercise, routine, and mesocycle graphs with validation, dedupe, recipient ownership, replacement mapping, and recovery.
- Migrate existing persisted data non-destructively.

### Out of Scope
- Accounts, profiles, social graph, feed, joint workouts, duels, economy, and social UI.
- Retroactive mutation or deletion of workout attempts, routines, or schedules.

## Capabilities

### New Capabilities
- `catalog-data-integrity`: Canonical muscle groups, immutable defaults, owned custom exercises, mutable prescriptions, zero-load fidelity, deletion safety, and compatibility migration.
- `training-content-imports`: Atomic, recipient-owned transitive imports with canonical dedupe, dependency validation, replacement mapping, and recovery.

### Modified Capabilities
None.

## Approach
Version storage around stable catalog identities and provenance. First resolve and validate the complete import graph into a replacement map; then commit all entities with a journal/commit marker and publish hydrated state only after success. Compatibility readers preserve unresolved legacy snapshots while migration normalizes safely.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `types/index.ts` | Modified | Provenance, identities, prescriptions, legacy compatibility |
| `constants/muscleGroups.ts` | Modified | Canonical group catalog |
| `utils/storage.ts` | Modified | Migration, validation, journaled atomic commits |
| `context/DataContext.tsx` | Modified | Ownership-aware hydration/import APIs |
| `utils/mesocycles.ts` | Modified | Replacement-map reference rewrites |
| Exercise/routine/execute UI | Modified | Protected definitions and `0 kg` display |
| Catalog/storage/workout tests | Modified | Migration, rollback, deletion, dedupe coverage |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Partial AsyncStorage writes | Med | Journaled recovery; publish only committed state |
| Legacy data loss or altered history | Med | Versioned compatibility readers and snapshot-preservation tests |
| Global-to-owned data leakage | Med | Explicit ownership validation in hydration and imports |

## Rollback Plan
Retain legacy-readable storage during the migration window. On failure, restore the prior catalog version or ignore an incomplete journal; never rewrite historical attempts.

## Dependencies
- Existing AsyncStorage persistence and Vitest test suite.

## Success Criteria
- [ ] `0` persists and renders as a deliberate load.
- [ ] Default definitions cannot be edited or deleted; prescriptions remain editable.
- [ ] Invalid/imported duplicates resolve deterministically without partial state.
- [ ] Existing catalog, routines, mesocycles, and attempts remain accessible after migration.
