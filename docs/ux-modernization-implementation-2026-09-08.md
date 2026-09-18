# Training-first modernization — implementation ledger

Status: all 14 scoped production slices implemented; final verification recorded below; user authorized the complete roadmap after the proposal audit. This ledger describes actual source changes, not device certification. No commits, deployment, dependencies, database changes, or native Gentle AI lifecycle operations. Existing `.review-artifacts` and historical runtime evidence are untouched.

## Work units and rollback boundaries

| Unit | IDs | Implemented behavior | Rollback boundary |
|---|---|---|---|
| Controls and sensory contract | UX-05, UX-14 | Athletic geometry tokens; buttons retain stable labels while busy; default button semantics; persisted per-device motion/haptic/sound preferences; foreground gating; system motion priority; RN Animated rest notification and direct haptics covered. | Shared UI, sensory hooks/utilities, preferences route, root motion configuration and migrated imports. Remove together. |
| Training completion | UX-01, UX-02, UX-06 | First-class finish; last set stops rest; partial-work confirmation; save ambiguity untouched; confirmed one-shot emblem/facts/progress/accent sequence; scrollable results with persistent Done; personal history recap route; explicit minimal text-sharing preview/destination. | WorkoutVictory, workoutExperience, recap route and execution changes. Restore execution and new recap links together. |
| Training continuity | UX-03, UX-04 | Today briefing uses real active plan/draft state; routine-only users start in routine library; optional next-set focus with full-list escape; integrated extend/skip rest and stable critical controls. | TodayBriefing/train and execution focus/rest additions; save machinery stays unchanged. |
| Planning | UX-07 | Explicit seven-day routine/rest template, date labels, repeated independent snapshots and preview; detects unassigned intermediate holes rather than inventing rest; routine-first alternative. | planningPreview, creation screen and empty-plan entry. Existing planner remains usable. |
| Progress and discovery | UX-08, UX-10 | Virtualized searchable personal history leads to recap; existing analytical partitions preserved; exercise loading/error/no-match distinctions, retry and clear controls. | Progress list/header refactor and exercise search state changes. |
| Identity and onboarding | UX-09, UX-12, UX-06 | Athlete/identity/privacy/appearance sections preserve staged state; pending-save notice and dirty navigation guard; truthful onboarding visibility and first-session handoff guidance. Existing required fields and auto-publication defaults retained. | Profile segmentation/guard and onboarding presentation; no schema migration. |
| Community and utility | UX-11, UX-13 | Real More hub with optional rewards entry; unified typed pending inbox with real source rows and independent loading/error/counts; failed feed refresh retains previous successful content with freshness message; deletion confirmation. | More/inbox routes and feed presentation; shop ownership/purchases unchanged. |

## Verification evidence

- Baseline from independent agent: 86 files / 576 assertions passed, but `npm test` exited 1 with unhandled `getRoutine is not a function` in reentry testing. Baseline tracked tree was unchanged. Baseline `tsc` passed.
- Root cause investigated: runtime harness reset singleton mock data while previous React renderers could remain mounted and complete async state updates. Harness now unmounts tracked renderers before resetting state; no production fallback hides missing methods.
- Initial focused run: `npm test -- tests/workoutExperience.test.ts tests/animationActivity.test.ts` — 2 files / 7 tests passed, clean exit.
- Intermediate typecheck found unsupported native accessibilityRole `status`; replaced with `accessibilityLiveRegion="polite"` rather than web-only role.
- Intentional behavior changes require updates to tests that assumed unnamed completion controls, rest after the final set, Shop as More, and all profile settings on one page. Persistence/retry assertions remain mandatory.
- Final full suite and typecheck: see the final command record below.
- Independent interim Expo web export passed on a moving worktree; **not final immutable evidence**. Native iOS/Android visual/performance walkthrough not available in this environment.

## Limits and remaining validation

No invented workout values, PRs, unit-normalized workload, instructional-media library, required-field policy, audience defaults, or analytics collection. Personal recap means owner history view, not a claim no publication exists: automatic GymBro publication still follows existing preferences. Optional system sharing sends only previewed name, time and performed/total set count.

The new motion is nonblocking and reacts to resolved preferences; final facts are immediately in the accessibility tree. Native animation fidelity, composited contrast, touch geometry, dynamic type, VoiceOver/TalkBack, hardware vibration/sound, low-power and background recovery still require physical-device validation. Runtime harnesses use React Native/Reanimated substitutes and cannot certify these.

