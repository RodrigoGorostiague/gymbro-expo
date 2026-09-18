# Make training the hero: execution and completion audit

**Recommendation:** evolve the existing workout system into a focused training cockpit and a short, skippable victory recap. Keep persistence, retry safety, accessible alternatives, and optional sharing independent of spectacle. The biggest opportunity is not “add animations”; it is to connect accomplishment, meaningful training feedback, and the next action.

## Scope and confidence

- Date: 2026-09-08. Source-backed inspection of the current checkout; no production edits, test execution, or native runtime/review lifecycle actions.
- **Confirmed** means directly supported by source below. **Hypothesis** means a likely usability consequence, not a measured user failure. **Device-unvalidated** means rendering, touch, sound, performance, and assistive-technology behavior require real iOS/Android sessions.
- CodeGraph was consulted first. Targeted source reads filled sections truncated by its output. No historical audit claim was accepted without current evidence.
- This report does not claim a complete empirical mobile usability audit. It specifies the training-focused audit findings and proposals for the broader app audit.
- All source locations below are absolute paths rooted at `/home/rodaja/Workspace/GymBro`. Line numbers describe this snapshot and can drift after edits.

## Current journey and findings

| Stage | Source-confirmed behavior | Opportunity / hypothesis | Priority |
|---|---|---|---|
| Enter training | `/home/rodaja/Workspace/GymBro/app/(tabs)/train.tsx:22–48` chooses mesocycles by default when either an active mesocycle **or any routines** exist, supports a view switcher, and surfaces a resumable workout. | A routine-only user may land on a planning-oriented surface instead of the most direct workout launch. Validate with routine-only and new-user journeys; make “today / resume / choose workout” the primary hierarchy. | P1 |
| Resume | `/home/rodaja/Workspace/GymBro/components/ActiveWorkoutCard.tsx:34–42,100–154` shows next set, progress, elapsed time, resume, and cancel. The resume control also starts an 800 ms hold-to-cancel ring (`13,57–89,117–125`). | A destructive secondary gesture is multiplexed onto the primary positive action. Preserve explicit cancellation and confirmation; remove the hidden hold behavior unless usability testing demonstrates value. | P1 |
| Configure and start | `/home/rodaja/Workspace/GymBro/app/routine/execute/[id].tsx:1071–1103` presents a numeric rest setting and start button. `497–530` prevents duplicate starts and handles an existing session and start errors. | Replace repeated configuration with a compact workout brief and remembered rest choice. Surface routine name, planned focus, set count, and last-used settings. Avoid a mandatory cinematic countdown. | P1 |
| Perform sets | `/home/rodaja/Workspace/GymBro/app/routine/execute/[id].tsx:1197–1203,1262–1382` virtualizes exercise rows, but each set renders type, load, repetitions, effort, delete, and completion/edit controls. | Dense repeated form controls compete with the current set. Propose one prominent current-set card, compact future/history rows, advanced editing on demand, and a full-list alternative for experienced users. | P1 |
| Correct a set | `/home/rodaja/Workspace/GymBro/app/routine/execute/[id].tsx:838–867,1352–1368` validates load/reps, permits reopening, and gives a completed badge. | Keep correction easy and non-punitive. Replace generic modal validation with field-local guidance; contextualize completion labels with exercise and set for screen readers. | P1 |
| Rest | `/home/rodaja/Workspace/GymBro/app/routine/execute/[id].tsx:445–484,838–855` starts rest after every completed set. `/home/rodaja/Workspace/GymBro/components/RestCompletionBadge.tsx:22–47` animates a swipe-dismissable notice and plays sound. | Last-set completion still starts rest; there is no conditional “all sets done” transition in this handler. Offer an immediately reachable “Finish workout” action when all sets are complete, without auto-saving or forcing exit. During ordinary rest, show next exercise/set and explicit extend/skip controls. | P1 |
| Reach controls | `/home/rodaja/Workspace/GymBro/app/routine/execute/[id].tsx:812–825,1177–1196` hides top timer/pause controls while scrolling down. | Finishing and pausing become harder to discover while navigating a long session. Keep an always-reachable compact action dock or stable timer chip. Validate occlusion with keyboard and social dock. | P1 |
| Finish | `/home/rodaja/Workspace/GymBro/app/routine/execute/[id].tsx:683–686,1437–1459` exposes finish in the pause modal alongside resume and cancellation. | Finishing is conceptually nested under pausing. Make it a first-class action, with a lightweight review of incomplete sets when relevant. Avoid an extra confirmation when all valid sets are completed. | P1 |
| Save and recover | `/home/rodaja/Workspace/GymBro/app/routine/execute/[id].tsx:914–999,1158–1164` captures finalization, locks ambiguous results, retries the same attempt, and shows pending confirmation. | Preserve this valuable safety model. Separate “saving,” “confirmation uncertain,” “saved,” and “share pending”; never show a saved celebration before confirmation. | P0 design invariant |
| Celebrate | `/home/rodaja/Workspace/GymBro/app/routine/execute/[id].tsx:1106–1155` renders a centered non-scrollable glass card, emoji, duration, gems, XP, reward entries, and one routine-return button. | Reward accounting dominates training accomplishment. The non-scroll layout is an overflow risk at large text sizes or with joint errors, not a proven device defect. Make the recap scrollable with a reachable persistent exit. | P1 |
| Understand results | `/home/rodaja/Workspace/GymBro/components/WorkoutRecapAnalysis.tsx:9–39` already supplies completed sets, volume, repetitions, prior-session comparison, and expandable exercise detail on the social recap route. | Reuse the meaning and calculation boundaries, not necessarily the exact presentation. The done branch has no direct recap button, which breaks the emotional-to-analytical transition. | P1 |
| Share or return | `/home/rodaja/Workspace/GymBro/app/routine/execute/[id].tsx:934–948,1141–1151` contains joint payload preparation and independent publication retry, but only a “return to routines” primary navigation action. | Offer optional preview-led sharing and a context-aware return to training/plan. Do not require public publication to review one's own workout. Existing joint behavior is not evidence of a general private-first sharing model. | P1 |

