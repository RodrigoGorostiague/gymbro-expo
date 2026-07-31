# Workout Completion Specification

## Workout Completion — Delta

### Requirement: Immutable idempotent completion
The system MUST create at most one immutable attempt/history snapshot for a completion identity, MUST commit that snapshot before clearing its draft, and MUST NOT alter historical attempts.

#### Scenario: Repeated completion request
- GIVEN a completed workout identity
- WHEN completion is submitted again
- THEN exactly one history attempt exists.

### Requirement: Future template carry-forward
After a successful completion, the system MUST propagate the completed snapshot only to matching eligible future routine defaults and MUST preserve past attempts and unrelated templates.

#### Scenario: Matching future routine
- GIVEN matching future defaults and an immutable completed snapshot
- WHEN completion commits
- THEN eligible future defaults reflect the snapshot without changing history.
