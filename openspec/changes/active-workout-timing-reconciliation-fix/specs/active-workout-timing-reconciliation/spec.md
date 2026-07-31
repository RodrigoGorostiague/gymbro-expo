# Active Workout Timing Reconciliation Specification

## Purpose

Define timestamp-authoritative recovery of an owner's active-workout draft across route focus, app foregrounding, and restart.

## Requirements

### Requirement: Timestamp-Authoritative Reconciliation

The system MUST derive active-workout elapsed time from the persisted `startedAtMs` and the reconciliation-time wall clock. It MUST reconcile the current owner's draft when it is loaded after restart, when its execute route gains focus, and when the application becomes active. JavaScript intervals MAY repaint a focused foreground screen but MUST NOT establish elapsed-time correctness.

#### Scenario: Restart restores elapsed time

- GIVEN an owner has a valid persisted draft started 90 seconds ago
- WHEN the application loads the owner's draft after restart
- THEN the published elapsed time is 90 seconds from the reconciliation clock

#### Scenario: Focus catches up without ticks

- GIVEN the execute route was unfocused for 45 seconds and no interval ran
- WHEN the route gains focus
- THEN the displayed elapsed time includes the 45 elapsed seconds

#### Scenario: Foreground catches up without background execution

- GIVEN the application was backgrounded with an active draft
- WHEN AppState becomes active
- THEN elapsed time is recalculated from persisted timestamps

### Requirement: Rest Deadline Reconciliation

The system MUST derive remaining rest from persisted `restEndsAtMs` and the reconciliation-time wall clock. When the deadline is reached or passed, it MUST clear `restEndsAtMs` persistently and publish no active rest; repeated reconciliation MUST NOT recreate or re-complete that rest period.

#### Scenario: Future rest resumes accurately

- GIVEN a draft has a rest deadline 20 seconds in the future
- WHEN reconciliation runs after focus or foregrounding
- THEN the published remaining rest is 20 seconds

#### Scenario: Expired rest is cleared once

- GIVEN a draft has a rest deadline one second in the past
- WHEN reconciliation runs
- THEN the persisted and published draft has no rest deadline
- AND a later reconciliation reports no active rest

### Requirement: Five-Hour Draft Expiry

The system MUST remove an owner's active-workout draft at or after `startedAtMs + 5 hours`. Reconciliation MUST perform this removal on load, route focus, and AppState activation without relying on a background expiry loop. Cleanup and publication MUST verify the owner and attempt identity so a late operation cannot remove or restore a different draft.

#### Scenario: Exact expiry boundary

- GIVEN a persisted draft started exactly five hours earlier
- WHEN reconciliation runs
- THEN the owner has no persisted or published active draft

#### Scenario: Pre-expiry draft remains available

- GIVEN a persisted draft started four hours, 59 minutes, and 59 seconds earlier
- WHEN reconciliation runs
- THEN the same owner and attempt draft remains active

#### Scenario: Late cleanup preserves replacement

- GIVEN reconciliation targets an expired attempt and a newer attempt replaces it
- WHEN the expired cleanup completes
- THEN the newer attempt remains persisted and published
