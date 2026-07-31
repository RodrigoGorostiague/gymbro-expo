# Design: Complete Workout Reliability Fixes

## Technical Approach
Correct the eight proposal behaviors at the existing `DataContext`/AsyncStorage boundary and the execution/planning screens. Keep each active workout as one validated owner-scoped draft; derive elapsed and rest display from persisted wall-clock timestamps on render/foreground, never from a background-JS guarantee. The optional spec is not yet present.

## Architecture Decisions

| Decision | Options / tradeoff | Choice and rationale |
|---|---|---|
| Draft ownership | Screen state; global unscoped key; owner key | Owner-keyed AsyncStorage draft validated on load. `DataContext` owns lifecycle so profile changes cannot publish or clear another owner’s data. |
| Time | `setInterval` as source; native background timer; timestamps | Persist start/rest deadlines and reconcile with `Date.now()`; intervals only refresh foreground UI. This is correct after suspension without claiming background execution. |
| Completion | Screen writes several stores; data boundary transaction | `DataContext` serializes attempt commit, then future-default propagation, then draft removal. Existing attempt ID collision semantics make retries idempotent. |
| Dates | UTC parsing; local civil dates | Reuse/add local-noon `YYYY-MM-DD` helpers; derive `startDate` from the first flattened entry (including rest), or omit when empty. |
| Android chrome/FAB | fixed offsets/unbounded drag; runtime-only bar API | Root safe-area provider plus measured execution bounds and config-plugin navigation-bar policy. SDK 56 documents plugin settings as build-time and notes Android 15 emulator variance. |

## Data Flow

```text
Execute screen → save draft(owner, timestamps, inputs/rest) → AsyncStorage
     ↑ foreground/restart ← DataContext loads/validates owner draft
Finish → saveCapturedAttempt(id) → update local routine future defaults → clear draft
```

`app/routine/execute/[id].tsx` asks `DataContext` to start/update/cancel/complete. Completion creates the immutable snapshot first; propagation maps only matching local, future planned routine defaults and never changes `WorkoutAttempt` history. A failed commit retains the draft for retry. Explicit cancel removes only the current owner’s draft.

## File Changes

| File | Action | Description |
|---|---|---|
| `types/index.ts` | Modify | Define versioned `ActiveWorkoutDraft`, owner, routine/lineage identity, runtime inputs, start/rest timestamps, and validated lifecycle contract. |
| `utils/storage.ts` | Modify | Add owner-keyed draft load/save/remove validation; serialize completion with existing attempt mutation queue and idempotent attempt identity. |
| `context/DataContext.tsx` | Modify | Hydrate/reset active draft per profile; expose lifecycle operations; commit attempt before local routine default propagation and draft deletion. |
| `app/routine/execute/[id].tsx` | Modify | Restore draft, reconcile timestamps on AppState foreground, persist meaningful changes, add cancel confirmation, and use bounded accessible execution FAB. |
| `app/mesocycle/create.tsx` | Modify | Let first-week routine/rest selection create entries, then derive start date from entry zero. |
| `app/mesocycle/[id].tsx` | Modify | Share selection styles/semantics with creation; retain name-only planned refs after reload; recompute derived start date. |
| `utils/mesocycles.ts` | Modify | Centralize local-civil start-date derivation and preserve first rest as a valid anchor. |
| `app/_layout.tsx` | Modify | Mount `SafeAreaProvider` and declarative theme-aware navigation bar component. |
| `app.json`, `package.json` | Modify | Install/configure `expo-navigation-bar`; rebuild Android binary. |
| `components/ExecutionFab.tsx` | Create | Execution-only social FAB with measured safe-area bounds, drag clamp, accessible action, and reset/reposition control. |
| `tests/storage.test.ts`, `tests/workoutAttempts.test.ts`, `tests/mesocycleNavigation.test.ts`, `tests/executeWorkout.test.tsx` | Modify/Create | Regression tests using current Vitest/AsyncStorage and runtime-harness patterns. |

## Interfaces / Contracts

```ts
interface ActiveWorkoutDraft {
  version: 1; owner: UserProfile; attemptId: string; routineId: string;
  lineage?: WorkoutLineage; startedAtMs: number; restEndsAtMs?: number;
  restTimerSeconds: number; completedSets: Record<string, boolean>;
  setValues: Record<string, { weight: string; reps: string }>;
}
```

Invalid, wrong-owner, stale-routine, or malformed drafts are ignored/quarantined without affecting attempts. `completeActiveWorkout(draft)` is idempotent by `attemptId`: an equal persisted attempt succeeds; conflicting bytes fail and retain the draft.

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit | Civil-date first routine/rest/empty behavior; draft validation; timestamp reconciliation; clamp math; propagation eligibility | Deterministic clocks and pure utilities. |
| Storage/context | Owner isolation, cancellation, reload, write failure, duplicate finish, attempt-before-propagation ordering | Mocked AsyncStorage failures and existing mutation queues. |
| Screen | Restored inputs, foreground elapsed/rest display, first-week selection, reset FAB accessibility | React test renderer/runtime harness. |
| Physical Android | Gesture and three-button navigation; light/dark system-bar contrast; FAB cannot enter insets or hide completion | Rebuilt SDK 56 Android binary on a real device; document result. |

## Threat Matrix
N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout
No destructive migration. Missing draft keys mean no draft; malformed records are safely ignored/quarantined. Release with a rebuilt Android binary because navigation-bar plugin settings are build-time. Roll back code/config if needed; do not delete committed attempts/history. Existing valid drafts remain owner-scoped and cancellable.

## Open Questions
- [ ] Physical Android verification is a release blocker: confirm gesture and three-button behavior on the target Android version/device.
