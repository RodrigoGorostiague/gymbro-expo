## Exploration: Spanish-first localization

### Current State
GymBro is an Expo SDK 56 / Expo Router / React 19 application with Context-based state, AsyncStorage persistence, Firebase sharing/notifications, strict TypeScript, and Vitest pure-unit tests. It has no localization runtime, which now matches the reduced scope: this change is a Spanish-only copy pass, not an internationalization feature.

The interface is partially Spanish and partially English. The largest mixed surface is the new progress/history flow: `app/(tabs)/progress.tsx`, `components/progress/Filters.tsx`, and `app/session/[id].tsx` include English scope names, migration actions, history/edit copy, validation, and accessibility labels among otherwise Spanish copy. Exercise-catalog screens are mostly Spanish but use informal regional wording. Shop, sharing, authentication, partner messages, notifications, and surfaced errors also require a neutral/professional Spanish review.

An automated scan found 339 unique static candidates on UI-producing lines across `app/`, `components/`, `context/`, `constants/`, `services/`, and `utils/`. This includes technical strings and misses some multiline fragments, so it is not a translation-key estimate. The practical direct-copy surface is approximately 180–240 user-facing strings, including already-Spanish text that needs terminology or register normalization.

The final scope boundary is explicit:

- Directly translate or revise visible copy, navigation/tab titles, alerts, user-facing validation, loading/empty/error states, shop/theme display text, notification text, and accessibility labels/hints into neutral/professional Spanish.
- Do not add `expo-localization`, `i18n-js`, `i18next`, `react-i18next`, dictionaries, providers, translation keys, language detection, locale persistence, or a language selector.
- Do not translate or rename TypeScript identifiers, routes, enums, AsyncStorage keys or values, Firebase collections, theme IDs/categories, profile IDs, share statuses/types, workout statuses, load modes/units, set codes (`C`, `F`), analytics states, or logs.
- Preserve persisted values exactly, including Spanish-looking `MuscleGroup` and exercise variant values. Display copy may be revised without changing stored identity.
- Preserve user-created routine, exercise, and variant names verbatim, including names embedded in snapshots and shared routines.
- Keep technical invariant errors and logs unchanged. Translate only errors that are surfaced intentionally to users; avoid widening this copy-only change into a domain error-model refactor.

Date, number, percentage, duration, and unit behavior remains unchanged. Existing `'es'` date formatting, ISO-style historical date/time fields, `Math.round`/`toFixed`, `%`, `kg`/`lb`, `min`, and `kg·rep` output stay as-is. Existing numeric parsing also stays as-is unless translated instructions or placeholders would cause users to enter an incompatible value; Spanish examples must therefore remain compatible with the current parser.

### Affected Areas
- `app/(tabs)/_layout.tsx` — localized tab titles.
- `app/index.tsx`, `components/login/*` — authentication copy, validation, placeholders, and accessibility.
- `app/(tabs)/routines/**`, `app/routine/**` — routine composition/execution, alerts, set labels, counts, timer copy, and user-created names.
- `app/(tabs)/exercises/**`, `app/exercise/create.tsx`, `components/ExercisePicker.tsx`, `components/MuscleGroupSelector.tsx` — catalog copy, validation, counts, and stable-value/display-label separation.
- `app/(tabs)/progress.tsx`, `components/progress/*`, `components/LineChart.tsx`, `app/session/[id].tsx` — the largest English remainder; metrics, trends, chart accessibility, legacy-data resolution, and historical editing while preserving current formatting/input behavior.
- `app/(tabs)/shop.tsx`, `components/CombineWithPartnerCard.tsx`, `components/ThemePreviewBar.tsx`, `constants/shopThemes.ts`, `context/ShopContext.tsx` — theme display metadata, gem plurals, rewards, purchase alerts, and deliberately non-neutral copy.
- `components/AppNavBar.tsx`, `components/AppScreenHeader.tsx`, `components/LogoutButton.tsx`, `components/ChatFab.tsx`, `components/UI.tsx` — reusable shell copy and accessibility defaults.
- `constants/kiss.ts`, `constants/welcome.ts`, `constants/encouragement.ts`, `context/KissContext.tsx`, `context/ShareContext.tsx`, `services/kissSync.ts`, `utils/notifications.ts` — partner messages, local/push notifications, sharing copy, and Android notification-channel name.
- `context/DataContext.tsx`, `utils/storage.ts`, `utils/workoutAttempts.ts` — only user-visible fallback/error text where it reaches UI; technical invariants and persisted contracts remain unchanged.
- `types/index.ts`, `constants/muscleGroups.ts`, `utils/analytics.ts` — inventory boundaries only; identifiers, enum values, analytics states, and stored data remain unchanged.
- Existing tests and manual validation checklists — update only where assertions or walkthrough text depend on revised UI copy; no new localization test architecture is needed.

### Approaches
1. **Direct in-place Spanish copy pass** — replace each user-facing literal at its existing call site and revise already-Spanish copy to the agreed neutral/professional register.
   - Pros: exactly matches the reduced scope; no dependency, provider, storage, runtime, or architecture changes; smallest regression surface; preserves current formatting and behavior.
   - Cons: repeated text remains duplicated; a future multilingual effort must inventory and extract copy again.
   - Effort: Medium

