# GymBro: make every workout feel purposeful

**Proposed direction: calm while lifting, expressive when achievement matters.** Modernize the complete journey rather than adding effects to existing screens. Start with a trustworthy finish and meaningful recap, then align entry, execution, planning, progress, community and settings.

Estado actualizado (20/09/2026): propuesta histórica autorizada e implementada posteriormente en 14 cortes. Ver [registro de implementación](ux-modernization-implementation-2026-09-08.md) y [roadmap vigente](roadmap.md); aceptación física pendiente.

Original audit context — audited checkout: `aec6b24`, September 8, 2026. No production code, dependencies, database, commits or historical runtime evidence were changed.

## Read this first

1. Review the completion direction and delivery order below.
2. Inspect the evidence in the [training audit](/home/rodaja/Workspace/GymBro/docs/ux-audit-2026-09-08-training.md) and [platform audit](/home/rodaja/Workspace/GymBro/docs/ux-audit-2026-09-08-platform.md).
3. Validate the proposed journey on physical devices before accepting a production-wide redesign.

The audit covers source-level interaction structure and sampled platform surfaces. It is **not** a completed native visual, accessibility, performance or user-research audit. The companion reports explicitly identify uninspected routes and unmeasured behavior. The interactive completion concept uses demonstration data, not a live account, and does not implement save or publication logic.

## Diagnosis

GymBro already contains animations, haptics, customization, recap analytics and recovery safeguards. The modernization opportunity is to connect these capabilities into a coherent training experience.

| Verified observation | Why it matters | Proposed correction |
|---|---|---|
| Finish is inside pause; completing the last set still starts rest | The task's natural endpoint is not the dominant action | Surface finish directly and recognize the last performed set |
| Completion emphasizes XP/gems and offers return to routines, without direct recap navigation | Reward accounting replaces reflection on the actual workout | Training achievement first, deeper analysis next, rewards secondary |
| Routine-only users can initially land in mesocycles | Starting training requires interpreting planning structure | State-aware Today briefing and direct routine entry |
| Onboarding calls data private near a public-alias field | Social expectations can be unclear | Explicit field visibility and preview-led publication awareness |
| Shared control semantics and save conventions differ | Predictability and access are inconsistent | One accessible control contract and coherent editor persistence |

These are source observations; frustration, discoverability and perceived delight remain hypotheses to test. See companion source anchors for evidence and qualifications.

## Target journey

**Today → Ready → Focus → Rest → Save → Celebrate → Understand → Return.**

- **Today:** resume an active workout, start the appropriate planned session, choose a routine, or acknowledge a recovery day. One primary action, accurate to state.
- **Ready:** focus, planned sets and remembered rest settings. No forced countdown or repeated setup.
- **Focus:** current exercise and set dominate. Load, reps and one completion action; detailed editing stays available without competing for attention.
- **Rest:** stable countdown, next set, skip/extend and visible pause. Feedback helps orientation rather than creating urgency.
- **Save:** confirm performed work, handle incomplete sessions honestly, preserve retry identity and uncertainty safeguards.
- **Celebrate:** one short, skippable reveal; real training facts and a valid highlight. Never gate actions behind animation.
- **Understand:** private recap with expandable exercises and comparable historical context when valid.
- **Return:** optional sharing preview, then the relevant training context. Recovery days and non-record sessions remain positive outcomes.

## Signature moment: completion

Replace the reward receipt with a workout story. The proposed sequence starts only when the workout is confirmed saved; social publication is a separate state.

| Layer | Content | Motion proposal |
|---|---|---|
| Confirmation | Workout saved; actual routine and performed-set status | Short progress-to-check transition, optional single success haptic |
| Achievement | Duration, completed sets, valid workload or another appropriate measure | Brief coordinated reveal; final values immediately accessible |
| Highlight | A verified record, comparable improvement, or simply completed planned work | One focused accent; no invented record or universal volume ranking |
| Supporting rewards | Actual XP/reward receipt, only when available | One bounded progression, not replayed on reentry |
| Agency | Workout detail, optional share preview, Done | Available immediately and throughout animation |

Proposed reveal envelope: approximately 0.3–1.6 seconds, not a forced viewing duration or performance claim. Reduced motion presents equivalent final content immediately. Sound is optional, and vibration never carries essential meaning alone.

**Do not trade away reliability for spectacle:** timeout must not look like saved success; retries must not duplicate sessions; a failed share must not erase a successful workout; partial sessions must not show a false 100%; reopening a recap must not award or celebrate again automatically.

## Proposal portfolio

Effort is relative scope, not elapsed-time estimation: S = focused component/screen, M = coordinated screens, L = cross-flow/data work. Source reports contain detailed acceptance checks.

