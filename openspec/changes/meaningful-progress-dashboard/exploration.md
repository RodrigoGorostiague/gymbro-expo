## Exploration: meaningful-progress-dashboard

### Current State

The Progress screen is currently an activity summary, not a reliable improvement dashboard. It shows current-week minutes, workouts, and tonnage; current-month tonnage; total workout count; and two per-exercise session charts (`maxWeight` and `totalReps`). Exercise selection uses catalog ID first and falls back to case-insensitive names for legacy sessions.

The prior audit's important claims were re-verified against the current repository:

- **Cross-profile contamination is confirmed.** `exercises`, `routines`, `sessions`, and hidden shared-routine IDs use global AsyncStorage keys. `DataProvider` loads them once independently of `AuthContext.user`, while only shop state is profile-scoped. Both profiles therefore read and mutate the same workout history, and profile changes do not reload data.
- **Completed-session dimensions are insufficient.** A session snapshots routine ID/name, timestamps, duration, rest configuration, exercise instance/catalog IDs and names, and set weight/reps/completion. It does not snapshot owner profile, routine/exercise muscle groups, exercise variant/load mode, set type, measurement unit, or bodyweight.
- **Metric semantics are weak.** Tonnage includes every completed set with `weight × reps`, including warmups; failure sets record zero reps and therefore zero tonnage. Maximum weight ignores reps and set type, while total reps and tonnage change with workout structure. These describe activity/load but do not independently prove strength improvement.
- **Completion semantics are permissive.** A workout can be finished and rewarded with zero completed sets. `getCompletedWorkoutsCount` and weekly workout count still count that session.
- **Identity compatibility is partial.** Catalog IDs survive renames, but name fallback can merge unrelated legacy exercises, and delete/recreate produces a new ID. Deleted exercises and routines remain only as session snapshots. The UI currently derives exercise options from both catalog and history, but routine and muscle filters do not exist.
- **Special load models are unsupported.** The model has only `barra`, `mancuernas`, and `libre`; execution requires a non-zero weight. There is no bodyweight, added-weight, assisted-load, unilateral-load, or pounds representation. User-created catalog exercises are not distinguished from built-ins.
- **UI/state gaps are confirmed.** `SimpleLineChart` captures window width once at module load, has no rotation/container reflow, no value axis or accessible data summary, and crowds up to ten date labels. Progress ignores `DataContext.isLoading`; data-load failures are not represented, and empty/sparse states are generic.
- **Automated analytics coverage is absent.** No test files or test runner are configured. The only detected quality gate is `npx tsc --noEmit`.

Relevant OpenSpec overlap is limited to the still-active `exercise-catalog` change. Its analytics specification established ID-first/name-fallback matching and set-type tonnage behavior, and its snapshot specifications established immutable routine exercise fields. Task 4.3 remains manually unverified. No archived OpenSpec changes or populated main specs were found. The current working tree also contains uncommitted workout-history edit/delete work, so future delivery must preserve those immutable-session and serialized-persistence behaviors.

### Affected Areas

