# Weekly progress summary

Progress now includes an independent weekly card; the existing rolling 7/30/90-day panels remain unchanged.

## Semantics

- Weeks run Monday–Sunday in the device's local timezone. The current week ends at the observation time, while the previous week is complete. Both are explicitly labeled; no percentage comparison is shown. Focus and a one-minute timer refresh the observation time.
- Only owner-matching, applied-receipt attempts are included, once per attempt ID. Future, invalid-date and pending-sync attempts are excluded. Completed sessions exclude partial attempts; training frequency counts local days with at least one eligible effective set, including partial sessions.
- Effective sets and muscle attribution reuse immutable attempt statistics. Weighted external volume reuses the same selector separately for kg and lb. Warmups and missing historical attribution are not inferred from today's routine/catalog. Effective-set eligibility is not inferred from measured RIR; actual effort is summarized separately below.
- Planned counts reuse dated mesocycle slots and their latest linked attempt as of the cutoff, not a ratio of unrelated workouts. The denominator is the full week's current plan. Rest days, drafts, cancelled/rescheduled/skipped unattempted slots are excluded under existing adherence semantics. Undated plans or absent weekly slots make planning unavailable. Historical plan edits are not reconstructed.
- Missing muscle observations read as unavailable, not zero; bodyweight/assisted work has no comparable external-load volume. This card does not change rewards or persistence.

## Verification and limits

Run `npx vitest run tests/weeklyProgress.test.ts tests/progressScreen.test.ts tests/analytics.test.ts tests/mesocycleLifecycle.test.ts` and `npx tsc --noEmit`.

Independent reliability review passed without blockers. On the coordinated integration snapshot, the full suite passed **106 files / 813 tests**; TypeScript and diff checks passed. Additional read-only boundary validation passed **25 calendar scenarios across five timezones** (UTC, Buenos Aires, New York, Berlin and Auckland), including DST/year boundaries, exact cutoffs, exclusions and input immutability. All six candidate paths and 737 integration paths matched their frozen hashes/modes before this documentation-only closure.

Evidence: `/tmp/gymbro-weekly-baseline-20260911/review-npm-test.log`, `review-tsc.log`, `review-diffcheck.log`, `review-timezones.log` and `review-immutability.json`. Concurrent online-workout work is recorded separately in the coordinated integration snapshot; this does not claim the original 44 dirty paths remained unchanged. No migration is required or was performed for the weekly slice. Roadmap 3.5 remains partial.

The selector tests cover DST-week boundaries, local-day frequency, owner/pending/future/duplicate exclusion, unit partitioning, warmups, missing attribution and real-slot linkage. Rendered ProgressScreen tests cover integration, metrics, period independence and loading/error suppression. Runtime uses React test renderer with the existing native/router stubs, not an emulator or production account; visual layout, device timezone switching and background/resume timer behavior still require device acceptance.

Rollback only this work unit: remove WeeklySummary and weeklyProgress with their new tests/doc, then remove its import/render and added screen tests. Preserve all pre-existing uncommitted changes. No migrations, deployment or commits are part of this slice.

## Recorded duration and wholly omitted exercises

The weekly card also reports saved duration and wholly omitted exercise occurrences, including partial attempts under the same owner/receipt/time/deduplication filters.

- Duration reuses the core-progress sum of saved seconds; it does not recompute elapsed time, subtract rest, or measure active lifting. A recorded zero is valid. No attempts or any missing, non-finite or negative duration makes the weekly total unavailable rather than silently undercounting.
- An omitted occurrence must have a historical exercise snapshot with planned sets and zero valid performed sets. Completion validation supplies set-ID matching, duplicate-result rejection and performance validity. Valid warmups **do** establish that an exercise was started, unlike effective-set/volume metrics, which exclude warmups. Partial exercises are never wholly omitted.
- Empty exercise lists or any empty set prescription make the omission total unavailable. An exercise absent from the snapshot is never inferred from today's routine; this is not a count of removed exercises or unattempted scheduled sessions. Repeated exercises across attempts count as separate historical occurrences. Invalid performed values count as no valid performed set, not proof of physical non-performance.
- Current-week partial / previous-week full labels and existing rolling-period controls remain unchanged. No RIR, density, substitutions, auto-progression, rewards, migration or persistence changes are included.

Verification for this extension: `npx vitest run tests/weeklyProgress.test.ts tests/progressScreen.test.ts tests/analytics.test.ts tests/workoutAttempts.test.ts` (55 tests passed) and `npx tsc --noEmit`. RED evidence: 8 new selector cases failed before implementation; all passed after implementation. ProgressScreen renders historical-only omissions and duration, preserves them across rolling-period controls, and renders unavailable data explicitly using the existing React test-renderer harness (not a device).

