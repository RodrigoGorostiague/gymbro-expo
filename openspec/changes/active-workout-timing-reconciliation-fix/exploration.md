## Exploration: active-workout-timing-reconciliation-fix

### Current State
Active drafts persist `startedAtMs` and optional `restEndsAtMs` per owner. The execute screen restores both once, recalculates elapsed only on `AppState` `active`, and runs local intervals only after a new workout/rest start. Route/tab focus does not invoke reconciliation; restored rest does not resume an interval or clear its expired deadline. Storage validates draft shape but has no lifetime rule, so a stale draft can survive restart indefinitely. The only timer test checks elapsed arithmetic.

### Affected Areas
- `types/index.ts` — define the shared five-hour draft-lifetime contract if represented as a domain constant.
- `utils/storage.ts` — validate timestamps and remove an expired owner draft during load/reconciliation.
- `context/DataContext.tsx` — centralize timestamp-authoritative draft reconciliation and publish/remove the current owner draft.
- `app/routine/execute/[id].tsx` — reconcile on route focus and AppState foreground; use intervals only to refresh visible foreground UI.
- `tests/workoutRuntime.test.ts` — cover elapsed/rest reconciliation, expiry, and lifecycle triggers with deterministic time.
- `tests/helpers/reactNativeStub.ts` — make AppState lifecycle callbacks observable by the runtime harness.

### Approaches
1. **Central reconciler with foreground refresh** — a pure/shared reconciliation path derives elapsed/rest from `Date.now()`, clears an expired rest deadline, and removes drafts at five hours; `DataContext` invokes it on load and exposes it for execute-screen route/AppState focus.
   - Pros: One authority for restart, cross-tab state, and expiry; no background promise.
   - Cons: Requires careful async ownership/race handling while persisting cleanup.
   - Effort: Medium

2. **Screen-local lifecycle repair** — extend the execute screen to restart/reconcile intervals on focus and foreground, with expiry checked there.
   - Pros: Smaller initial edit.
   - Cons: Cannot reliably clear stale drafts before the execute route is visited; duplicates lifecycle rules.
   - Effort: Medium

### Recommendation
Use the central reconciler. Treat timestamps—not interval ticks—as authoritative: derive elapsed and remaining rest whenever the active route gains focus, the app becomes active, or the draft is loaded after restart. Intervals MAY repaint a visible active screen only and MUST be stopped on blur/unmount; they must never drive correctness. At `startedAtMs + 5 hours`, remove the owner draft centrally, including after restart, rather than scheduling a background expiry loop.

### Risks
- Concurrent reconcile/update calls can restore a stale draft after expiry cleanup unless ownership and attempt identity are checked before publishing state.
- Expired rest must clear `restEndsAtMs` persistently; otherwise each focus/restart can recreate an inconsistent rest state or repeat completion feedback.
- Tests must model route focus and AppState callbacks; arithmetic-only coverage will not prevent this regression.

### Ready for Proposal
Yes — define the five-hour boundary and reconciliation result precisely, then add deterministic storage/context and execute lifecycle coverage. Do not claim background JavaScript execution.