## Roadmap coverage — implementation versus validation

Each ID has a production implementation. “Implemented” below means the scoped product behavior exists and is exercised by source/runtime-harness checks; it does **not** mean device acceptance or every possible visual refinement is finished.

| ID | Actual delivered slice | Evidence / deliberately separate scope |
|---|---|---|
| UX-01 | Finish is visible outside pause, partial work is confirmed, last set does not start another rest, confirmed result has persistent exit and personal recap. | `activeWorkoutReentry` protects persistence, ambiguous save, retry identity and independent joint publication. |
| UX-02 | Coordinated 1.2 s one-shot emblem, performed-ratio fill, eight bounded accents, staggered facts and confirmed XP reward. No fact is hidden until animation ends. | `workoutVictory` covers immediate detail access, preview-before-share, empty/static state and delayed preference readiness/no replay. Native composition and frame pacing need device testing. |
| UX-03 | Today prioritizes active draft, real planned day/rest/recorded lineage and first routine; routine-only users retain direct library access. Unplanned dates open calendar, not a misleading start claim. | `navigationRedesign` and existing active-workout navigation suites; no invented readiness score. |
| UX-04 | Optional next-set focus, full-list escape, stable timer/finish, integrated extend and skip rest. Inputs retain original set indices. | Existing execution/reentry tests remain; expert speed and sweaty-hand usability need physical task testing. |
| UX-05 | Shared geometry/timing tokens, theme-owned colors, stable busy labels, minimum shared control height and semantic buttons/headings; generic Portal eyebrow removed. | `experienceControls`; does not claim every legacy custom control has received a pixel-perfect redesign. Theme/font-scale contrast requires native review. |
| UX-06 | Explicit minimal system-share preview before destination picker, truthful distinction from existing GymBro auto-publication, grouped privacy and onboarding visibility copy. | Share interaction and existing social privacy tests; audience defaults and required identity fields are unchanged. No new backend preview/publish endpoint. |
| UX-07 | Actual seven-day routine/rest assignment, dates, per-week counts and independent repeated snapshots; holes are rejected rather than silently becoming rest. | `planningPreview`, `guidedPlanningScreen`, existing planning tests. No unreviewed starter workout library. |
| UX-08 | Real current/previous valid-set narrative, analytical compatibility preserved, newest-first virtualized searchable history into personal recap. | `progressScreen` plus existing selectors/analytics tests. No unlike-unit volume aggregation or invented improvements. |
| UX-09 | Profile athlete/identity/privacy/appearance sections with retained draft, visible pending-save CTA, native-compatible removal guard, refresh-safe edits and live frame preview. | `socialScreen`, `experienceControls`; native swipe/back requires physical confirmation. Existing auto-saved background preference is explicitly separate. |
| UX-10 | Exercise loading/failure/retry/no-match states, result count, labeled search and clear filters; outdated filtered rows are not shown as current. | `exerciseCatalog`; instructional photos/video/licensing are a separate content stream, not fabricated assets. |
| UX-11 | Virtualized mixed feed, consolidated pending inbox with actual connection/plan/joint/unread rows, source-specific states and honest counts, stale successful content retained on refresh failure, explicit destructive confirmation. | `socialScreen` tests sorting, request races, stale retention, badges and privacy. No social overlays introduced into focused lifting. |
| UX-12 | Clear optional measurement step and first-session handoff into actionable Today routine creation; no block required. | Existing onboarding semantics retained; `navigationRedesign` presses first-session creation. Identity policy unchanged. |
| UX-13 | More is a real utility destination; profile, preferences, inbox and optional rewards remain reachable. | `navigationShell` and existing shop/theme ownership tests. |
| UX-14 | Persisted device motion/haptic/sound choices, preference-ready static fallback, OS priority, live OS changes, foreground/focus gating, RN rest/social springs, social/rest sound, login glow and global route transitions. | `animationActivity`, `sensorySettings`, notification suites and source import sweep. Native OS notification-channel sounds are not rewritten; settings describe in-app sounds. |

## Final implementation notes