Independent reliability review of this extension passed without findings. The final full suite passed **106 files / 829 tests**; TypeScript and diff checks passed. Read-only validation passed **500 differential core-progress comparisons and nine omission probes**, including duplicate results, partial work, warmups, bodyweight/assisted performance, invalid data, empty/mixed-unknown snapshots and occurrence counting; inputs remained immutable. All **742 repository paths** matched their expected hashes/modes before this documentation-only closure (six candidate files and 736 preserved baseline files). Evidence: `/tmp/gymbro-weekly-duration-baseline-20260911/review-full-test.log`, `review-tsc.log`, `review-diffcheck.log`, `review-probes.log` and `review-immutability.json`. Earlier review evidence above applies to the original weekly slice. Stage **3.5 remains partial**. The maintainer reports usage validation and bug fixes today; that report does not establish device acceptance of these newly added metrics. No new physical-device validation was performed. Rollback this extension's isolated delta in `utils/analytics.ts`, `utils/weeklyProgress.ts`, `components/progress/WeeklySummary.tsx`, both weekly/progress screen test files and this section, preserving their pre-existing content. Baseline, isolated delta and verification evidence: `/tmp/gymbro-weekly-duration-baseline-20260911/`.

## Weekly density

The weekly summary now includes a theme-aware density panel: current week in progress and previous full week, shown as neutral values rather than a score or percentage improvement. Columns wrap on narrow screens; accessible labels include the period and full unit.

- Density is **total effective sets ÷ total recorded hours**, not an average of session rates. It reuses the weekly selector's effective-set count and duration sum under identical owner, confirmed-receipt, date and deduplication filters, including partial attempts. Load units do not affect it.
- Recorded duration includes recorded rest; this is not active lifting time or training quality. Higher density does not earn rewards or imply better training.
- No attempts, incomplete exercise/set snapshots, or any missing, invalid or nonpositive session duration makes density unavailable. A known zero effective-set numerator with positive complete duration is valid zero. The existing duration metric still permits recorded zero. No current routines are used to fill historical gaps.

Verification: the final focused selector, density presentation, ProgressScreen, analytics and attempt suites passed **69 tests across five files**, and TypeScript passed. Independent reliability review found no severe issues. Its sole P3 finding (a finite positive duration can still produce Infinity or NaN after division) was corrected by checking the final quotient; valid zero remains zero. Both new arithmetic regressions failed before the fix, then passed. Independent scoped fix validation passed and verified all seven candidate and 754 integration hashes/modes before this documentation-only closure. Evidence: `/tmp/gymbro-density-baseline-20260911/correction/red.log`, `green.log`, `validator-focused.log`, `validator-tsc.log` and `validator-immutability.json`.

The historical full-suite run for the pre-correction integration was **859 passed / 2 failed** (114 files: 113 passed / 1 failed), not an all-green result. Both failures are external to this density delta in `tests/activeWorkoutReentry.test.ts`, whose assertions use an old effort-control label; they were not changed in this work unit. Evidence: `/tmp/gymbro-density-baseline-20260911/recovery/review-full-test.log`. The final correction reran the focused suites and TypeScript, not the full suite.

Native/router stubs cover component states, theme tokens, accessibility labels and rolling-period independence. Fresh synthetic React Native Web renders of the actual WeeklyDensity component at 320px were visually inspected by the implementation coordinator and independent reviewer: dark available and light unavailable states are legible, wrap without truncation and have no horizontal overflow (288px cards). Use `/tmp/gymbro-density-baseline-20260911/recovery/rodaja-320.png`, `brisas-320.png` and `visual-probes.json`; the original screenshots in the parent directory are invalid and must not be used as evidence. This is not full-app native/device acceptance; native font scaling and screen-reader behavior remain unverified. Stage 3.5 remains partial.

Rollback only this extension's isolated delta in the weekly selector, WeeklySummary integration, weekly/progress tests and this section; remove WeeklyDensity and its presentation tests. Preserve all prior accumulated changes. No persistence, rewards, dependencies, migrations, deployment, or commits were changed. Independent review, bounded correction validation and roadmap documentation closure are recorded above; remaining roadmap scope and device acceptance are not closed.


## Actual effort averages — 2026-09-17

The weekly card now presents recorded RIR and RPE means separately, alongside the number of valid observations and the total eligible effective sets for each week. It reuses `readActualEffort` validation and `getEligiblePerformances` eligibility. Each recorded set has equal weight; this is not an average of session averages. RIR zero remains valid. Warmups, invalid/unperformed/mismatched results and missing or invalid effort do not enter the averages. Prescribed effort never fills missing results.

Owner, receipt, duplicate-attempt, calendar and future-time filters are inherited from the weekly selector. Current partial and previous full weeks remain explicitly labeled. An absent scale shows “Sin registros”, not zero; coverage makes incomplete reporting visible. Neither scale is converted to the other or scored as better/worse. The theme-aware card wraps its columns and retains font scaling and descriptive accessibility labels.

Verification: 42 tests across weekly selector, effort presentation, ProgressScreen and actual-effort validation passed. The full suite completed with 912 passing tests and one failure in `tests/socialScreen.test.ts:452`, which expects old milestone text outside this change. TypeScript and diff checks are recorded in `/tmp/gymbro-weekly-effort-20260917/`. Native visual/font-scale/screen-reader acceptance has not been performed. No persistence, rewards, dependencies or migrations changed.
