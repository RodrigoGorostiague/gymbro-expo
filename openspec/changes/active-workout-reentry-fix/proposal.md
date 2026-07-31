# Proposal: Active Workout Re-entry Fix

## Intent

Complete the pre-existing active-workout draft lifecycle so users can visibly continue the correct in-progress workout from Training, routine detail, and planned mesocycle sessions without losing attribution.

## Scope

### In Scope
- Show a Continue route instead of an unsafe parallel start when Training or routine detail targets the owner's matching active draft.
- Resolve mesocycle session CTAs using exact routine and planned-session lineage.
- Add focused runtime-harness regression evidence for all entry surfaces and lineage mismatch handling.

### Out of Scope
- Changes to draft storage, `DataContext` lifecycle, execute-screen persistence, or completion/cancellation behavior.
- Broader mesocycle scheduling, migration, or UI redesign work.

## Capabilities

### New Capabilities
- `active-workout-reentry`: Route users to the owner-scoped active draft from routine entry surfaces and preserve exact mesocycle lineage on resume.

### Modified Capabilities
None — `openspec/specs/` contains no existing capability specifications.

## Approach

Implement a small entry-surface route resolver using `activeWorkoutDraft`. Training and routine detail continue only when the routine matches. Mesocycle cards continue only when routine ID and all lineage fields (`mesocycleId`, `weekNumber`, `plannedSessionId`) match; otherwise they start the selected planned session normally. Keep execute-screen behavior unchanged.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `app/(tabs)/routines/index.tsx` | Modified | Resolve Training CTA to Continue or safe start. |
| `app/routine/[id].tsx` | Modified | Add matching continuation behavior. |
| `app/mesocycle/summary/[id].tsx` | Modified | Require exact lineage for Continue routing. |
| `tests/activeWorkoutReentry.test.tsx` | New | Focused entry and lineage regression coverage. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Same-routine draft resumes under another planned session | Med | Require full lineage equality before Continue. |
| New attempt is requested while a draft exists | Low | Make the matching CTA Continue, not Start. |

## Rollback Plan

Revert the entry-surface resolver and its focused regression test. Existing persisted drafts and execute-screen lifecycle remain unchanged.

## Dependencies

- Existing hydrated `activeWorkoutDraft` from `DataContext`.
- Existing route parameters consumed by `app/routine/execute/[id].tsx`.

## Success Criteria

- [ ] Matching routine drafts show and route through Continue from Training and routine detail.
- [ ] A mesocycle Continue route preserves only an exact matching lineage.
- [ ] Mismatched mesocycle lineage starts the selected session without reusing the draft.
- [ ] Focused runtime-harness regressions prove the three entry surfaces.
