# Make GymBro feel like a training companion, not a collection of libraries

**Recommendation:** preserve the existing training integrity and analytical honesty, but reorganize the experience around **Today → Train → Understand → Prepare the next session**. Concentrate visual energy on meaningful training moments; reduce permanent decorative competition and administrative work.

This is a **source-code UX audit dated September 8, 2026**, not a device usability or visual-conformance certification. Source was located through the current CodeGraph index before focused inspection. No production code, database state, or native Gentle AI lifecycle artifacts were changed. Detailed workout execution/completion belongs to the companion workout audit.

## What the evidence supports

- GymBro already has animated backgrounds, gradient/blur surfaces, haptic presses, chart replay, active-workout reentry, and reduced-motion/activity gating. “There is no animation” would be inaccurate. The opportunity is to give animation a clear purpose and improve hierarchy.
- Entry into training is organized around routines/mesocycles rather than a dedicated daily briefing.
- Profile combines identity, collectibles, measurements, privacy, and background preferences in one long save-based screen.
- Progress is analytically rich but asks users to interpret many categories and includes a full mapped history inside a scroll view.
- Several trust and control issues deserve attention before adding spectacle: onboarding privacy wording, sharing discoverability, inconsistent destructive-action confirmation, and shared-button semantics.

**Fact** below means directly observable in the inspected source. **Hypothesis** means an expected usability consequence that still needs device testing or participant evidence. Priority reflects proposed product impact, not a confirmed production incident.

## Coverage and limits

| Area | Inspection depth | Evidence anchors |
|---|---|---|
| Main navigation / daily training entry | Full source | `app/(tabs)/_layout.tsx:70–195,247–292`; `app/(tabs)/train.tsx:15–51` |
| Routine library / creation | Full library; targeted creation | `app/(tabs)/routines/index.tsx:62–143`; `app/routine/create.tsx:29–87` |
| Mesocycle list / creation | List and targeted creation | `app/(tabs)/mesocycles/index.tsx:16–44`; `app/mesocycle/create.tsx:50–152` |
| Exercise discovery / detail | Full discovery, targeted detail | `app/(tabs)/exercises/index.tsx:13–143`; `app/exercise/[id].tsx:32–64` |
| Progress / history | Main render and styles | `app/(tabs)/progress.tsx:77–145,161–175` |
| Community feed / sharing / inbox | Feed and targeted send/accept UI | `app/community/feed.tsx:25–35,71–176`; `app/community/share-plan.tsx:73–89`; `app/community/plan-inbox.tsx:52–64` |
| Profile / preferences / onboarding | Full onboarding and main profile logic/UI | `app/onboarding.tsx:21–82`; `app/profile/index.tsx:69–305` |
| Authentication | Login form component only | `components/login/LoginFormPanel.tsx:92–171,181–206` |
| Themes / surfaces / motion / haptics | Shared primitives | `constants/theme.ts:3–31`; `components/UI.tsx:15–103`; `components/GlassCard.tsx:29–75,108–135`; `hooks/useAnimationActivity.ts:7–35`; `components/HapticPressable.tsx:5–14` |
| Shop / More | Route alias and sampled catalog/actions | `app/(tabs)/more.tsx:1`; `app/(tabs)/shop.tsx:107–207,221–257` |
| Workout execution / completion | Excluded from this report | Companion workout audit |
| Routine detail editor, complete mesocycle planner, measurements detail, discovery/circle/requests, notification settings, password recovery route, public profile | Route inventory only / not exhaustively audited | Must be exercised during the device validation pass |

Not measured: physical tap geometry, rendered contrast, frame rate, keyboard occlusion, assistive-technology output, actual onboarding conversion, production network behavior, or user comprehension. Estimates below are relative scope, not delivery commitments: **S** focused component/screen work; **M** coordinated screens and tests; **L** cross-flow work or new content/data dependencies.

## Priority 0 — make control and trust explicit

### P0-01: Repair the privacy story before amplifying social rewards

**Facts:** onboarding says “Estos datos son privados” immediately before an “Alias público” field (`app/onboarding.tsx:66–74`). Real name, alias, birth date and sex are required by the first-step guard (`33–38`). Profile initializes sharing switches to true and also defaults missing boolean values to true (`app/profile/index.tsx:42–44,77–85,146–154`). The sharing controls appear after several customization sections, and saving occurs at the bottom (`275–305`). The interface explicitly says privacy changes apply only to future posts (`280`). This audit does not establish backend defaults or assert that all accounts automatically publish.

**Hypothesis:** users may incorrectly assume their identity and workouts are private, or believe changing a setting changes existing publications.

