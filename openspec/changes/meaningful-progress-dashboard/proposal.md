# Proposal: Meaningful Progress Dashboard

## Intent

GymBro users need trustworthy feedback, not activity totals that imply improvement. Incomplete snapshots, weak completion rules, identity fallback, profile/storage coupling, and non-idempotent rewards undermine history. This change distinguishes **plan adherence**, **activity**, **performance improvement**, **muscle exposure**, and **global progress** as independent signals.

## Scope

### In Scope
- Profile-owned, versioned attempts and immutable analytics dimensions; preserve serialized history mutations.
- Global, routine, muscle, and exercise views comparing current and previous 7-day periods, with sparse/error/loading/empty states.
- External-load, bodyweight, and assisted modes; only compatible observations are compared.
- Responsive charts, textual summaries, screen-reader semantics, and supported sizes/orientations.

### Out of Scope
- Composite scores, physiological predictions, coaching, leaderboards, or cloud analytics.
- Replacing unrelated `exercise-catalog` CRUD/sharing requirements or redesigning workout-history editing.

## Product Rules

- Exercise improvement uses separate indicators; trends requiring repetition need at least two valid observations.
- Every exercise has one primary muscle plus optional secondary muscles. Non-additive exposure defaults to 100% primary and 40% **each** secondary; custom weights are allowed. Never present it as growth or sum it as global sets.
- All planned warm-up, work, and failure sets determine adherence. Stimulus, strength, and volume keep semantically unsuitable sets separate.
- Below 70% persists as partial: valid-set gems remain; completed-routine counts, fixed completion gems, 100% bonus, and weekly completion goals exclude it. At least 70% is complete.
- At 100%, add 25% of the entire eligible reward (set gems plus fixed completion reward), rounded to the nearest gem. Reward persistence prevents duplicate grants.
- Migration quarantines unowned legacy sessions once outside active profiles while preserving routines/exercises. Unknown dimensions are never fabricated.

## Capabilities

### New Capabilities
- `meaningful-progress-dashboard`: Explainable comparisons and accessible presentation.
- `workout-attempt-contract`: Ownership, completion, rewards, migration, and immutable history.
- `exercise-load-and-exposure`: Compatible load modes and weighted muscle exposure.

### Modified Capabilities
- None; active `exercise-catalog` requirements remain independently owned and must be reconciled, not overwritten.

## Approach and Affected Areas

Establish capture contracts before aggregation/presentation. Affects `types/index.ts`, `utils/storage.ts`, `context/DataContext.tsx`, `app/routine/execute/[id].tsx`, `utils/analytics.ts`, `app/(tabs)/progress.tsx`, `components/LineChart.tsx`, and `app/session/[id].tsx`.

## Dependencies and Delivery

Coordinate with active `exercise-catalog` identity/set-type/snapshot rules and preserve uncommitted history/session-detail work. Force-chained delivery must keep autonomous slices within the 800-line review budget.

## Risks and Rollback

Risks: accepted history loss, false precision, misclassification, duplicate rewards, date boundaries, and overlap. Mitigate with version guards, explicit labels, compatibility rules, idempotency, pure analytics tests, and staged reconciliation. Roll back by chained slice; quarantined legacy sessions merge with current data, with current IDs winning collisions.

## Success Criteria

- [ ] Every signal is profile-safe, explainable, mode-compatible, sparse-data-safe, and accessible.
- [ ] Completion/reward outcomes match all thresholds without duplicate gems.
- [ ] Migration preserves routines/exercises and quarantines unowned sessions at most once.
