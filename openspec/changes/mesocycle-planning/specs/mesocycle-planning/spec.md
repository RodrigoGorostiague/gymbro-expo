# Mesocycle Planning Specification

## Purpose

Define mesocycles as first-class multi-week plans built from reusable routines, while keeping execution and routine authorship separate.

## Requirements

### Requirement: Dedicated Mesocycle Entity
The system MUST provide a mesocycle module with its own entity, independent from the routine template model.

#### Scenario: Create planning block
- GIVEN a user has routines in the library
- WHEN the user creates a mesocycle
- THEN the system stores mesocycle metadata separately from routines
- AND the mesocycle can define name, goal, status, weeks, and optional start date

#### Scenario: Exclude roadmap behavior
- GIVEN a user is viewing mesocycle options
- WHEN the MVP is evaluated
- THEN automation, adherence tracking, analytics, reminders, sharing, and AI progression MUST NOT be required

### Requirement: Week-Based Planned Sessions
The system MUST let each mesocycle contain weeks with planned sessions that reference routines by `routineId` and store planning-only metadata.

#### Scenario: Reuse routine across weeks
- GIVEN one routine exists in the library
- WHEN the user plans sessions in multiple weeks
- THEN the same routine MAY be referenced multiple times by ID
- AND each session can store day label, suggested order, progression note, and optional note

#### Scenario: Routine reference unavailable
- GIVEN a planned session references a routine that is deleted, hidden, or unavailable
- WHEN the mesocycle is opened
- THEN the session MUST remain visible as unavailable
- AND the system MUST degrade gracefully without blocking mesocycle access

### Requirement: Mesocycle Persistence
The system MUST persist mesocycles and their nested weeks/sessions as a data set parallel to routine storage.

#### Scenario: Restore saved mesocycle
- GIVEN a user saved a mesocycle
- WHEN app data is reloaded
- THEN the mesocycle, weeks, statuses, and routine references MUST be restored intact

#### Scenario: Delete mesocycle only
- GIVEN a mesocycle references library routines
- WHEN the user deletes the mesocycle
- THEN the mesocycle data MUST be removed
- AND referenced routines MUST remain unchanged in the library

### Requirement: Planning Status Model
The system MUST support planning-only mesocycle block status values that do not imply workout completion tracking.

#### Scenario: Update block status
- GIVEN a mesocycle exists
- WHEN the user changes its status
- THEN the status MUST update on the mesocycle record
- AND no session completion or adherence record is created
