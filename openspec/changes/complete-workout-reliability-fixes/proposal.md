# Proposal: Complete Workout Reliability Fixes

## Intent
Make planning and workout completion durable, predictable, and usable on Android without misrepresenting background-time guarantees.

## Scope
### In Scope
- Create a first mesocycle week with routine/rest selection; apply the same selected styling in editing.
- Anchor `startDate` to the first scheduled entry, including a first rest session; no entries means no derived date.
- Preserve catalog name-only edits after reload.
- Persist one validated, owner-scoped active-workout draft; restore inputs/rest state and reconcile elapsed wall-clock time after foregrounding or restart.
- Preserve cancellation semantics: explicit cancellation clears only that owner’s draft; successful completion clears it only after the durable commit.
- Make completion idempotent; write attempt/history first, then propagate the completed snapshot to matching future routine defaults without altering history.
- Add execution-scope, accessible social FAB with measured safe-area drag bounds and reset/reposition control.
- Configure Android navigation-bar/safe-area behavior and verify on a physical Android device.

### Out of Scope
- Guaranteed background JavaScript/timer execution, force-stop recovery, or clock-tamper-proof elapsed time.
- Changing historical attempts or cross-profile workout data.

## Capabilities
### New Capabilities
- `active-workout-recovery`: Owner-isolated persisted execution drafts and timestamp reconciliation.
- `execution-surface-accessibility`: Bounded, accessible execution FAB behavior.

### Modified Capabilities
- `mesocycle-planning`: First-entry date derivation and routine/rest session selection.
- `workout-completion`: Idempotent completion and future-default propagation.

## Approach
Add validated owner-keyed draft storage and transactional completion ordering in the data/storage boundary. Derive elapsed display from persisted timestamps, not intervals. Share session selection/date rules between create and edit. Use safe-area measurements for the execution FAB; add the Expo Android navigation-bar integration.

## Affected Areas
| Area | Impact | Description |
|---|---|---|
| `app/mesocycle/*`, `utils/mesocycles.ts` | Modified | Session selection and date invariant |
| `app/routine/execute/[id].tsx` | Modified | Draft restore, reconciliation, FAB |
| `context/DataContext.tsx`, `utils/storage.ts` | Modified | Owner-scoped draft and completion transaction |
| `app.json`, `package.json`, tests | Modified | Android config and regressions |

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Duplicate completion or profile leakage | Med | Idempotency key, owner validation, commit ordering |
| Android system-bar variance | Med | Physical gesture/three-button device checks |

## Rollback Plan
Revert the release/PR; retained drafts remain owner-scoped and can be explicitly cancelled. Do not roll back committed attempts or historical records.

## Dependencies
- Rebuilt Android binary with `expo-navigation-bar`; real-device verification is required.

## Success Criteria
- [ ] All eight corrective behaviors have focused regression coverage.
- [ ] First rest entry determines the displayed start date.
- [ ] Draft survives navigation/restart and is isolated per profile; cancel and success clear it correctly.
- [ ] Completion creates one attempt and updates only eligible future defaults.
- [ ] Android device verifies safe areas, navigation modes, and bounded accessible FAB.
- [ ] Documentation/tests state background execution is not guaranteed.
