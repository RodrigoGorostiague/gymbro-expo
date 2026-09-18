# Learn GymBro by completing a real workout

**Status: implementation-ready design proposal, not implemented or usability-validated.**
Code-inspected on 2026-09-11 against the current working tree, including existing uncommitted training changes. This document introduces no application code, migrations, training records, or native SDD lifecycle actions.

## Decision and quick path

Add optional contextual guidance to existing screens: **prepare a routine → record a real workout → understand its result**. Teach mesocycles separately when the person chooses to plan several weeks. Keep the current visual system and working controls; do not create a mandatory introductory carousel or a second workout flow.

1. Offer a small, dismissible “Primer entrenamiento” card in Entrenar.
2. Explain only the next unfamiliar decision beside the existing control.
3. Advance from persisted domain evidence, never from tapping “Next”.
4. Keep every topic accessible from a new “Cómo usar GymBro” destination in Más.

**Success:** a new user can prepare a usable routine, record actual series, finish, and find their result without moderator instruction. A user can explain how a routine, planned session, and recorded workout differ.

## Existing behavior versus proposed work

Paths below are repository-relative within `/home/rodaja/Workspace/GymBro`.

| Verified existing behavior | Design consequence / proposed addition |
|---|---|
| `app/onboarding.tsx` collects identity and optional measurements, then opens `/(tabs)/train`. It already mentions choosing a first routine. | Do not add mandatory account-onboarding steps. Functional guidance starts after authenticated data hydration. |
| `app/(tabs)/train.tsx` handles loading/error/offline recovery before its ready state; renders TodayBriefing, active-workout recovery, and routine/mesocycle switcher. | Place guidance after recovery/status content, before the switcher; suppress promotional guidance during recovery. |
| `app/routine/create.tsx` persists name + muscle groups, then replaces to `/routine/[id]`. The routine initially has no exercises. | Creation alone does NOT complete “prepare routine”. Explain the second stage. |
| `app/routine/[id].tsx` maintains local editor fields; “Guardar rutina” persists edits. Catalog exercises copy default series. Execute is a separate existing action. | Explain planned values and save requirement. Guide CTA must not execute unsaved editor values. |
| `app/routine/execute/[id].tsx` has setup, active, done, and recovery states. Setup explicitly starts the workout. Done renders WorkoutVictory, with details opening `/session/recap/[id]`. | Reuse these phases; opening setup/help must never create an attempt or start the timer. |
| `app/session/recap/[id].tsx` resolves the personal session and offers correction; `app/(tabs)/progress.tsx` exposes history/progress. | Offer one next action to inspect recorded results, then progress. Do not duplicate recap metrics. |
| `app/mesocycle/create.tsx` already includes a base-week planner and preview, optional date, 1–52 weeks, and draft/scheduled/active status. | Extend the existing planner explanation rather than replace it with a wizard. |
| `utils/planningPreview.ts` repeats the assigned prefix of the week, rejects gaps before later assignments, distinguishes rest from unassigned, and snapshots routines. | Teach these exact rules before save, including a gap error example. |
| `app/mesocycle/summary/[id].tsx` enforces active-plan, planned-entry, and date eligibility. Resume carries plan lineage. | Help must never bypass execution eligibility or turn a planned workout into a standalone workout. |
| `utils/storage.ts` uses profile-keyed AsyncStorage for active training and release-note acknowledgments. | Separate local, profile-keyed guide metadata from domain records and auth onboarding. |
| `app/(tabs)/more.tsx` has no help destination. Current product copy is Spanish. | Add a Spanish help destination and neutral Spanish copy; technical implementation identifiers remain English. |

## Screen design and exact proposed copy

Use existing ThemeBackground, GlassCard, GlassButton, HapticPressable, and theme tokens. Match current spacing: 20 px screen inset, 12–16 px card gaps, normal document flow. These are text wireframes, not a completed visual/device audit. One primary action per guidance card; essential field explanations remain visible without opening help.

### A. Entrenar: invitation and resumable checklist

```text
[Existing status / active-workout recovery, if any]
Primer entrenamiento                         [Ocultar]
Prepara una rutina, registra lo que haces y revisa el resultado.
1. Preparar una rutina           [Pendiente / Listo]
2. Registrar un entrenamiento    [Pendiente / Listo]
3. Revisar el resultado           [Pendiente / Listo]
[Empezar] or [Continuar guía]
Puedes entrenar sin crear un mesociclo.
[Existing routines / mesocycles navigation and content]
```