- Native-compatible dirty navigation uses the SDK 56 bundled `expo-router/react-navigation` `usePreventRemove` hook; a bare `beforeRemove` listener alone is insufficient for native-stack gesture prevention.
- Motion readiness never gates saved text/actions. Celebration starts once if permission resolves promptly, otherwise retains the static final result; returning from a share sheet does not replay it.
- Profile refresh cannot replace a dirty draft. Existing profile field normalization and unrelated category preservation remain unchanged.
- Sound effects are independent from motion effects, so changing motion preferences cannot replay a rest/social sound.
- Existing automatic publication is neither disabled nor re-labeled as private. The new personal recap is an owner-history view and expressly describes that distinction.
- Final source normalization used the already-installed TypeScript printer only on new helpers/routes/components; no package installation or repository-wide formatter run.

## Device acceptance still required

1. iOS and Android: finish full/partial session offline, ambiguous save recovery, resume after background, joint-publication retry, immediate Done and OS share cancellation.
2. VoiceOver/TalkBack, largest font scale, OS Reduce Motion toggled while visible, app sensory opt-outs, sound/vibration unavailable and low-power mode.
3. All equipped and combined themes: true contrast, cutouts, keyboard reach, 48-point controls and narrow-screen recap scrolling.
4. Older hardware: bounded victory at target frame rate, long history/feed scrolling, no sustained decorative work on unfocused screens.

These are release validation tasks, not simulated passes. Browser bundling and React host substitutes cannot prove them.

## Final command record — 2026-09-08

| Command | Actual result | Evidence |
|---|---|---|
| `npm test` | **PASS — exit 0; 92 files, 594 tests.** No unhandled error. Run started 21:39:46 and finished in 13.65 s. | `/tmp/gymbro-ux-full.log` |
| `npx tsc --noEmit` | **PASS — exit 0**, empty diagnostic output on final source. | `/tmp/gymbro-ux-writer-tsc.log` |
| `git diff --check` | **PASS — exit 0**, no whitespace errors. | Final writer command output |
| Expo web export | Parent owns final independent export after stable-source handoff. Prior interim export passed but is not final candidate evidence. | Parent verification report |

Final suite adds 18 tests over the original 576 and has a clean process exit, including the stale renderer/mocked-context baseline fix. Relevant new/extended interaction suites: `workoutVictory`, `guidedPlanningScreen`, `progressScreen`, `socialScreen`, `navigationRedesign`, `experienceControls`, `sensorySettings`, `activeWorkoutReentry` and `animationActivity`. Existing authentication, publication, ownership, analytics, recovery and theme tests remain in the full run.

No commits, staging, migrations, deployment, package changes or native lifecycle commands were run by the implementation writer. Source is handed back stable; subsequent human/device validation is explicitly pending.

## Bounded verifier correction — A / B / C

Independent verification admitted three correction items. This single correction batch changes only these behaviors and their tests; it does not reopen the wider modernization scope.

| Item | Correction | Regression evidence / rollback boundary |
|---|---|---|
| A — profile save/refresh | Dirty state compares against the last hydrated baseline, not newly arriving remote state. Clean refresh hydrates; dirty refresh retains edits. `SocialContext.saveProfile` returns the profile already fetched after saving, allowing field-by-field reconciliation of normalized accepted values without overwriting edits made during the request. Rejected/unconfirmed saves keep the draft. | `socialScreen` covers trimmed alias success, clean external refresh, dirty external refresh, rejected save and concurrent edit during save. Roll back profile reconciliation and context return contracts together. |
| B — partial finish | Pause-menu Finish now delegates to the same intent confirmation as the persistent/header finish controls. Saving a partial session requires the explicit “Guardar sesión” action. Canonical recovery retry remains direct and preserves captured identity. | `activeWorkoutReentry` explicitly asserts no persistence before confirmation from pause and preserves recovery/definite-rejection tests. Roll back only shared finish-intent wiring and these assertions. |
| C — actual unified inbox | Replaced the four-link-only launcher with virtualized typed pending rows from existing connection requests, received private plans, invited joint-workout membership and unread notification sources. Each section has loaded counts, loading/error/empty states, independent failure retention, retry and its original destination. Items open existing review/acceptance flows; visiting the inbox never accepts, publishes or marks items read. | `communityInbox` covers real mixed rows/counts/routes, partial failure, stale retention, empty/loading and late responses after account change. Roll back inbox route and its dedicated tests together. |

### Exact inbox coverage

