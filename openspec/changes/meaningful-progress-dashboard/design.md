# Design: Meaningful Progress Dashboard

## Technical Approach

Replace mutable `WorkoutSession` capture with profile-partitioned, versioned `WorkoutAttempt` snapshots, pure analytics selectors, and thin presenters. Retain AsyncStorage/Context and installed `react-native-svg`; Expo SDK 56 documents all three choices, so no runtime dependency is added.

## Architecture Decisions

| Decision | Choice | Rejected alternative / tradeoff |
|---|---|---|
| Migration | Quarantine ownerless sessions once; preserve routines, exercises, and owned history | Deletion is irreversible; quarantine failure must abort cleanup. |
| Rewards | Persist attempt, apply a profile-scoped receipt, then mark applied | Incremental grants can survive failed attempt saves; AsyncStorage has no cross-key transaction, so use a recoverable idempotent saga. |
| Identity | Group only stable routine/catalog IDs; retain snapshot labels and mark deleted entities historical | Name fallback can merge renamed/recreated entities; legacy unknown identity remains ungrouped. |
| Signals | Independent adherence, activity, performance, exposure, and global summaries | An opaque global score creates unsupported meaning and hides contradictory signals. |
| Charts | Extend existing SVG with accessible text and responsive dimensions | A chart library adds weight and visual inconsistency; custom SVG costs layout work. |

## Data Flow

    execution draft -> pure finalizeAttempt -> persist owned attempt (reward pending)
       -> apply receipt if absent -> persist shop -> mark attempt applied -> publish contexts
    owned attempts -> memoized selectors -> scope presenters -> SVG + textual summary

Attempt failure grants nothing; shop failure leaves a retryable pending attempt. If shop succeeds but marking fails, the receipt prevents another grant.

## File Changes

| File | Action | Description |
|---|---|---|
| `types/index.ts` | Modify | Add attempt/status, plan/result/completion/reward snapshots, load modes, unit, and primary/secondary weighted muscles. |
| `utils/workoutAttempts.ts` | Create | Validation, adherence, rewards, compatibility, and edit guards. |
| `utils/storage.ts` | Modify | Profile attempt keys, migration quarantine/marker, receipt-aware persistence, rollback helpers. |
| `context/DataContext.tsx`, `context/ShopContext.tsx` | Modify | Serialized mutations, reward recovery, load/error/retry state. |
| `app/routine/execute/[id].tsx`, `app/session/[id].tsx` | Modify | Capture snapshots/failure reps; permit result/date edits but freeze structure, completion, and reward. |
| `utils/analytics.ts` | Rewrite | Pure period, filter, signal, compatibility, sparse-state, and chart selectors. |
| `components/LineChart.tsx`, `components/progress/*.tsx`, `app/(tabs)/progress.tsx` | Modify/Create | Accessible chart, four scope presenters, searchable historical filters. |
| `package.json`, `tests/*.test.ts` | Modify/Create | Add Vitest as the justified dev-only runner for pure-domain RED tests. |

## Interfaces / Contracts and Algorithms

`WorkoutAttempt` contains version, owner, stable attempt/routine/exercise/set IDs, labels, immutable plan/dimensions, editable results, immutable completion/reward, and `RewardApplication { id: owner:attemptId:v1, state, appliedAt? }`. Modes are `external-load | bodyweight | assisted`; requirements are `(reps>0, load>=0, unit)`, `(reps>0, bodyweight>0, unit)`, or `(reps>0, assistance>=0, unit)`. Performed failure sets require actual `reps>0`. Muscle attribution requires one primary, distinct secondaries, and finite non-negative custom weights.

A valid set matches a planned ID, is performed, and satisfies its mode. `rawAdherence = valid/planned` (zero plans: 0); classify unrounded: `<0.70 partial`, `<1 completed`, else `fully-completed`. Display `Math.round(raw*100)`. Set gems are `valid * GEM_REWARDS.setComplete`; fixed reward applies at `>=0.70`; full bonus is `floor((setGems+fixed)*0.25+0.5)`. Counts/goals use completed/full attempts only.

Periods are local-calendar half-open ranges: current `[startOfToday-6 days, startOfTomorrow)`, previous `[currentStart-7 days,currentStart)`. Aggregate adherence is `sum(valid)/sum(planned)`. Activity counts attempts, duration, and each valid set once. Exposure sums valid work/failure sets times snapshotted weights (defaults primary `1.0`, each distinct secondary `0.4`); warmups are separate and muscle totals are never summed globally. Performance partitions by exercise ID + mode + unit: external load/reps/volume, bodyweight/reps, and assistance/reps remain separate. Trends require two valid compatible observations. Percentage is `(current-previous)/previous*100`, rounded to one decimal; when baseline is zero/missing, show absolutes and `insufficient`, never a percentage.

Selectors scan 14 days once, memoize by array/filter identity, and cap plotted labels while summaries use all qualifying records. Context exposes `loading | ready | error` plus `retry`; presenters discard stale claims.

## Testing Strategy

Vitest covers thresholds/rounding, modes, DST boundaries, sparse baselines, compatibility, exposure, migration rollback, each reward-write failure, duplicate receipts, identity/edit guards, and selectors. `npx tsc --noEmit` remains mandatory; device walkthroughs cover profile switches, orientation, screen readers, search, retry, and Glass/theme visuals.

## Threat Matrix

N/A — no routing behavior, shell, subprocess, VCS/PR automation, executable classification, or process-integration boundary changes.

## Migration / Rollout

Persist ownerless quarantine before cleanup; mark migration only after replacement. Failure exposes retry without mixed state; rollback merges quarantine with current sessions, with current IDs winning collisions, and clears the marker. Forced-chain seams are independently verifiable: contracts/tests; migration/repository; reward saga; selectors; UI/accessibility; history integration. Rebase around active `exercise-catalog` and staged session-detail work: catalog owns planned `F` semantics/routine snapshots; attempts add actual failure reps. Legacy name fallback never enters trusted selectors.

## Open Questions

None blocking.
