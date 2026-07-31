# Active Workout Re-entry Specification

## Purpose

Allow a user to resume the correct owner-scoped active workout from routine entry surfaces while preserving planned-session attribution.

## Requirements

### Requirement: Matching Routine Continuation

Training and routine-detail entry surfaces MUST present a Continue affordance when the current owner has an active draft for the selected routine. Selecting Continue MUST route to that draft's workout attempt. These surfaces MUST retain their normal start affordance when no matching draft exists.

#### Scenario: Continue from Training

- GIVEN the current owner has an active draft for routine A
- WHEN Training renders the entry for routine A
- THEN the entry presents Continue
- AND selecting it routes to the active attempt for routine A.

#### Scenario: Continue from routine detail

- GIVEN the current owner has an active draft for routine A
- WHEN the owner opens routine A detail
- THEN the detail presents Continue for that draft.

### Requirement: Cross-Routine Re-entry Guard

An active draft MUST be eligible for continuation only when its owner and routine identifier match the entry target. An entry for another routine MUST NOT label the action Continue, route using the draft's attempt identity, or reuse the draft's state; it MUST preserve the selected routine's normal start behavior.

#### Scenario: Different routine is selected

- GIVEN the current owner has an active draft for routine A
- WHEN the owner opens an entry for routine B
- THEN the entry does not present Continue for routine A
- AND a start action targets routine B without draft identity or state.

#### Scenario: Draft belongs to another owner

- GIVEN a visible draft does not belong to the current owner
- WHEN the current owner opens its routine entry
- THEN no Continue affordance is presented for that draft.

### Requirement: Planned-Session Lineage-Safe Continuation

A mesocycle session card MUST present Continue only when the current owner's draft matches its routine ID and every lineage field: mesocycle ID, week number, and planned-session ID. Continue MUST preserve those exact lineage values. Any missing or unequal lineage value MUST be treated as a mismatch and MUST start the selected planned session without reusing the draft.

#### Scenario: Exact planned-session match

- GIVEN the current owner has a draft matching a card's routine and all lineage fields
- WHEN the card renders and the owner selects Continue
- THEN it routes to the active attempt
- AND the route retains the card's exact lineage values.

#### Scenario: Same routine with different planned session

- GIVEN the current owner has a draft for the card's routine but a different planned-session ID
- WHEN the card renders
- THEN it does not present Continue
- AND its start action targets the selected planned session without draft reuse.

#### Scenario: Missing lineage

- GIVEN a card or draft lacks one required lineage field
- WHEN the card renders
- THEN it does not present Continue
- AND it retains normal selected-session start behavior.