**Proposal:** label each field as public/private at collection; explain why required private information is needed; put a sharing summary before the first publication; expose audience and included details in the completion share preview. Separate “future sharing defaults” from “manage existing posts.” Any change to required onboarding fields or default audiences needs an explicit product/data-contract decision.

**Acceptance:** a new user can identify what their circle will see before publishing; privacy changes show exactly whether they affect existing posts; saving reports actual persisted state; failed save does not masquerade as success. Usability participants accurately explain audience and included fields without visiting settings.

**Effort/dependencies:** M for copy/visibility/preview; L if consent persistence, defaults or onboarding schema change. Depends on social publication semantics, not animation work.

### P0-02: Standardize control semantics and protect destructive actions

**Facts:** `GlassButton` supplies disabled/loading behavior but no explicit role, accessible label or busy state; its loading render removes the visible title (`components/UI.tsx:15–81`). `HapticPressable` forwards props but supplies no default semantic role (`components/HapticPressable.tsx:5–14`). The login submit control already explicitly provides role and busy/disabled state (`components/login/LoginFormPanel.tsx:147–155`). Routine deletion has confirmation (`app/(tabs)/routines/index.tsx:45–59`), while feed deletion directly calls `remove` and the deletion service without a confirmation in that path (`app/community/feed.tsx:118–124,138–140`).

**Proposal:** create one accessible button contract with stable names during loading, busy/disabled state, focus treatment, icon labels and a minimum interactive target token. Use a restrained destructive-action menu with confirmation or genuinely reversible undo; do not label a delayed irreversible deletion as undo unless backend semantics support it.

**Acceptance:** shared controls expose consistent button role/name/state; screen-reader users can identify loading actions; rapid taps trigger one mutation; deleting a post requires a clear deliberate step or verified recovery; restoring focus after feedback works on both platforms.

**Effort/dependencies:** M; shared component migration and device assistive-technology checks. Preserve existing confirmation and mutation protections.

## Priority 1 — reorganize around training

### P1-01: Replace the training-library landing with a daily briefing

**Facts:** `train.tsx:27` selects mesocycles when an active mesocycle **or any routine** exists. It renders a library screen with a view switcher (`39–48`). The mesocycle-empty state asks users to create a block (`app/(tabs)/mesocycles/index.tsx:38`). The center tab has different behavior when another tab is active, when already on Train, and when a workout draft exists (`app/(tabs)/_layout.tsx:97–130`).

**Hypothesis:** someone with routines but no block can land on an empty planning view instead of a clear next workout. A navigation item that sometimes opens the page and sometimes starts execution can be surprising.

**Proposal:** a “Today” hero with one primary action selected by explicit state: **Continue active session**, **Start planned session**, **Choose a routine**, or **Recovery day**. Place a compact weekly schedule below it. Libraries become a secondary planning section. Keep the central navigation destination stable; place the action on the hero or a clearly labeled persistent active-session control. Preserve all draft/lineage validation.

**Acceptance:** test new account, routines-only, active block, rest day, completed day, invalid draft and resumable draft. Every state shows an accurate headline and safe next action. A returning user can locate the next session without understanding “mesocycle”; tapping a navigation item does not unexpectedly start a workout. Rest days are valid successes, not failures.

**Effort/dependencies:** L; navigation, day guidance and workout reentry regression coverage. Highest training-flow improvement outside completion.

### P1-02: Make planning accessible without dumbing down expert tools

**Facts:** routines are presented with folder emoji, exercise count, muscle chips, train and delete actions (`app/(tabs)/routines/index.tsx:62–102`). Empty copy describes reusable templates (`121–129`). Mesocycle creation requests name, objective, status, weeks and start date (`app/mesocycle/create.tsx:100–150`).

**Proposal:** offer “Use a routine” versus a quieter “Build a training block” at the appropriate planning entry. Show routine identity through training focus, exercises and last-used information only when available. Offer a guided block preview: choose routines → place training/rest days → review schedule. Keep the expert editor accessible. Move deletion out of the frequent-action row.

**Acceptance:** a routines-only user can train without creating a block; the planner explains the difference between template and scheduled session; edit/duplicate/share/destructive actions are distinguishable; a schedule preview includes recovery days and conflict explanations; existing planned-session lineage remains unchanged.

**Effort/dependencies:** L for guided scheduling; S/M for library hierarchy. Starter templates require reviewed content and provenance, not fabricated fitness prescriptions.

### P1-03: Turn progress from a dashboard into an understandable story

