## Exploration: active-workout-reentry-fix

### Current State
Owner-scoped, validated active drafts are hydrated by `DataContext` and the execute screen now persists start, input/set/rest changes, then clears only after successful completion or explicit cancellation. The unfinished reliability change deliberately leaves re-entry surfaces, lineage-aware mesocycle routing, and its dedicated regression test incomplete.

Training still routes `Entrenar` directly to a new execute route. Routine detail likewise has no continuation path. Mesocycle summary routes every runnable planned session to execute with lineage parameters, but does not compare them to the active draft; consequently a user can enter an unrelated planned session while a draft exists. The execute screen restores any draft matching only `routineId`, so the entry surface must prevent lineage loss or mismatch.

### Affected Areas
- `app/(tabs)/routines/index.tsx` — replace/directly guard the per-routine `Entrenar` action with a visible Continue route when this owner has a matching draft.
- `app/routine/[id].tsx` — expose the same routine-detail continuation behavior and prevent a parallel start.
- `app/mesocycle/summary/[id].tsx` — route Continue only for a draft whose routine and full planned-session lineage match the card; otherwise start the selected planned session safely.
- `app/routine/execute/[id].tsx` — consumes lineage route params and restores persisted drafts; it is the compatibility boundary, not in scope for further lifecycle changes.
- `context/DataContext.tsx` — provides hydrated owner-scoped `activeWorkoutDraft` and rejects different active attempt IDs; preserve this partial lifecycle unchanged.
- `tests/activeWorkoutReentry.test.tsx` — new focused runtime-harness regression coverage for Training, routine detail, and matching/mismatching mesocycle lineage.

### Approaches
1. **Entry-surface route resolver** — derive each CTA from `activeWorkoutDraft`: Continue when its target matches, otherwise start normally; for mesocycle cards require exact routine ID plus `mesocycleId`, `weekNumber`, and `plannedSessionId` equality.
   - Pros: Preserves the established draft lifecycle, prevents accidental lineage replacement, and limits changes to the intended entry surfaces.
   - Cons: Matching logic is duplicated unless kept as a small local helper.
   - Effort: Medium

2. **Change execute-screen restoration to validate lineage** — make the execution screen reject nonmatching draft/route pairs and leave all entry CTAs unchanged.
   - Pros: Centralizes a defensive invariant.
   - Cons: Does not provide the requested Continue affordance and can still lead users into an ambiguous setup route.
   - Effort: Medium

### Recommendation
Use an entry-surface route resolver. It completes the missing Continue UX while preserving the already-applied owner and attempt lifecycle. For mesocycle cards, Continue MUST require an exact lineage match; a same-routine draft from a different planned session must not inherit or overwrite the selected session's lineage. Keep execute-screen changes out of this follow-up unless a focused test exposes a concrete restoration defect.

### Risks
- A routine-only match on mesocycle cards would resume a draft under the wrong planned session and corrupt adherence attribution.
- An unguarded Start CTA can call `startActiveWorkout` with a new attempt ID, which correctly rejects the call but exposes an avoidable error path instead of a continuation action.
- The existing runtime harness mocks `useData`; the new test must model the active draft and assert route params rather than relying on the unavailable provider harness.

### Ready for Proposal
Yes — scope is bounded to the three entry surfaces and one focused regression file. Preserve all existing `complete-workout-reliability-fixes` partial lifecycle changes; do not reopen draft storage, DataContext lifecycle, or execute-screen persistence.