## Existing strengths to preserve

1. **Motion and tactile feedback exist.** Completion has an XP fade at 220 ms and zoom at 360 ms (`/home/rodaja/Workspace/GymBro/app/routine/execute/[id].tsx:1119–1124`), plus a success haptic after finalization (`968`). Set celebrations are theme-gated (`855,1467`) and use configurable particles/flash (`/home/rodaja/Workspace/GymBro/components/ExclusiveSetCelebration.tsx:13–15,45–74`). The critique should be “fragmented and reward-led,” not “zero animation.”
2. **Training state is resilient by design.** App focus reconciles clocks (`/home/rodaja/Workspace/GymBro/app/routine/execute/[id].tsx:302–387`); pause/resume stores time and rest (`606–653`); hardware back saves before leaving (`344–355`). Pending finalizations survive reentry. Never replace these with animation-owned state.
3. **Reduced-motion support is partially visible, not globally proven.** `/home/rodaja/Workspace/GymBro/components/BackgroundEngine.tsx:39–45` explicitly uses `ReduceMotion.System`; it also uses animation activity and a parallax preference (`68–82`). The inspected RN Animated rest-badge spring has no explicit reduced-motion branch. Some Reanimated APIs may apply library defaults: absence of an explicit flag is NOT proof they ignore OS settings. Test all pathways and establish one app-level motion policy.
4. **Feedback is already multimodal.** `/home/rodaja/Workspace/GymBro/utils/haptics.ts:4–30` skips web and has vibration fallbacks, with a stronger rest pattern on Android. `/home/rodaja/Workspace/GymBro/components/HapticPressable.tsx:5–13` adds light feedback to presses. Intensity and repeated patterns need device review rather than indiscriminate additional effects.
5. **Recap data boundaries matter.** `/home/rodaja/Workspace/GymBro/components/WorkoutRecapPresentation.tsx:29–50` intentionally consumes a sanitized presentation model. Visual redesign must not expose private templates, performed details, or hidden source fields by bypassing sanitization.

## Proposed experience: training cockpit

### Entry: “What am I training today?”