Initial invitation shows only title, body, Empezar, and Ocultar; reveal checklist after explicit opt-in. Do not show a second competing first-routine card in the empty library: when mounted through Entrenar, use the library's existing create action as the same guide destination. Direct library visits retain their empty state.

Empezar/Continuar resolves the next eligible destination at tap time: no suitable routine → `/routine/create`; incomplete selected routine → `/routine/{id}`; saved usable routine → `/routine/execute/{id}` setup; confirmed result → `/session/recap/{id}`. If several suitable routines exist, open the routine library for explicit selection, never silently pick one. A received usable routine satisfies preparation; creating a new one is optional.

### B. Routine creation and editor

| Location | Exact new copy |
|---|---|
| Above name field | “Una rutina es una plantilla de ejercicios y series que puedes volver a usar.” |
| Below create action | “Primero crearás la rutina. Después agregarás los ejercicios y sus series.” |
| Empty editor, beside existing add-exercise control | “Agrega un ejercicio y revisa sus series. Al terminar, guarda la rutina.” |
| Above series editor | “Estos son valores previstos. Durante el entrenamiento registrarás lo que realmente hagas.” |
| Series helper | “Serie: un grupo de repeticiones. Repeticiones: cuántas veces realizas el movimiento.” |
| Load helper | “Carga: el valor previsto según la unidad de este ejercicio. Puedes ajustarlo al entrenar.” |
| Advanced topics | Detailed series-type and effort education is deferred beyond the first release. Preserve existing type/effort controls unchanged; do not introduce a new disclosure or incomplete glossary. |
| After successful usable save, active guide only | “Rutina preparada. Cuando estés listo, abre el entrenamiento.” / “Ir al entrenamiento” |

Keep “Guardar rutina” and its validation. The post-save guide action uses the persisted routine; subsequent local edits remove that success CTA until saved again. No new auto-save contract. Incomplete persisted routines remain editable and the guide says “Continuar preparando rutina”, not “Rutina lista”. A guide-usable routine has at least one exercise with at least one set and passes the existing domain/editor validation; do not invent positive-load requirements for bodyweight exercises.

### C. Workout setup, active series, and result

```text
SETUP — below current header, above start controls
Registra un entrenamiento real
La rutina es tu plan. Aquí guardarás las series que realmente hagas.
Iniciar entrenamiento comienza la sesión. No hace falta completar
la guía para entrenar.
[Existing configuration and Iniciar entrenamiento]

ACTIVE — beside first current series; compact, opt-in guide only
Registra lo realizado                        [Ocultar ayuda]
Revisa la carga y las repeticiones antes de marcar la serie como hecha.
[Existing series fields and completion action]
[Cómo funcionan las series] (explicit disclosure)

DONE — after confirmed saved result, below existing victory facts
Tu entrenamiento quedó registrado.
Revisa las series realizadas y las que quedaron pendientes.
[Ver resultado] → existing personal recap

PERSONAL RECAP — below main recorded facts
Estos son tus datos registrados, no una copia del plan.
Puedes corregirlos con “Corregir datos de esta sesión”.
[Ver progreso] → /(tabs)/progress
```

Do not add active-screen auto-opening dialogs, spotlight overlays, forced scrolling, animation, sound, or new tutorial navigation. Hide the first-series helper after the first successfully persisted series completion or dismissal; the explicit topic remains available. Finishing may save a partial workout: preserve the existing confirmation that pending series are not completed. Finishing a zero-performed-set record does not satisfy the guide's learning milestone, even if the domain permits saving it.

Keep existing finalization/connection/publication messages authoritative. Never announce saved/synced success while finalization is ambiguous. Pending joint publication does not invalidate a confirmed personal result. A local unsynced record may receive the existing local-save explanation, but step 2 waits for authoritative confirmed history; do not invent a recap link to an unavailable record.

### D. Mesocycles: independent, optional learning track

Entry points: a “¿Qué es un mesociclo?” disclosure in the mesocycle library; the help hub; a secondary “Planificar varias semanas” topic after the first-workout guide is complete. No automatic modal or requirement to create a plan.

```text
¿Qué es un mesociclo?
Un mesociclo organiza rutinas y descansos durante varias semanas.
La rutina describe qué hacer; el mesociclo indica cuándo hacerlo.
El entrenamiento registra lo que realmente hiciste.
[Crear mesociclo]   [Cerrar]
```

