# Training Content Imports Specification

## Purpose
Safely copy validated exercise, routine, and mesocycle dependency graphs into a recipient library.

## Resolved Ownership Policy
Legacy noncanonical global content MUST be materialized as independent recipient-owned copies for both Rodaja and Brisas. Canonical system definitions remain shared and are deduplicated by stable ID.

## Requirements

### Requirement: Complete Graph Validation and Atomic Import
The system MUST validate the complete transitive dependency graph before commit and MUST apply an import all-or-nothing, recovering incomplete commits without publishing partial state.

#### Scenario: Import valid graph
- GIVEN a valid mesocycle graph with referenced routines and exercises
- WHEN it is imported
- THEN all graph entities are available to the recipient together

#### Scenario: Reject invalid dependency
- GIVEN an import graph with a missing or invalid dependency
- WHEN validation runs
- THEN no imported entity or reference is persisted

### Requirement: Canonical Dedupe and Replacement Map
The system MUST deterministically deduplicate canonical entities and MUST rewrite imported references through a replacement map to their recipient-visible identities.

#### Scenario: Reuse equivalent entity
- GIVEN an import containing an entity canonically equivalent to one already available
- WHEN it is imported
- THEN one canonical entity is retained and all imported references resolve to it

### Requirement: Recipient Ownership and Source Independence
The system MUST assign imported noncanonical content to the recipient and MUST NOT require or retain source-user ownership or source-profile references for recipient use.

#### Scenario: Use copied content independently
- GIVEN a recipient imports a routine graph
- WHEN the source becomes unavailable
- THEN the recipient can read, edit, schedule, and execute the copied content