- Resume wins when a valid active attempt exists; expose exact next set and saved state.
- Otherwise show the next executable planned session; for routine-only users show a direct routine launch path.
- Keep plans, routine library, and customization available below the training decision, not ahead of it.
- A compact preflight displays workload and rest defaults. Changes apply to the session unless explicitly saving a template change.

### Active: one set, one clear action

- Current exercise header: name, exercise position, session progress, and an optional technique reference.
- Current set: large load and reps, visible units/load mode, last comparable prescription only when valid, one complete action.
- Future sets are compact, completed sets are reviewable, and expert editing remains available without being repeated at full visual weight.
- Completion feedback is local: a brief check/progress transition, one haptic if enabled, then a rest state. No confetti cloud after every routine tap.
- Rest mode retains the same spatial anchor, displays a countdown and next set, and offers extend/skip. No guilt-inducing countdown pressure or implied medical recommendation.
- Social presence collapses to an optional subtle chip during performance. It never covers entry fields or competes with the current set.

## Completion storyboard: a victory, not a receipt

**Proposed timing budgets, not measurements or implemented behavior.** Content and actions appear immediately; the sequence never locks navigation.

| Moment | Presentation | Contract |
|---|---|---|
| Finish intent | Close keyboard; show honest set completion and save status. Incomplete session offers “Save performed sets” / return to training. | No automatic completion of unperformed sets; cancellation stays distinct. |
| Await confirmation | Stable recap skeleton or ready data with “Saving workout.” Avoid fabricated percentage progress. | Preserve attempt ID and existing ambiguity lock. Animation never controls persistence. |
| Confirmed, 0–300 ms | Session progress resolves into a compact emblem/check; show “Workout saved.” One optional success haptic. | Only after confirmed finalization; instant static equivalent in reduced motion. |
| 200–800 ms | Hero: “Session complete” or “Session saved” for partial work; routine name and three training facts: time, completed sets, valid workload metric. | Final numeric values accessible immediately; no screen-reader countdown announcements. |
| 600–1400 ms | One evidence-backed highlight: specific PR, consistency achievement, or honest completion fact. A short directional light/particle accent, not looping confetti. | No invented PR, unsupported improvement, or shame when no record exists. |
| 900–1600 ms | Secondary XP/rewards row; level progress moves once from validated previous to resulting state when both are known. | Never infer a previous XP state or replay awards on reopening. Raw reward kind identifiers become localized, meaningful labels. |
| Always available | Primary “View workout”; secondary “Share”; persistent “Done.” Below: expandable exercise analysis and next planned session/rest-day context. | Sharing is optional, review works privately, all actions work while animation plays. |

### Recap information hierarchy

1. Training achievement: completed work and one meaningful highlight.
2. Three relevant facts, with accurate load mode/units; no universal “more volume is better” claim.
3. Optional deeper analysis using trustworthy comparable sessions. Explain when no comparison exists.
4. Rewards as supportive motivation, not the definition of a successful workout.
5. Optional share preview with audience and detail choices; no accidental publishing from “Done.”

### State matrix

| State | Required behavior |
|---|---|
| Full session, no PR | Celebrate completion without implying failure to improve. |
| Partial session | Honest saved wording and performed/total sets; no fake 100% completion ring. |
| Zero performed sets | Explain that there are no performed sets; offer return or discard according to validated product rules. Do not invent rewards. |
| Saving / ambiguous timeout | Preserve locked attempt and explicit retry; do not award or duplicate records visually. |
| Saved, rewards unavailable | Confirm workout only; omit or mark reward status according to actual receipt availability. |
| Saved, social publication failed | Keep saved success prominent; offer independent publication retry and allow exit. |
| Reopened recap | Show final values; no automatic celebration replay, repeated sound, or repeated haptics. |
| No comparable history | Show a first-session baseline, not a made-up trend. |
| Bodyweight / assisted / mixed units | Use metrics compatible with recorded load semantics; do not blindly sum incomparable workloads. |
| Reduced motion / sound off | Equivalent information and actions; no particle, zoom, or parallax requirement. |

## Accessibility and performance guardrails