Creation keeps its existing form and planner. Insert concise copy at these decisions:

| Decision | Exact copy |
|---|---|
| Duration | “La semana base se repetirá durante este número de semanas. Después puedes ajustar el calendario.” |
| Status | “Borrador: prepara el plan. Programado: déjalo previsto. Activo: permite iniciar las sesiones disponibles.” |
| Week assignment | “Asigna una rutina o un descanso a cada día que quieras planificar. Un día sin asignar no cuenta como descanso.” |
| Gap before a later assigned day | “Hay días sin asignar antes de tu última actividad. Asígnales una rutina o descanso, o elimina la actividad posterior.” |
| Snapshot detail | “El plan conserva una copia de la rutina asignada. Editar la rutina de la biblioteca no actualiza automáticamente esa copia.” |
| No routines | Keep existing “Crear una rutina primero” and “no necesitas un mesociclo para empezar a entrenar.” |
| Summary | “Revisa el estado y las fechas antes de iniciar una sesión. Guardar un plan no registra entrenamientos.” |

Keep overlap, unavailable routine, pause, past-date, skipped, rescheduled, and cancelled rules/messages. Recovery guidance links to existing calendar actions, never executes blocked sessions. Completion of the learning topic is explicit “Entendido”; it never creates/activates a plan. Product planning completion, if later measured, is a different metric.

### E. Persistent help, not a forced tutorial

New proposed route `/help/training` (`app/help/training.tsx`): header “Cómo usar GymBro”; topic rows “Rutinas”, “Registrar un entrenamiento”, “Resultados y progreso”, “Mesociclos”; a “Continuar guía” or “Volver a mostrar la guía” action. Topics expand inline with the copy above and links to valid existing destinations. Access from Más and a labeled “Ayuda” action on relevant screens; keep form-screen help inline so it does not unmount and discard an editor. Closing help restores focus to its trigger and preserves all fields.

## Trigger, state, and persistence contract

**Proposed implementation:** a pure guidance selector + a small dedicated hook/storage service. Do not embed tutorial flags into Routine, WorkoutAttempt, mesocycle lifecycle, release-note keys, or server onboarding completion.

- Store `@gymbro/functional-guidance/v1/{uid}` with schemaVersion, invitation (`unseen|accepted|dismissed`), dismissedTopicIds, optional selectedRoutineId, reviewedResultId, and mesocycleTopicAcknowledged. Persist no exercise names, body metrics, raw analytics, or credentials. IDs remain local and must be revalidated against hydrated ownership/access.
- Only read/derive/show after authenticated UID matches `hydratedUserId`, `dataState === 'ready'`, and that UID's guide read has settled. Hide invitation on loading/error/unknown ownership rather than treating empty arrays as a new user.
- At first resolved load: existing valid performed history → no automatic novice invitation; routines but no performed history → offer starting at recording; neither → offer preparation. Empty/incomplete routines → preparation. Existing users can explicitly open/re-enable the guide at any time.
- Milestone 1 is derived from a currently accessible persisted usable routine; selected entity deletion/unavailability moves the CTA back to selection/preparation without deleting user training data. Milestone 2 requires owned confirmed history with at least one performed valid set. Milestone 3 requires viewing an owned available recap after that evidence; revisiting a route alone is not sufficient while loading/not-found.
- Derive next action from current authoritative data on every render/tap. Never use a persisted step number as authority. Filter attempts to current ownership and use existing domain normalization/valid-set semantics rather than ad hoc counting.
- Dismissal is persistent per UID/device, across app launches; no timers or repeated “reminders”. “Volver a mostrar la guía” re-enables presentation but does not erase milestones or training history. A completed guide disappears from Entrenar; help remains.
- An active workout, pending save, unresolved conflict, or offline recovery always takes priority over invitation/checklist. Help is read-only and may remain accessible; no guide CTA starts a competing attempt. Resume uses the existing recovery handler with routine, mesocycle lineage, and joint context intact.
- Storage failure: preserve choices in memory for the current session, never block training or leak previous UID state; show “No pudimos guardar tu preferencia de ayuda en este dispositivo.” only after an explicit failed preference change. Automatic read failure suppresses the invitation and leaves manual help available.
- On account change/sign-out, immediately clear in-memory guide state; cancel/ignore stale reads and writes for a different UID. Existing device-local dismissals remain keyed to their account. Account deletion must remove this new local key through the app's account-cleanup path if one exists; otherwise implement explicit cleanup with the state service.
- Local-only is an intentional first-slice tradeoff: works offline and needs no backend, but dismissal does not sync to other devices and resets after reinstall. Domain history still suppresses novice invitations after hydration. Do not claim offline library/create availability: respect current connection gates. Schema upgrades preserve known dismissals; copy-only edits never re-trigger guides.