| ID | Proposal | Priority / effort | Dependency or key tradeoff |
|---|---|---|---|
| UX-01 | Discoverable finish, honest saving states and reachable private recap | P1 / M | Preserve current persistence and retry safeguards; first visible product slice |
| UX-02 | Expressive completion storyboard and real achievement highlights | P1 / M | UX-01, validated metric semantics and motion policy |
| UX-03 | Today briefing with state-aware start/resume/recovery | P1 / L | Planned-session and draft lineage; avoid removing expert library access |
| UX-04 | Focused current-set cockpit and integrated rest | P1 / L | Retain full-list editing and corrections; compare novice and expert tasks |
| UX-05 | Athletic design tokens and reusable accessible controls | P0 foundation / M | Semantic controls first; migrate visual surfaces incrementally |
| UX-06 | Clear identity visibility, publication preview and privacy controls | P0 clarity / M–L | Changing audience defaults or required fields requires explicit product decisions |
| UX-07 | Guided planning with routine-first entry and schedule preview | P1 / L | Existing planning rules; reviewed starter content if introduced |
| UX-08 | Progress narrative, meaningful comparisons and scalable history | P1 / M–L | Preserve incompatibility warnings and analytical honesty |
| UX-09 | Profile separated from settings, consistent save behavior | P1 / M | Dirty-state protection and accurate persisted feedback |
| UX-10 | Exercise search states, clearer filters and selection context | P2 / M | Instructional media is a separate content/licensing workstream |
| UX-11 | Supportive community, unified inbox and resilient feed refresh | P2 / M | Privacy and pagination; social activity must not interrupt lifting |
| UX-12 | First-workout onboarding handoff | P2 / M | Do not require body measurements or a block merely to start training |
| UX-13 | Truthful More destination and optional rewards entry | P2 / S–M | Preserve purchased/equipped customization and ownership |
| UX-14 | App-wide sensory policy: motion, haptics, sound, foreground activity | P1 / M | Existing reduced-motion foundation; verify every animation engine/device path |

Priorities express UX sequencing and trust risk, not a formal security severity classification. P0 does not assert a reproduced data leak or native accessibility failure.

## Visual and motion direction

- **Performance surfaces:** opaque and stable behind workout fields; strong typography and aligned numbers; one dominant action.
- **Planning surfaces:** quieter hierarchy, compact previews and progressive disclosure rather than repeated full-size cards.
- **Celebration surfaces:** deliberate contrast, spacious achievement typography and a brief focal accent. Keep cosmetic identity without sacrificing data legibility.
- **Semantic system:** shared spacing, typography, target size, surface, focus, error, saving and success tokens. Validate every equipped theme, not just the default.
- **Motion grammar:** local feedback for a set, orientation for transitions, recognition for milestones. Avoid perpetual decorative activity in the training cockpit.

Recommend evolving existing Reanimated/haptics capabilities rather than introducing a new animation dependency before profiling. This lowers migration scope; advanced custom effects remain possible later if they demonstrate value and meet device budgets. The installed package manifest already includes Reanimated, haptics and Skia; no installation is proposed here.

For Android, use at least 48 dp effective targets and verify text/non-text contrast and accessible descriptions according to [Android accessibility guidance](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility). Use platform-equivalent native checks on iOS, not web-only certification.

Respect the documented [Reanimated reduced-motion behavior](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/) and check RN Animated/sensor paths separately. [Expo SDK 56 Haptics](https://docs.expo.dev/versions/v56.0.0/sdk/haptics/) documents situations where tactile output is unavailable. Interaction-triggered nonessential motion should be disableable, consistent with [W3C animation guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html); this reference is a design guardrail, not a native conformance claim.

## Delivery order

1. **Baseline and trust:** record current native flows; confirm privacy language, accessible controls and save/retry behavior. Establish measurements rather than inheriting past test results as current evidence.
2. **First vertical slice:** finish action → confirmed save → meaningful recap → independent optional share → return. Introduce only the tokens and motion policies this slice needs, rather than waiting for a full design-system rewrite.
3. **Training continuity:** Today, preflight, current-set focus and rest. Keep an expert path; do not force sequential logging or remove existing capabilities.
4. **Platform coherence:** planning, progress/history, exercise discovery, profile/privacy and community on the shared system.
5. **Device polish and rollout:** reduced motion, themes, text scaling, screen readers, interruption, network failures, performance and gradual adoption.

This incremental approach gets the most important experience in front of users early and limits regressions. A big-bang reskin may create faster visual consistency, but risks hiding flow problems and widening the regression surface; it is not recommended.

## Validation and success criteria

Recruit representative new and returning users, including routine-only and planned-block users, for moderated tasks. Include assistive-technology users where possible; do not treat a small qualitative round as statistical proof.

| Task | Observe / measure | Acceptance direction |
|---|---|---|
| Start or resume the correct workout | Time, taps, wrong destinations, facilitator help | Less search than baseline; no unexpected session start |
| Log and correct a set | Errors, reach, keyboard conflicts, expert speed | Clear current task without losing advanced editing |
| Finish without hints | Discoverability, completed/partial understanding | Finish found directly; honest performed-work recap |
| Recover from timeout and restart | Persisted attempts, duplicate records, confidence | No loss or duplication; uncertainty clearly explained |
| Explain results and share audience | Comprehension, accidental disclosures | Correct interpretation before publication |
| Use large text/reduced motion/screen reader | Clipping, focus, semantic output, reachable actions | Equivalent information and task completion |

Track proposed events such as finish intent, confirmed save, recap viewed, explicit share confirmation and retry outcome with minimal metadata. Do not log names, notes, body measurements or raw workout payloads simply to measure UX. Confirm analytics consent and existing infrastructure before implementation. No telemetry was added.

Establish baseline distributions before setting numeric improvement targets. Success is confident training and recovery from errors, not longer screen time, more sharing, higher load, or compulsive streak engagement.

## Remaining validation boundary

- Native walkthroughs and screenshots of every route, including the coverage gaps in the platform report.
- Weak/offline network, partial/zero-set completion, joint workouts, restart and pending finalization.
- Small phones, long names, large text, representative themes, VoiceOver/TalkBack and sensor/haptic settings.
- Frame-time and interaction measurement on agreed physical baseline devices.
- Approval of visual direction and product-sensitive sharing/onboarding changes before implementation.

The concept validates a proposed interaction visually in a browser only. It is not an Expo build, native performance benchmark, or persistence implementation.