2. **Centralize repeated Spanish constants without a runtime** — extract shared labels and messages while keeping the app Spanish-only.
   - Pros: can reduce a small amount of duplication.
   - Cons: creates abstraction churn without serving the current goal; risks becoming an accidental partial i18n framework; increases line count and review complexity.
   - Effort: Medium

### Recommendation
Use the direct in-place Spanish copy pass. Translate English literals and normalize existing Spanish literals without adding an indirection layer. Keep interpolation and current manual singular/plural logic structurally unchanged unless the Spanish sentence itself requires a local branch adjustment. Do not introduce reusable multilingual architecture; that is an explicit future non-goal.

Apply these copy rules consistently:

- Use neutral/professional Spanish and sentence case. Remove voseo, region-specific imperative forms, slang, aggressive jokes, and informal abbreviations from all user-facing interface and notification copy.
- Preserve dynamic user/profile/routine/exercise/theme values exactly when interpolated into Spanish sentences.
- Translate accessibility labels and hints for meaning, not word-for-word parity; preserve roles, selected/disabled state, destructive consequences, and chart summaries.
- Keep current date, time, number, percentage, duration, weight, volume, and unit output unchanged.
- Keep current input formats and parsers unchanged. Examples and validation copy must describe accepted input accurately rather than implying decimal-comma support.
- Leave logs and technical invariant messages unchanged. If an existing raw English technical error can reach the UI, prefer a bounded Spanish fallback at the existing presentation catch site instead of translating storage/domain internals broadly.

Recommended neutral terminology:

| Domain concept | Neutral Spanish UI term |
|---|---|
| routine | rutina |
| workout | entrenamiento; use `sesión de entrenamiento` for a recorded occurrence |
| set | serie |
| working set | serie de trabajo |
| failure set | serie al fallo |
| warm-up / warm-up set | calentamiento / serie de calentamiento |
| volume | volumen de entrenamiento; qualify as `carga × repeticiones` where needed |
| adherence | adherencia al plan |
| progress | progreso |
| gems | gemas |
| assisted | asistido / con asistencia |
| bodyweight | peso corporal |

Prefer `repeticiones` over `reps` in prose and accessibility copy; retain compact labels only where existing space constraints require them. Keep `kg`, `lb`, `C`, `F`, `external-load`, `bodyweight`, and `assisted` unchanged in code and storage.

There is no data migration. Do not rewrite AsyncStorage, Firestore documents, catalog snapshots, notification type enums, existing notification records, or user content. Theme IDs/categories remain stable; static user-facing theme names and descriptions may be revised directly into neutral Spanish.

Verification should focus on a static search for remaining user-facing English, TypeScript/Vitest regression gates already owned by the affected dashboard/catalog work, and a manual device walkthrough of every screen, alert, empty/loading/error state, accessibility label/hint, shop action, sharing flow, partner notification, routine execution, exercise catalog action, history edit, and dashboard state. No locale-switching, fallback, formatter, or translation-key tests are needed.

Delivery should retain the forced feature-branch chain and use three reviewer-safe slices, each targeting no more than 400 authored changed lines:

1. Progress dashboard, charts, legacy resolution, and historical session editing after dashboard PR8 is integrated.
2. Navigation, authentication, shared components, routines, execution, exercises, and catalog copy after exercise-catalog task 4.2 is integrated.
3. Shop, sharing, partner/welcome/encouragement messages, notifications, final English-string audit, and combined manual checklist.

Expected implementation size is approximately 550–850 authored changed lines across three chained PRs. Most changes are direct literal replacements, with limited local sentence/interpolation adjustments and test/checklist updates. The 400-line per-PR risk remains Medium; the 800-line session threshold risk is Medium because the upper estimate crosses it, but there is no longer dependency/configuration or localization-infrastructure work.

`spanish-first-localization` should depend on the implemented code boundaries of both `exercise-catalog` (tasks 1.1–4.2) and `meaningful-progress-dashboard` (tasks 1.1–4.2 / PR8), but not on their pending manual task 4.3. Integrate or otherwise establish a clean localization baseline from that staged/dirty work before applying this change. Then run one combined Spanish device walkthrough and the feature-specific catalog/dashboard checks before closing their manual gates. Do not localize against an older branch and later resolve hundreds of string-level conflicts.

### Risks
- The workspace has 18 unstaged/partially staged changed files plus five staged dashboard/history files; localization overlaps nearly all high-churn UI and context files. Applying before those boundaries are integrated risks lost work and unreviewable conflicts.
- Persisted values include both English and Spanish-looking strings. Renaming either category for linguistic consistency would break storage, analytics identity, sharing, themes, or migrations.
- Raw technical errors reach UI in several paths. Broadly translating internals would violate scope, while leaving a surfaced English message would violate the copy goal; bounded catch-site fallbacks need careful review.
- Neutralizing partner/welcome/encouragement messages can change product tone even though behavior is unchanged; review these strings as copy, not code architecture.
- Current date/number/unit/input behavior must not drift. Translated examples that imply comma-decimal input would create a usability regression without parser changes.
- A broad mechanical replacement can degrade accessibility if visible labels are reused where spoken context, control state, or destructive consequences need richer wording.

### Ready for Proposal
Yes. Scope is fully resolved: direct neutral/professional Spanish copy only, no localization runtime or reusable multilingual architecture, no persisted-data changes, and no date/number/unit behavior changes. The proposal should preserve dependencies on integrated `exercise-catalog` and `meaningful-progress-dashboard` implementation through task 4.2 and schedule this copy pass before their final manual task 4.3.
