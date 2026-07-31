# Design: Active Workout Re-entry Fix

Complete re-entry without changing draft persistence or completion lifecycle. Entry CTAs resolve against the hydrated, owner-scoped `activeWorkoutDraft`; the execute screen defensively restores a draft only when its route identifies the same workout context.

## Technical Approach

Add a pure re-entry matcher and use it at the three bounded launch surfaces: routine library, routine editor/detail, and mesocycle summary. Routine launches match `routineId`. Planned-session launches match `routineId` plus all lineage fields. The execute route receives the selected lineage unchanged and applies the same predicate before restoring state. This is required because it currently restores on `routineId` alone.

## Architecture Decisions

| Decision | Options / trade-off | Choice and rationale |
|---|---|---|
| Matching location | Duplicate comparisons in screens; pure shared helper | Create `utils/activeWorkoutReentry.ts`. A pure helper makes the three CTA decisions and the execute restore gate identical and directly unit-testable. |
| Routine matching | Match every active draft; match routine ID | Match `draft.routineId === targetRoutineId`. Drafts are already owner-scoped by `DataContext`; unrelated routines retain their normal start route. |
| Planned-session matching | Routine-only; exact lineage | Require routine ID and equal `mesocycleId`, `weekNumber`, and `plannedSessionId`. Routine-only would attribute a resumed attempt to the wrong planned session. |
| Execute restore boundary | Trust callers; validate route context | Add a narrow restore predicate in `app/routine/execute/[id].tsx`. A lineage-mismatched route otherwise restores the same-routine draft before its Start CTA can run, defeating the mesocycle decision. No storage or lifecycle behavior changes. |

## Data Flow

```text
hydrated activeWorkoutDraft
        │
entry surface ── matcher(target context) ──► Continue or Start route
        │                                        │
        └──────── selected route params ─────────┘
                                                 ▼
                                  execute restore matcher
                                                 │
                                     matching draft restores state
```

`WorkoutLineage` is `{ mesocycleId, weekNumber, plannedSessionId }`. No lineage target means a routine launch; a draft with lineage may still resume from a matching routine surface because no planned-session attribution is being selected.

## File Changes

| File | Action | Description |
|---|---|---|
| `utils/activeWorkoutReentry.ts` | Create | Pure context matcher for routine and exact planned-session re-entry. |
| `app/(tabs)/routines/index.tsx` | Modify | Read `activeWorkoutDraft`; label and route matching routine CTA as Continue. |
| `app/routine/[id].tsx` | Modify | Apply the same matcher to the existing `▶ Ejecutar` action. |
| `app/mesocycle/summary/[id].tsx` | Modify | Pass target lineage to the matcher; show Continue only for an exact match. |
| `app/routine/execute/[id].tsx` | Modify | Gate hydration restore with the shared matcher; leave persistence and finish/cancel paths unchanged. |
| `tests/activeWorkoutReentry.test.tsx` | Create | Runtime-harness route/label regression coverage plus matcher edge cases. |

## Interfaces / Contracts

```ts
type WorkoutLaunchTarget =
  | { routineId: string }
  | { routineId: string; lineage: WorkoutLineage };

function matchesActiveWorkout(
  draft: ActiveWorkoutDraft | null,
  target: WorkoutLaunchTarget,
): boolean;
```

For a lineage target, `draft.lineage` MUST exist and equal every lineage property. Missing, partial, or mismatched lineage returns `false`.

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit | Routine, exact lineage, each absent/mismatched lineage field | Table-driven tests for `matchesActiveWorkout`. |
| Integration | Library and routine-detail matching CTAs | `runtimeHarness` mocks `useData`; assert Continue label and `router.push('/routine/execute/{id}')`. |
| Integration | Mesocycle exact and mismatch behavior | Render summary with planned sessions; assert exact match Continue route includes the original three params; routine-only and each lineage mismatch retain Start route and params. |
| Integration | Defensive execute restore | Render execute with a same-routine but mismatched lineage draft; assert setup remains visible rather than restored active state. |
| E2E | N/A | No E2E harness is configured. |

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Expo Router navigation is covered by the focused runtime integration regressions.

## Migration / Rollout

No migration required. Existing v1 drafts remain valid; the matcher only changes whether they may be resumed for a requested route.

## Open Questions

- [ ] None. The execute restore gate is a necessary bounded correction to the proposal's stated no-execute-change scope; without it, same-routine lineage mismatches still resume incorrectly.