- `app/(tabs)/progress.tsx` — Current dashboard composition, exercise selector, summaries, charts, recent-session navigation, and missing loading/error/filter states.
- `components/LineChart.tsx` — Fixed-width chart rendering, limited semantics, sparse-state behavior, and accessibility limitations.
- `utils/analytics.ts` — Date windows, activity totals, exercise matching, and current improvement proxies; natural boundary for pure tested analytics.
- `types/index.ts` — Session snapshot dimensions, stable identity, load/unit semantics, and historical compatibility contracts.
- `app/routine/execute/[id].tsx` — Source of completed-session snapshots, completion validity, rewards, and current kg/non-zero-weight assumptions.
- `context/DataContext.tsx` — Session loading/mutations, profile coupling, loading behavior, and persistence orchestration.
- `utils/storage.ts` — Global keys, schema versioning, migration policy, and profile-scoped storage dependency.
- `context/AuthContext.tsx` and `app/_layout.tsx` — Active-profile lifecycle and provider ordering needed for safe profile isolation/reload.
- `app/session/[id].tsx` — Existing immutable snapshot editing rules that any schema extension must preserve.
- `constants/muscleGroups.ts` and `components/MuscleGroupSelector.tsx` — Existing muscle vocabulary and reusable selection behavior.
- `components/GlassCard.tsx`, `components/UI.tsx`, `components/AppScreenHeader.tsx`, and `components/SelectablePulse.tsx` — Existing visual language and interaction primitives for a modern but consistent dashboard.
- `openspec/changes/exercise-catalog/` — Active identity, snapshot, set-type, and analytics requirements that this change must refine rather than contradict.
- `package.json` and `openspec/config.yaml` — No automated test capability; analytics tests require an explicit tooling decision.

### Approaches

1. **Presentation-first activity dashboard** — Add global/routine/muscle/exercise filters and period cards while continuing to derive everything from the current session shape.
   - Pros: Smallest schema impact; quickest visual improvement; current data remains immediately usable.
   - Cons: Muscle attribution depends on mutable/deleted entities; profile contamination remains; current metrics still cannot support strong improvement claims; bodyweight/assisted semantics remain invalid.
   - Effort: Medium

2. **Snapshot-first trustworthy progress dashboard** — First isolate profile data and enrich immutable session snapshots, then introduce explicit metric definitions, equivalent-period comparisons, historical-only entities, sparse-data rules, responsive accessible charts, and pure analytics tests.
   - Pros: Supports explainable comparisons; protects renamed/deleted history; makes all requested filter dimensions dependable for future sessions; creates a stable analytics foundation.
   - Cons: Requires a migration policy for unowned legacy data; old sessions remain partially unknown; likely exceeds one review slice; load-model decisions can expand scope.
   - Effort: High

3. **Strength-scoring model** — Add estimated 1RM/PR scoring, bodyweight and assisted exercise models, normalization, and composite global/muscle improvement scores in the first release.
   - Pros: Most directly communicates improvement and can support richer coaching later.
   - Cons: High risk of false precision; requires richer execution inputs and product rules not present today; composite muscle/global scores are difficult to explain and validate.
   - Effort: High

### Recommendation

Use Approach 2, but keep the first product version deliberately explainable rather than inventing a universal fitness score. Treat **activity**, **training load**, and **exercise performance** as separate concepts:

- Global and routine views can compare equivalent periods for workout count, valid completed sets, duration, and recorded training load, but must not label all increases as improvement.
- Exercise improvement should use explicit records/trends selected according to supported load semantics, such as rep PR, load PR at comparable reps, or an agreed estimated-strength formula. Warmups and unknown-rep failure sets should not silently drive strength claims.
- Muscle views should be described as exposure/load trends, not muscle growth. Multi-muscle exercises require an explicit full-credit versus fractional-credit rule.
- Sparse data should show absolute values and “not enough data” until a comparable baseline exists; zero baselines must not produce misleading percentages.
- Historical options should be built from immutable session snapshots so deleted routines/exercises remain filterable. Current names may be shown for live IDs, while recorded names remain available for auditability.

Do not make profile migration, comparison periods, muscle allocation, completion validity, or strength-formula decisions in proposal until the prioritized product questions below are answered.

### Scope Boundaries

Recommended first-release scope:

- Profile-safe analytics and a documented non-destructive legacy ownership migration.
- Versioned immutable session dimensions needed for profile, routine, exercise, and muscle filtering.
- Global, routine, muscle-group, and exercise filters with equivalent-period comparison.
- Clearly named activity/load/performance metrics, sparse/unknown states, responsive charts, and accessible textual summaries.
- Unit-tested pure analytics/date/grouping functions plus manual screen verification.

Recommended non-goals unless explicitly selected:

