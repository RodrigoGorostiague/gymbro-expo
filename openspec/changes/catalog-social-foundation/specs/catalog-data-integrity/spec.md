# Catalog Data Integrity Specification

## Purpose
Preserve canonical exercise definitions while allowing safe, owner-scoped training prescriptions and legacy data access.

## Resolved Migration Policies
- The initial system catalog is a curated standard set of immutable definitions with stable IDs.
- Migration only maps conservative normalized-name legacy matches to system definitions. Unmatched legacy records remain readable user-owned data.
- Legacy noncanonical global content becomes independent owned copies for both Rodaja and Brisas; shared system defaults are not duplicated.

## Requirements

### Requirement: Canonical Muscle Groups
The system MUST accept and persist only the defined canonical muscle-group IDs for new or imported catalog and routine content.

#### Scenario: Normalize accepted ID
- GIVEN a valid canonical muscle-group ID
- WHEN content is saved or imported
- THEN the canonical ID is retained

#### Scenario: Reject unknown ID
- GIVEN an unknown or display-label muscle group
- WHEN content is submitted
- THEN the operation fails without changing stored content

### Requirement: Zero-Load Fidelity
The system MUST persist and render a set load of `0 kg` as an explicit value, distinct from missing load.

#### Scenario: Render zero load
- GIVEN a prescribed or recorded set with load `0` and unit `kg`
- WHEN the set is reopened or displayed
- THEN it shows `0 kg`

### Requirement: Definition Identity and Mutable Prescriptions
The system MUST keep default exercise definition identity, name, muscle groups, and type immutable; it MUST permit routine prescriptions to edit sets, repetition scheme, load, rest, and notes without changing that definition. Custom definitions MUST be owner-scoped.

#### Scenario: Edit routine prescription
- GIVEN a routine using a default definition
- WHEN its prescription is edited
- THEN the routine changes and the default definition does not

#### Scenario: Protect default definition
- GIVEN a default exercise definition
- WHEN an edit targets its protected fields
- THEN the edit is rejected

### Requirement: Custom Definition Deletion Safety
The system MUST block deletion of a custom definition with live routine or scheduled references, and MUST retain historical workout snapshots after an allowed deletion.

#### Scenario: Block referenced deletion
- GIVEN a custom definition referenced by an active routine
- WHEN deletion is requested
- THEN deletion fails and references remain intact

#### Scenario: Preserve history
- GIVEN a custom definition referenced only by a historical attempt
- WHEN it is deleted
- THEN the attempt remains readable from its snapshot

### Requirement: Non-destructive Legacy Compatibility
The system MUST migrate legacy catalog, routine, mesocycle, and attempt data without deleting, retroactively rewriting, or making unresolved legacy snapshots inaccessible.

#### Scenario: Read legacy content
- GIVEN persisted legacy content with resolvable and unresolved references
- WHEN the application hydrates it
- THEN resolvable data is normalized and unresolved snapshots remain readable
