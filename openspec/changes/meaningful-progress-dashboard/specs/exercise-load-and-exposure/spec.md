# Exercise Load and Exposure Specification

## Purpose

Define identity, muscle exposure, and compatible performance observations.

## Requirements

### Requirement: Stable Historical Identity

Exercises and routines MUST have stable identities, and attempts MUST preserve identities and recorded names. Analytics MUST group versioned data by identity, never by name.

#### Scenario: Renamed entity
- GIVEN an exercise or routine is renamed after an attempt
- WHEN history is filtered
- THEN old and new labels remain associated with the same stable identity

#### Scenario: Deleted or recreated entity
- GIVEN an entity with recorded attempts is deleted and another is created with the same name
- WHEN history is listed
- THEN the deleted identity remains filterable and MUST NOT merge with the new identity

### Requirement: Primary and Secondary Muscle Exposure

Every exercise MUST have exactly one primary muscle and MAY have distinct secondary muscles. Each muscle MAY have a custom non-negative exposure weight; absent weights MUST default to 100% for primary and 40% for each secondary.

#### Scenario: Default exposure
- GIVEN an exercise has one primary and two secondary muscles without custom weights
- WHEN one eligible set is aggregated
- THEN exposures MUST be 1.0, 0.4, and 0.4 respectively

#### Scenario: Custom exposure
- GIVEN valid custom weights exist
- WHEN muscle exposure is aggregated
- THEN those recorded weights MUST replace defaults for that exercise snapshot

#### Scenario: Invalid attribution
- GIVEN an exercise has zero or multiple primary muscles, duplicate muscles, or a negative weight
- WHEN it is saved
- THEN the system MUST reject it

### Requirement: Recorded Load Modes

Every performance observation MUST snapshot exactly one mode: `external-load`, `bodyweight`, or `assisted`, with its unit and mode-required actual values. Historical preference changes MUST NOT reinterpret them.

#### Scenario: External-load observation
- GIVEN an external-load set is performed
- WHEN it is recorded
- THEN repetitions, external load, and unit MUST be snapshotted

#### Scenario: Bodyweight observation
- GIVEN a bodyweight set is performed
- WHEN it is recorded
- THEN repetitions and the contemporaneous bodyweight MUST be snapshotted

#### Scenario: Assisted observation
- GIVEN an assisted set is performed
- WHEN it is recorded
- THEN repetitions, assistance amount, and unit MUST be snapshotted

### Requirement: Compatible Comparison Boundaries

Trend comparisons MUST include only observations with the same stable exercise identity, load mode, unit semantics, and required known values. The system MUST keep load, repetitions, and assistance as explainable indicators and MUST NOT compare raw values across incompatible modes.

#### Scenario: Compatible observations
- GIVEN repeated observations share identity, mode, unit semantics, and required values
- WHEN a trend is requested
- THEN they MAY be compared as separate recorded performance indicators

#### Scenario: Mode or unit mismatch
- GIVEN observations differ by load mode or incompatible units
- WHEN a trend is requested
- THEN they MUST be separated or marked incompatible, not merged into a trend

#### Scenario: Missing legacy semantics
- GIVEN a legacy observation lacks identity, mode, unit, or required values
- WHEN performance comparison is requested
- THEN it MUST be excluded from that comparison without fabricated defaults

### Requirement: Non-Additive Exposure Semantics

Muscle exposure MUST be labeled as weighted exposure, not growth or global set count. Per-muscle weighted values MUST NOT be summed to derive global completed sets.

#### Scenario: Multi-muscle global aggregation
- GIVEN one set contributes to primary and secondary exposure
- WHEN global valid sets are calculated
- THEN it counts once globally while retaining each muscle's weighted exposure

### Requirement: Catalog Contract Preservation

This capability MUST extend snapshots without replacing exercise-catalog CRUD, routine snapshot isolation, set-type ownership, or sharing behavior.

#### Scenario: Catalog or routine mutation
- GIVEN an existing catalog or routine snapshot is edited or deleted
- WHEN load and exposure history is read
- THEN existing catalog behavior and recorded historical dimensions MUST both remain intact