- Predicting hypertrophy, calories, recovery, readiness, or coaching recommendations.
- Cross-user leaderboards or partner comparisons.
- Cloud analytics synchronization.
- A single opaque “fitness score.”
- Retrospectively fabricating muscle groups, units, set types, ownership, or load modes for legacy sessions.
- Full bodyweight/assisted strength scoring unless execution logging is expanded as an explicit dependency.

### Migration and Historical Compatibility

- A second destructive reset would conflict with the objective of meaningful progress and should be avoided unless the user explicitly accepts history loss.
- Existing global records have no trustworthy owner. Migration can assign them to one selected profile, place them in a visible legacy/unassigned bucket, duplicate them, or discard them; none is objectively correct without user input.
- Legacy sessions should remain readable with version/default normalization. Unknown dimensions must stay unknown rather than being inferred from current mutable entities.
- New sessions should snapshot stable IDs plus display labels and classification dimensions. Deleted/renamed entities should remain historical filter options.
- Name fallback should be visibly legacy and conservative because duplicate or reused names are ambiguous.
- If units or load modes are added, each set/session needs recorded semantics; changing a global preference later must not reinterpret historical values.

### Likely Delivery Slices

The requested force-chained strategy is appropriate. Likely autonomous slices are:

1. Analytics contract and test capability, including period/sparse-data semantics.
2. Profile-scoped/versioned persistence and legacy migration.
3. Immutable session snapshot enrichment and valid completion capture.
4. Pure filtering/comparison aggregation for global, routine, muscle, and exercise views.
5. Responsive accessible dashboard UI, states, and history-compatible selectors.
6. Optional load-model expansion for bodyweight/assisted exercises if selected.

The 800-line review budget is still likely to be exceeded by the total change, but each chained slice can remain below it. Exact forecasts belong in the later tasks phase.

### Prioritized Product Questions

1. **Legacy ownership:** Which profile should own the existing globally stored routines/sessions, or should they remain in a visible unassigned legacy bucket? Should any existing history be duplicated or discarded?
2. **Meaning of improvement:** For the first release, should exercise improvement prioritize estimated strength/PRs, comparable-set load and reps, training volume, or a combination shown separately? Is an estimated 1RM formula acceptable?
3. **Comparison model:** Which default comparison is useful—last 7 days versus previous 7, last 4 weeks versus previous 4, calendar periods, or a user-selectable period—and what minimum data should be required before showing a percentage?
4. **Muscle exposure:** For an exercise tagged to multiple muscle groups, should every group receive full set/load credit or should credit be split? Should `fullBody` be a real aggregation bucket or only an exercise/routine tag?
5. **Load and completion semantics:** Must this change support bodyweight, added-weight, and assisted exercises now, and should a workout count as completed only after at least one valid working set (with corresponding reward behavior)?

### Risks

- Assigning unowned legacy history incorrectly can permanently mix or hide one profile's data.
- A dashboard can look authoritative while presenting activity changes as physiological improvement.
- Current snapshots cannot truthfully backfill muscle, unit, set-type, or load-mode history.
- ID/name fallback can merge unrelated legacy exercises or split deleted/recreated ones.
- Warmups, failure sets with unknown reps, changed set counts, and zero-set sessions distort comparisons.
- Calendar boundaries, local time, daylight-saving changes, and edited completion dates can alter period membership.
- Multi-muscle attribution can double-count load unless semantics are explicit.
- Adding a test runner and richer session model increases setup and migration scope.
- The active `exercise-catalog` change and uncommitted workout-history work create overlap that later design/apply phases must reconcile carefully.

### Ready for Proposal

No. Repository feasibility is established and Approach 2 is recommended, but the proposal should wait for answers to at least legacy ownership, improvement semantics, comparison period, muscle attribution, and load/completion semantics. The orchestrator should run one concise interactive pre-proposal question round using the prioritized questions above.