- Connections show the existing first page and `+` when a cursor exists; the complete requests route retains pagination and relationship actions.
- Plans display actual snapshot titles, sender and routine/mesocycle type; their existing review route owns acceptance/import integrity.
- Joint work shows only self-invited, non-completed groups; the existing joint route enforces active-routine association before acceptance.
- Notifications show unread items among the latest 50; counts are explicitly recent, not lifetime totals. Notices may refer to work already present in another section, so the inbox does not invent a deduplicated global pending total.
- Failed sections retain last successful rows with a stale notice. Account changes hide prior-owner rows immediately and invalidate late requests.

The earlier UX-11 launcher-only coverage claim was incomplete; this correction supplies real pending content. No new endpoint, schema, audience default or backend mutation was introduced.

### Correction verification — final stable source

| Command | Result | Log |
|---|---|---|
| `npm test -- tests/socialScreen.test.ts tests/activeWorkoutReentry.test.ts tests/communityInbox.test.ts` | PASS, exit 0 — 3 files / 82 tests | `/tmp/gymbro-corrections-targeted.log` |
| `npm test` | PASS, exit 0 — 93 files / 601 tests (21:51:50, 13.92 s) | `/tmp/gymbro-corrections-full.log` |
| `npx tsc --noEmit` | PASS, exit 0 — no diagnostics | `/tmp/gymbro-corrections-tsc.log` |
| `git diff --check` | PASS, exit 0 | Writer command output |

These results supersede the earlier 594-test candidate. Parent owns the repeated final immutable Expo export. Native device acceptance remains pending. Correction changed exactly four production files (`app/profile/index.tsx`, `context/SocialContext.tsx`, `app/routine/execute/[id].tsx`, `app/community/inbox.tsx`), two existing test files, one new inbox test and this ledger.

### B acceptance completion — cancel and Android dismissal

The partial-finish confirmation now retains its origin. From the pause menu, the cancel action is accurately labeled **“Volver a la pausa”** and restores that menu with elapsed/rest timers still paused. Dismissing the Android alert restores the same state. Only the existing **Reanudar** action resumes timing. From active execution, **“Seguir entrenando”** retains the existing active behavior. Save-confirm and canonical retry behavior are unchanged.

Regression coverage now explicitly exercises pause → partial finish → cancel-button and Android dismissal → visibly paused menu → Reanudar, asserting persisted pause timestamps remain stable until resume. A third regression protects active-origin cancellation. Scope remains only the execution route, its existing reentry test and this B ledger note.

Final B-completion checks: `npm test` **PASS exit 0 — 93 files / 604 tests**, started 21:59:07, duration 14.50 s (`/tmp/gymbro-b-cancel-full.log`); `npx tsc --noEmit` **PASS exit 0**, no diagnostics (`/tmp/gymbro-b-cancel-tsc.log`); `git diff --check` **PASS exit 0**. The execution suite now contains 56 tests, included in that complete passing run. These results supersede the 601-test candidate. Source is stable for parent verification; no native command, commit or deployment occurred.

## Independent delivery verification

The final production candidate, including pause-origin cancellation and Android dismissal, passed independent automated checks after writing stopped:

| Check | Final result | Evidence |
|---|---|---|
| `npm test` | PASS, exit 0 — 93 files / 604 tests | `/tmp/gymbro-ux-delivery-tests.log` |
| `npx tsc --noEmit` | PASS, exit 0 | `/tmp/gymbro-ux-delivery-tsc.log` |
| `git diff --check` | PASS, exit 0 | `/tmp/gymbro-ux-delivery-diff-check.log` |
| `CI=1 EXPO_NO_TELEMETRY=1 npx expo export --platform web --output-dir /tmp/gymbro-ux-delivery-20260908` | PASS, exit 0 — 49 files; HTML-referenced assets exist | `/tmp/gymbro-ux-delivery-export.log`, `/tmp/gymbro-ux-delivery-assets.log` |

Before/after snapshots were identical across 669 tracked and untracked source/config/test/assets files, excluding documentation, pre-existing review artifacts and generated caches. SHA256: `4514cb934a2e9b5931d8c969e5997cfce2eb64a46dca6466ee1ca4f33abe2675`. Evidence: `/tmp/gymbro-ux-delivery-source-evidence.log`. This is source-stability evidence, not a native review receipt.

These results supersede every interim export and 594/601-test candidate above. No production source changed after the delivery checks; this documentation section records their results. Physical-device and authenticated UX acceptance remains pending as listed above. No commit, deployment or backend change was performed.