## Edge-case contract

| Situation | Required result |
|---|---|
| Cancel new routine before creation | No routine or milestone is created. |
| Leave editor after routine shell was created | Shell remains as today; guide resumes preparation, not execution. Unsaved fields are not promised durable. |
| Leave form to read help | Inline expansion retains form state; no navigation away. |
| Save fails or numeric/catalog validation fails | Existing error remains visible; retain inputs; no milestone advance or success CTA. |
| Routine deleted/shared access removed between render and tap | Resolve again, show existing unavailable state or return to selection; no stale execution link. |
| Empty exercise catalog or failed catalog load | Preserve loading/error/retry and existing custom/catalog behavior; do not seed sample exercises. |
| Unfinished workout / app background / restart | Resume existing draft; guide does not start a new attempt or manipulate timer state. |
| Cancel workout | Existing destructive confirmation and cancel semantics; no completion celebration. |
| Partial recorded workout | Count recording when at least one valid performed set is confirmed; show actual pending sets, not “all complete”. |
| Ambiguous finalization / offline pending result | Existing recovery takes precedence; guide completion waits for confirmation. Retry must not duplicate attempts. |
| Mesocycle has gap, overlapping dates, missing routine | Explain actual validation and preserve inputs; no auto-inserted rests, auto-reschedule, or auto-activation. |
| Open help in workout | No pause/start/complete side effects. Existing pause action remains the only pause mechanism. |

## Accessibility and interaction checks

- New touch targets: at least 48 × 48 logical units as a project design target, not a claim that WCAG mandates this mobile unit. Keep visible labels; no icon-only help or color-only checklist state.
- Expose headings, button roles, expanded/collapsed state, and meaningful status labels. Screen reader reads contextual copy before related controls; routine and set names remain explicit.
- Support large text without truncation/horizontal scrolling, safe areas, keyboard, landscape, and both themes. No fixed-height instructional cards. Do not steal focus when domain data updates.
- Meet WCAG AA text contrast (4.5:1 normal; 3:1 large) and non-text contrast where applicable; verify rendered glass surfaces, not token values alone.
- Inline details preserve focus; no timers/auto-dismiss. New guide UI introduces no motion/haptics. Existing reduced-motion preferences remain respected.

## Implementation slices and acceptance

Each slice keeps domain behavior and its tests with the UI change. Proposed files are not yet present. Refresh the dirty-tree baseline before editing; current workout/offline changes belong to other work and must not be overwritten.

| Slice | Scope and paths | Evidence/tests to add or extend |
|---|---|---|
| 1. State + entry + help | New `utils/functionalGuidance.ts`, `services/functionalGuidance.ts`, `hooks/useFunctionalGuidance.ts`, `components/FunctionalGuidanceCard.tsx`, `app/help/training.tsx`; integrate `app/(tabs)/train.tsx`, `app/(tabs)/more.tsx`. | New `tests/functionalGuidance.test.ts`, `tests/functionalGuidanceStorage.test.ts`, `tests/functionalGuidanceEntry.test.ts`; use existing runtime harness. Test hydration, two-account isolation, stale async reads, failure, dismiss/reopen, existing-user suppression, manual help, active-draft priority. |
| 2. Routine preparation | `app/routine/create.tsx`, `app/routine/[id].tsx`, `app/(tabs)/routines/index.tsx`; reuse guidance card/copy. | New `tests/routineGuidance.test.ts`; extend `tests/routinesScreen.test.ts` as needed. Assert shell ≠ ready, successful save, no unsaved-value execution, received routine, field preservation, direct library entry. |
| 3. Real workout and result | `app/routine/execute/[id].tsx`, `app/session/recap/[id].tsx`; reuse existing done/details and progress routes. Keep guidance presentation isolated from finalization code. | New `tests/workoutGuidance.test.ts`; regress `tests/activeWorkoutReentry.test.ts`, `tests/offlineWorkoutRoute.test.ts`, `tests/quickLogging.test.ts`, `tests/workoutRecapAnalysis.test.ts`. Assert opening guide never starts/pauses/finishes; partial vs zero-set; confirmed vs pending; no duplicate saves; lineage-preserving resume. |
| 4. Mesocycle teaching | `app/(tabs)/mesocycles/index.tsx`, `app/mesocycle/create.tsx`, `app/mesocycle/summary/[id].tsx`, help topic. | Extend `tests/guidedPlanningScreen.test.ts`, `tests/planningPreview.test.ts`, `tests/mesocycleNavigation.test.ts`; regress lifecycle/lineage tests. Assert rest/unassigned distinction, gap error, no auto-activation, snapshot copy explanation, unavailable-plan guards. |