- Define app preferences for sensory effects independently: motion, haptics, and rest sound. Honor OS reduced motion; default safe static behavior while preference state is unresolved.
- Confirm screen-reader focus on the saved heading once, meaningful button roles and contextual labels, and no repeated live timer announcements. Rest completion is announced once, not every tick.
- Exercise complete actions currently lack explicit role/context in their call site (`/home/rodaja/Workspace/GymBro/app/routine/execute/[id].tsx:1363–1368`); test native semantics before asserting failure. Supply robust semantics during redesign.
- Test large text, high contrast, long exercise names, one-handed reach, numeric keyboard, landscape where supported, and smallest supported device. Measure actual touch targets instead of inferring them from screenshots.
- Essential meaning never relies on color, sound, vibration, animation, or swipe alone. Every gesture has a visible equivalent.
- Keep main-thread timers independent from visual interpolation. Stop decorative work on blur/background and remove long-lived sensor/decorative work from focus mode when unnecessary.
- Proposed performance target: responsive primary interaction within 100 ms on the agreed baseline device; no sustained animation jank at that device's refresh target. Profile representative physical low/mid-tier Android and iPhone devices before committing a rendering budget.
- Keep particle count bounded, mount celebrations briefly, and avoid stacking blur, sensor parallax, particles, and large layout animations. Existing FlatList and blur-disabled exercise cards are assets to preserve.

## Delivery slices and acceptance criteria

### Slice 1 — reliable, readable finish (P1)

- [ ] A user can discover finish without opening pause; the last valid set surfaces finish rather than only starting another rest period.
- [ ] Save confirmation, ambiguity, and publication errors remain distinct and retry-safe; no new state is driven by animation callbacks.
- [ ] Completion scrolls under large text and long reward/error content; Done remains reachable.
- [ ] Private workout detail is reachable from completion without sharing or searching the feed.
- [ ] No existing resume, correction, pending-finalization, or joint-retry protection is removed.

### Slice 2 — expressive recap and motion policy (P1)

- [ ] The storyboard is skippable from its first visible frame; reduced motion exposes identical final information immediately.
- [ ] Highlights and rewards derive from confirmed data; PR wording names what changed when data supports it.
- [ ] Finish, back, reopen, and app background do not replay an award or duplicate save/share operations.
- [ ] All relevant themes, screen readers, sound settings, and vibration settings pass device checks.

### Slice 3 — focused active session (P1/P2)

- [ ] A representative user can identify the current exercise, next set, remaining rest, and session progress without scrolling/searching.
- [ ] Expert editing and full-list navigation remain available; active/finished sets can be corrected safely.
- [ ] Keyboard, social presence, and rest controls never obscure the primary training action on baseline devices.
- [ ] Compare old/new completion time, logging mistakes, accidental cancels, and find-finish success before declaring improvement.

### Slice 4 — optional share and retention (P2)

- [ ] Preview shows the intended audience and included data before publishing.
- [ ] Saving a workout does not silently imply broader audience consent.
- [ ] Sharing failures never downgrade a saved workout; retry remains independent and duplicate-safe.
- [ ] Next-session context respects the current plan and recovery days; no coercive streak or volume pressure.

## Validation plan and open evidence

Conduct recorded device walkthroughs of: new user, routine-only user, planned workout, resumed session, all sets complete, partial finish, save timeout/restart, joint share failure, long workout, reduced motion, and large text. Ask users to finish without hints; measure discovery and confidence, not just aesthetic preference. Test both theme-gated celebration and ordinary theme paths. Audit iOS/Android sound/vibration behavior explicitly; web preview cannot establish native quality.

Needed before implementation: approved visual direction, baseline devices, actual rendered screenshots/recordings, user testing of the finish hierarchy, and verified metric/share semantics. This proposal adds no backend guarantees, no medical advice, and no new production dependency.

## Official implementation references

- Haptics are supplemental: iOS may produce no tactile effect in Low Power Mode, when disabled in settings, or while camera/dictation is active. A fulfilled call must not be treated as proof the user felt it. [Expo SDK 56 Haptics](https://docs.expo.dev/versions/v56.0.0/sdk/haptics/).
- Reanimated documents `ReduceMotion.System` as the default for its animations. Explicit-flag searches alone cannot diagnose reduced-motion compliance; review the RN Animated and sensor paths separately and test the complete experience. [Reanimated accessibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/).
