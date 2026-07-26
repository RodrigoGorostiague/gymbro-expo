# Workout Attempt Contract Specification

## Purpose

Define profile-safe attempts, adherence, rewards, and durable history.

## Requirements

### Requirement: Profile-Owned Versioned Attempts

Every new attempt MUST record its owner and schema version. Storage MUST expose only the active profile's attempts.

#### Scenario: Profile isolation
- GIVEN two profiles have recorded attempts
- WHEN either profile loads workout history
- THEN only attempts owned by that profile are returned

#### Scenario: One-time legacy quarantine
- GIVEN unowned legacy sessions and preserved routines/exercises exist
- WHEN the migration first reaches the quarantine version
- THEN it MUST durably quarantine unowned sessions outside active profiles before recording completion
- AND quarantine failure MUST leave the session store unchanged and expose retry
- AND later loads MUST preserve owned/versioned sessions, routines, and exercises
- AND rollback MUST merge quarantine with current sessions, preferring current data on ID collision

### Requirement: Immutable Completion Snapshot

At finish, an attempt MUST snapshot routine/exercise/set identities, recorded labels, set types, planned values, actual performance, analytics dimensions, adherence outcome, and reward outcome. Renames, deletion, or source edits MUST NOT rewrite this snapshot.

#### Scenario: Source entities change
- GIVEN an attempt snapshots a routine and its exercises
- WHEN either source entity is renamed, edited, or deleted
- THEN the attempt retains its recorded identity, label, and dimensions

#### Scenario: Unknown legacy dimension
- GIVEN retained data lacks a trustworthy dimension
- WHEN the attempt is read
- THEN the dimension MUST remain unknown rather than inferred from current entities

### Requirement: Valid Sets and Adherence

Adherence MUST equal valid completed planned sets divided by all planned warm-up, work, and failure sets. A valid set MUST belong to the snapshot plan, be marked performed, and contain mode-valid actual performance; failure sets MUST record actual repetitions. Under 70% is `partial`, 70–99% is `completed`, and 100% is `fully-completed`.

#### Scenario: Threshold classification
- GIVEN attempts achieve 69%, 70%, 99%, and 100% adherence
- WHEN they finish
- THEN statuses MUST be partial, completed, completed, and fully-completed respectively

#### Scenario: Failure performance
- GIVEN a planned failure set has no target repetitions
- WHEN it is performed for 8 repetitions
- THEN it is valid and snapshots 8 actual repetitions

#### Scenario: Zero-set routine
- GIVEN a routine has zero planned sets
- WHEN an attempt finishes
- THEN adherence MUST be 0% and status MUST be partial

### Requirement: Idempotent Gem and Goal Policy

Each valid set MAY earn its set gem. At adherence >=70%, the attempt MUST earn the fixed completion reward and qualify for completed-routine counts and weekly completion goals. At 100%, it MUST additionally earn 25% of set gems plus fixed reward, rounded to the nearest integer. Reward application MUST be idempotent.

#### Scenario: Partial reward
- GIVEN a partial attempt contains valid sets
- WHEN rewards are finalized
- THEN set gems remain, but fixed reward, bonus, completed count, and weekly qualification MUST be excluded

#### Scenario: Full reward rounding
- GIVEN a fully-completed attempt has 7 set gems and a fixed reward of 5
- WHEN rewards are finalized
- THEN the 25% bonus MUST be 3 gems

#### Scenario: Duplicate finalization
- GIVEN an attempt's reward outcome was applied
- WHEN finalization is retried
- THEN no gems, counts, or weekly-goal credit MUST be granted again

### Requirement: Historical Mutation Compatibility

Permitted history edits MUST update editable recorded results and period placement through serialized, persistence-first mutation. They MUST NOT alter snapshot structure, finalized adherence/status, reward outcome, or previously applied gems.

#### Scenario: Edit historical results
- GIVEN a persisted attempt has a finalized reward
- WHEN its allowed date, duration, rest, or actual set results are edited successfully
- THEN analytics MAY reflect edited fields while completion and reward snapshots remain unchanged

#### Scenario: Failed or structural edit
- GIVEN an edit fails persistence or changes routine/exercise/set identity
- WHEN the mutation is attempted
- THEN the system MUST reject it without publishing partial state