Acceptance scenarios (release-blocking):

- [ ] A hydrated new user opts in, creates a shell, adds/configures/saves an exercise, starts a real session explicitly, records a series, finishes, opens a valid recap, and reaches progress.
- [ ] A user skips guidance and completes every existing action unchanged; reopens help from Más after restart.
- [ ] A returning user with recorded history sees no novice prompt; users with only routines start at the correct next task.
- [ ] Switching accounts never displays the other user's dismissal, selected routine, or recap.
- [ ] Partial, pending, cancelled, stale, and resumed sessions produce the edge-case behavior above with no fabricated records.
- [ ] A mesocycle learner can distinguish rest from unassigned, understand the repeated week, save a draft, and explain why it cannot execute until activated.
- [ ] VoiceOver/TalkBack and large text complete the same path; controls remain reachable while keyboard and rest UI are visible.

## Handoff integrity check

Documentation-only path check on 2026-09-11: all 22 referenced existing source/test file paths resolve; 10 new file paths are explicitly proposed, not claimed implemented. No unexpected missing paths. `package.json` confirms `npm test` runs `vitest run`. This verifies handoff references only, not runtime correctness; no tests or builds were executed.

## Validation and release readiness

**Before coding:** review this scope and exact copy. Read the project-required [Expo v56 documentation](https://docs.expo.dev/versions/v56.0.0/) and consult the matching [Expo v57 documentation](https://docs.expo.dev/versions/v57.0.0/) for APIs: current `package.json` declares Expo `~57.0.21`. Preserve declared dependencies. This documentation-version discrepancy is not evidence of a broken app or an automatic implementation blocker; do not silently downgrade or upgrade. This documentation-only design does not rely on version-specific Expo APIs.

**During implementation:** run focused Vitest suites per slice, then `npm test`; inspect existing failures against the unchanged baseline. No tests/builds were run for this document. Confirm new route availability and type-check using the repository's supported tooling; do not assume an unverified script exists. No analytics SDK, migration, auth behavior, native SDD attempt ledger, or review gate is required by this proposal.

**Before release:** test a low-fidelity interactive prototype or actual screens with 5 new users and 2 existing users as an initial qualitative round, not statistically representative proof. Tasks: prepare first routine; record a real/plausibly observed test workout in isolated test data; find its result; explain and create a draft mesocycle. Moderators must not teach first. Test mobile screens on iOS/Android, both themes, keyboard, large text, assistive tech, offline recovery, and account switch.

Provisional criterion: at least 4/5 new participants complete the core path without moderator instruction and correctly distinguish planned from performed; investigate every save/cancel misunderstanding regardless of count. Measure task completion, help requests, mistaken “saved” assumptions, and repeated dead ends. Use consented moderator notes and anonymized counts initially; record no weights, exercise names, account IDs, or body metrics. Analytics infrastructure is explicitly out of scope.

The design handoff can be complete while usability/device evidence is pending. Release readiness requires the acceptance scenarios and observed usability findings to be resolved; do not present this document as proof the UX works.

## Sources and non-goals

Contextual help should be optional, dismissible, and available again near the task rather than requiring recall of an introductory tour: [NN/g, Onboarding Tutorials](https://www.nngroup.com/articles/onboarding-tutorials/). Reveal advanced explanations on demand while keeping essential instructions visible: [NN/g, Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/). Web target-size criteria and exceptions are described separately from this project's mobile target: [W3C, Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Non-goals: workout recommendations, coaching/medical guidance, AI plan generation, gamified tutorial rewards, redesigning all navigation, changes to domain scheduling or finalization, replacing account onboarding, backend analytics, mandatory tours, and training-data seeding.
