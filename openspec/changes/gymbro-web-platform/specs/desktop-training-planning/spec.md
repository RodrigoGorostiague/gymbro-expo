# Desktop Training Planning Specification

## Purpose

Define safe browser authoring of the authenticated user's routines and mesocycles.

## Requirements

### Requirement: Owned Plan Authoring

The system MUST let an authenticated owner create and edit valid routines and mesocycles, MUST enforce ownership on every read and mutation, and MUST reject invalid references, duplicate identities, or mesocycles outside 1–52 weeks.

#### Scenario: Create a valid mesocycle
- GIVEN an authenticated owner and valid owned routine references
- WHEN the owner saves a 1–52 week mesocycle
- THEN the system MUST persist it in the owner's shared training library

#### Scenario: Mutate another user's plan
- GIVEN an authenticated user identifies another user's plan
- WHEN the user attempts a mutation
- THEN the server MUST deny it without changing the plan

### Requirement: Concurrent Editing Without Lost Updates

Each mutable planning state MUST carry a concurrency version. A write MUST apply only to its expected version and MUST advance the version atomically. A stale write MUST NOT overwrite newer mobile or web changes and MUST return conflict data sufficient to reload and reconcile.

#### Scenario: Current-version write
- GIVEN web and server hold the same plan version
- WHEN the owner submits a valid edit
- THEN the system MUST apply it once and advance the version

#### Scenario: Stale cross-client write
- GIVEN mobile saved a newer version after web loaded the plan
- WHEN web submits its stale edit
- THEN the system MUST reject it and preserve the mobile change

### Requirement: Lifecycle and Content Versioning

The system MUST enforce mesocycle lifecycle transitions and completion eligibility. Content already used or protected by history MUST be copied into a new version rather than mutated in place; lineage MUST remain traceable. Imported mesocycles MUST begin as draft without a start date.

#### Scenario: Revise used content
- GIVEN a routine or mesocycle is protected by prior use
- WHEN the owner edits its prescription
- THEN the system MUST create a new linked version and preserve the prior version

#### Scenario: Invalid lifecycle transition
- GIVEN a mesocycle cannot legally enter the requested state
- WHEN the owner requests that transition
- THEN the system MUST reject it without changing lifecycle state

### Requirement: Deletion and Browser Recovery

Deletion MUST preserve versions or references required by history and MUST clearly reject unsafe deletion. Unsaved browser edits SHOULD survive recoverable reloads, but restored edits MUST be revalidated against current server version before saving.

#### Scenario: Delete referenced content
- GIVEN a plan version is required by protected history
- WHEN the owner requests deletion
- THEN the system MUST preserve required history and report the denied or constrained deletion

#### Scenario: Recover stale browser edits
- GIVEN recoverable local edits and a newer server version
- WHEN the user restores and saves them
- THEN the system MUST require reconciliation and MUST NOT overwrite server changes

### Requirement: Planning Scope Boundary

Planning MUST NOT start workouts, timers, execution drafts, joint-live sessions, or live collaborative editing.

#### Scenario: Plan a session
- GIVEN an authenticated owner edits a planned session
- WHEN the edit is saved
- THEN the system MUST update planning data without creating execution state