**Facts:** the screen orders summary, level progress, period selectors, body-weight prompt, scope selectors, charts and history (`app/(tabs)/progress.tsx:87–141`). Charts already replay when selected filters change (`94,103,108–113`). Insufficient/incompatible data warnings already exist (`112`). History maps every matching session inside the same `ScrollView` (`80,117–142`).

**Proposal:** show three questions first: **Did I follow my plan? What changed in comparable training? What is next?** Use brief supported statements with expandable evidence. Keep analytical scopes under “Explore data.” Move history to a dedicated searchable/paged view with optional recent sessions on the summary. Show meaningful progress, not repeated cosmetic count-ups on every navigation.

**Acceptance:** insufficient data produces no invented trend; mixed modes/units remain partitioned; deltas show baseline and period; chart meaning is available as text; representative long histories remain responsive; a user can answer what improved and why without interpreting five chart categories.

**Effort/dependencies:** M/L; analytics selectors, list pagination and performance profiling. Preserve the existing warning that exposure does not equal muscle growth (`109`).

### P1-04: Build a restrained athletic design system

**Facts:** shared cards use gradient borders and default blur (`components/GlassCard.tsx:108–135`); the background already breathes, renders three animated orbs and optional decorations (`29–75`). Theme constants supply colors but not spacing/type/motion tokens (`constants/theme.ts:3–31`). The center navigation labels use 10 and 9 point font declarations (`app/(tabs)/_layout.tsx:352–362`).

**Proposal:** an opaque performance surface for data entry, a quieter elevated surface for planning, and a celebration surface reserved for completion/real milestones. Define type, spacing, control sizing, contrast, number alignment, motion duration and semantic state tokens. Keep purchased/custom themes as identity accents without letting them override readable workout data. Use deliberate micro-feedback rather than increasing all ambient motion.

**Acceptance:** all themes pass a rendered contrast and text-scaling matrix; primary action remains visually dominant; critical data is legible over every equipped background; long titles and large text do not collide with navigation; no animation is required to understand a state change.

**Effort/dependencies:** M foundation + incremental migration. Do not claim contrast failures without measuring final composited pixels.

### P1-05: Separate athlete identity from settings

**Facts:** a long profile combines previews, rank, muscle distribution, avatar/frame/title options, public fields, sharing, backgrounds, privacy and measurements; a single save action follows everything (`app/profile/index.tsx:204–305`). Parallax directly calls its preference setter while profile options remain staged until `save` (`284` versus `170–201,305`).

**Hypothesis:** mixed persistence behavior and distant save feedback make it hard to know what has actually changed.

**Proposal:** a concise athlete profile with dedicated **Edit identity**, **Training preferences**, **Privacy & sharing**, **Appearance**, and **Account** entries. Within each editor use either explicit staged save with dirty-state protection or honest per-setting persistence, consistently communicated. Keep measurements private and distinguish body composition information from training-performance judgments.

**Acceptance:** users can find privacy without scrolling through cosmetics; leaving a dirty editor is deliberate; failed saves retain input; an appearance preference cannot be mistaken for saved privacy settings; changes accurately survive reload.

**Effort/dependencies:** M; save semantics and navigation tests.

## Priority 2 — useful delight and stronger discovery

### P2-01: Make exercise discovery help selection

**Facts:** muscle filters include three participation modes and another group search (`app/(tabs)/exercises/index.tsx:80–117`); zero results use “No hay ejercicios todavía” even when filters simply eliminate matches (`120–124`). The filter request has no local rejection handler (`31–43`). Detail is primarily monogram, reference facts and muscle participation (`app/exercise/[id].tsx:32–64`).

**Proposal:** distinguish empty catalog, no matches, loading and request failure; add an explicit clear-filters action. Show relevant training context before taxonomy. Consider reviewed demonstration media, concise setup cues and equipment filters only after confirming content ownership and catalog fields; do not fabricate coaching cues from labels.

**Acceptance:** filtered-empty copy does not imply data loss; failed filter requests offer recovery and do not silently show stale results as current; selected filters are announced; media has text alternatives and never autoplays sound.

**Effort/dependencies:** M for state handling; L for a validated instructional-media library.

### P2-02: Keep community supportive and non-disruptive

**Facts:** six primary/pending destinations precede the feed (`app/community/feed.tsx:25–35,158–168`). Feed loads multiple sources in one `Promise.all`, clears recap content on a non-append load failure, and maps items inside a `ScrollView` (`71–100,158–175`). Reactions are optimistic with rollback (`126–134`). Private sharing explains independent copies and offers a pinned send action (`app/community/share-plan.tsx:76–86`).

