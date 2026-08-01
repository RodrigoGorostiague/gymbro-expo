# Relationship Graph Specification

## Purpose

Provide a Postgres-authoritative graph.

## Requirements

### Requirement: Directed Requests and Reciprocal Relationships

The system MUST let authenticated, non-blocked members create, accept, reject, and cancel requests through trusted commands. Acceptance MUST atomically create reciprocal state, remove conflicts, and leave one classification.

#### Scenario: Accept a request

- GIVEN B requested A and neither blocks the other
- WHEN A accepts
- THEN both have the relationship and conflicts are removed

#### Scenario: Invalid request action

- GIVEN a missing request, self-target, or blocked pair
- WHEN a transition is requested
- THEN it is rejected without graph change

### Requirement: One Partner and Many Bros

The system MUST allow many Bros and one Partner. A new Partner MUST atomically replace the pair and demote displaced Partner pairs to Bros within one Postgres transaction.

#### Scenario: Partner replacement

- GIVEN A partners B and C is eligible
- WHEN A partners C
- THEN A-C partner and displaced pairs become Bros

#### Scenario: Concurrent Partner transitions

- GIVEN concurrent transitions share a member
- WHEN both run
- THEN one valid graph commits with one Partner maximum

### Requirement: Directed Blocking

The system MUST support directed blocks. A block MUST remove or prevent requests and deny discovery, search, profile access, Realtime visibility, and graph actions for that pair; unrelated relationships remain.

#### Scenario: Block a requester

- GIVEN B has a pending request involving A
- WHEN A blocks B
- THEN the request disappears and B cannot access or act on A

#### Scenario: Blocked graph command

- GIVEN A blocks B
- WHEN B requests a graph transition with A
- THEN it is denied without mutation

### Requirement: Trusted Commands and Database Enforcement

The system MUST authorize graph mutations through Supabase Edge Functions and trusted Postgres functions. RLS MUST require authentication, allow only eligible reads and owner private-profile writes, and deny direct client writes to relationship, request, block, and public-projection state.

#### Scenario: Authorized graph command

- GIVEN an authenticated caller meets preconditions
- WHEN the trusted command executes
- THEN all affected state commits or none does

#### Scenario: Direct client write or unauthorized read

- GIVEN a graph write or ineligible projection read
- WHEN RLS evaluates it
- THEN RLS denies it without data disclosure

### Requirement: Versioned Database Change Policy

The system MUST introduce schema, RLS, index, and trusted-function changes as ordered, forward-only SQL migrations. A rollback MUST use a compensating data-preserving migration; manual production SQL and destructive rollback are prohibited for the beta.

#### Scenario: Reversible schema correction

- GIVEN a released social schema change needs correction
- WHEN the team rolls it back
- THEN a new compensating migration preserves existing identity and graph records

#### Scenario: Unversioned database change

- GIVEN a proposed direct production schema or policy edit
- WHEN it is reviewed for the beta
- THEN it is rejected until represented by an ordered migration
