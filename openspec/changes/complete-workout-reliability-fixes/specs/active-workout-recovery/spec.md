# Active Workout Recovery Specification

## Purpose
Provide durable, profile-isolated execution recovery without promising background timer execution.

### Requirement: Owner-scoped draft lifecycle
The system MUST persist one validated active-workout draft per owner, restore workout inputs and rest state after navigation or restart, and expose explicit cancellation. Navigation MUST NOT clear a draft; cancellation MUST clear only its owner; a successful completion MUST clear it only after its durable commit.

#### Scenario: Restore after restart
- GIVEN an owner with an active draft
- WHEN the app restarts and that owner opens the workout
- THEN saved inputs and rest state are restored.

#### Scenario: Profile isolation and cancellation
- GIVEN drafts for two profiles
- WHEN one profile cancels its workout
- THEN only that profile's draft is removed.

### Requirement: Timestamp reconciliation
The system MUST calculate elapsed display from validated persisted timestamps after foregrounding or restart, SHALL tolerate platform timer suspension, and MUST NOT claim guaranteed background execution.

#### Scenario: Suspended timer
- GIVEN a workout persisted at time T
- WHEN the app resumes at later time U
- THEN elapsed time reflects U minus T within supported clock semantics.
