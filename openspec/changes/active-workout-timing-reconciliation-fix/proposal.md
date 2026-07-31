# Proposal: Active Workout Timing Reconciliation Fix

## Intent

Keep an active workout accurate after focus changes, foregrounding, and restart. Persisted timestamps—not JavaScript intervals—must determine elapsed and rest time; stale drafts must expire after five hours.

## Scope

### In Scope
- Central timestamp-based reconciliation for the current owner's active workout draft.
- Foreground and active-route refresh of elapsed time and rest state.
- Persistent clearing of expired rest deadlines and central removal of drafts at the five-hour boundary.
- Deterministic lifecycle coverage for elapsed, rest, expiry, route focus, and AppState.

### Out of Scope
- New or changed workout re-entry/Continue UI.
- Background JavaScript execution or scheduled expiry loops.
- Changes to workout attribution, completion, or routing behavior.

## Capabilities

### New Capabilities
- `active-workout-timing-reconciliation`: Timestamp-authoritative elapsed/rest reconciliation and five-hour active-draft expiry.

### Modified Capabilities
None — no existing OpenSpec capabilities are defined.

## Approach

Introduce a shared reconciliation result used by storage/context on load and by the execute route on focus/AppState active. Derive elapsed/rest from `Date.now()`; intervals only repaint a visible focused screen. Guard cleanup by owner and attempt identity.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `types/index.ts` | Modified | Shared draft lifetime contract if needed. |
| `utils/storage.ts` | Modified | Validate/reconcile timestamps and persist expiry cleanup. |
| `context/DataContext.tsx` | Modified | Own current-draft reconciliation and publication. |
| `app/routine/execute/[id].tsx` | Modified | Refresh timing on focus and foreground. |
| `tests/workoutRuntime.test.ts` | Modified | Deterministic timing and lifecycle coverage. |
| `tests/helpers/reactNativeStub.ts` | Modified | Observable AppState callbacks. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Late update republishes an expired draft | Med | Check owner and attempt identity before publishing/persisting. |
| Rest completion repeats after focus | Med | Clear `restEndsAtMs` persistently during reconciliation. |

## Rollback Plan

Revert the reconciler, lifecycle hooks, and focused tests together; existing draft schema remains compatible.

## Dependencies

- Existing AsyncStorage draft persistence and Expo Router/AppState lifecycle APIs.

## Success Criteria

- [ ] Elapsed/rest values reconcile from persisted timestamps after focus, foreground, and restart.
- [ ] Expired rest deadlines are cleared once and drafts expire at five hours.
- [ ] No interval is relied on for correctness while unfocused or backgrounded.