**Proposal:** lead with circle activity and a clear invitation entry; group pending work into one inbox with typed sections. Preserve previously loaded content during refresh failures with honest freshness messaging; use a virtualized feed as history grows. Add compact supportive feedback for reactions, not looping spectacle. Keep social prompts out of critical set-entry moments and require explicit publication awareness.

**Acceptance:** a refresh failure does not erase usable existing feed content; reactions remain recoverable after failure; large feeds preserve scroll position; imported plans are clearly independent copies; training can be completed without opening community.

**Effort/dependencies:** M; feed data orchestration, pagination and privacy semantics.

### P2-03: Finish onboarding with readiness, not just registration

**Facts:** onboarding currently collects identity then optional anthropometrics and navigates to Train (`app/onboarding.tsx:24–53,68–80`). Login already supports autofill, show/hide password, requirement feedback and live-region feedback (`components/login/LoginFormPanel.tsx:92–145`); these are strengths to preserve.

**Proposal:** retain a short account flow and progressive optional measurement collection; add a lightweight first-session handoff that helps choose an existing/shared routine or create one. Explain training-block terminology only when needed. Use inline field feedback instead of modal-only validation. Reconsider required sensitive fields through a product decision, not cosmetic redesign alone.

**Acceptance:** users reach a meaningful training choice after account setup; optional measurements never block training; keyboard and screen-reader focus track errors; back navigation retains entries; sign-in/recovery features remain intact.

**Effort/dependencies:** M; first-use state and reviewed starter content if introduced.

### P2-04: Make More truthful and rewards secondary

**Fact:** `app/(tabs)/more.tsx:1` directly reexports Shop, while the tab title is “Más” (`app/(tabs)/_layout.tsx:279–285`). The shop includes themes, frames and backgrounds with previews/equip/purchase states (`app/(tabs)/shop.tsx:107–207,221–257`).

**Proposal:** use a truthful destination label or make More an actual utility hub with an Appearance/Rewards entry. Link meaningful earned rewards from an optional post-training celebration; never make shopping a required step to record or finish training. Preserve existing ownership and equipped-state behavior.

**Acceptance:** first-time users can predict the destination from its label; no reward is portrayed as fitness performance; dismissing rewards preserves all training outcomes.

**Effort/dependencies:** S/M; information architecture and reward presentation.

## Motion direction: earned energy, calm between efforts

The existing `useAnimationActivity` already checks reduced motion, app state and navigation focus (`hooks/useAnimationActivity.ts:7–35`). Extend this foundation rather than replacing it.

| Context | Proposed behavior | Reduced-motion equivalent |
|---|---|---|
| Navigation / selecting a filter | Short positional or opacity transition that preserves orientation | Immediate stable state |
| Completing a real task | One restrained success response, with optional haptic | Static confirmation + text |
| Charts | One entry/reveal on meaningful change; values readable immediately | Static chart + textual summary |
| Loading | Stable skeleton only where useful, no forced viewing delay | Static placeholder |
| Background decoration | Lower salience; pause outside focused foreground screens | Static surface |

Timing, haptic intensity and device performance budgets must be tuned on real devices. Never delay persistence, block a CTA, flash repeatedly, or require full animation playback to leave a screen. Add explicit sensory preferences only with coherent persistence and operating-system preference handling.

## Delivery and validation

1. **Baseline:** record current flows on iOS and Android with realistic new/returning/rest-day/large-history accounts. Capture completion separately with the companion audit.
2. **Control foundation:** button semantics, deletion safety, truthful privacy wording, stable loading/error states and visual tokens.
3. **Training-first pilot:** Today briefing and completion prototype, then test task comprehension before migrating every surface.
4. **Platform migration:** planning, progress/history, profile/settings and community using shared foundations.
5. **Polish:** purposeful motion, reviewed instructional media and optional reward presentation after usability problems are resolved.

### Evidence still required before claiming a complete UX audit

- Device walkthrough of every route and network/empty/error state, including the coverage gaps above.
- Small and large phone sizes, large text, long names, both visual profiles and representative equipped themes/backgrounds.
- VoiceOver/TalkBack navigation, screen-reader labels and focus after dialogs; motion preference changes and haptic preferences.
- Weak/offline network, interruption/resume, repeated taps and authentication transitions.
- Frame-time/scroll responsiveness on a modest Android device and representative iPhone; measure before adding effects.
- Moderated tasks: start today's workout; find a previous session; distinguish routine versus scheduled session; change future audience; explain who sees a publication; recover from a failed action.

Suggested product measures: time and taps to the correct training action, accidental navigation/backtracking, task completion rate, privacy comprehension, save/retry failure recovery and perceived clarity/delight. Establish baselines first; do not invent improvement percentages. Optimize successful, confident training rather than time spent in the feed or the shop.
