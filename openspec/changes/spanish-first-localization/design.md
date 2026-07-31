# Design: Spanish-First Localization

## Technical Approach

Translate user-facing literals in place, preserving each component’s current control flow, interpolation, and formatting. No i18n dependency, provider, key catalog, locale detection, or reusable translation layer is introduced. Work begins only from a clean baseline containing `exercise-catalog` and `meaningful-progress-dashboard` through task 4.2; localization completes before either manual task 4.3.

## Architecture Decisions

| Option | Tradeoff | Decision and rationale |
|---|---|---|
| Direct call-site translation | Repetition remains, but behavioral blast radius is smallest | **Selected.** Change literal operands only; retain branches, handlers, routes, props, and formatter/parser calls. Small local singular/plural branches are allowed when Spanish grammar requires them. |
| i18n runtime or centralized catalog | Enables future languages but adds dependencies, indirection, fallback behavior, and broad churn | **Rejected.** The product is Spanish-only and the specification forbids runtime localization architecture. |
| Mechanical search/replace | Fast but cannot distinguish UI from IDs, storage, logs, names, or accessibility context | **Rejected.** Search produces an inventory; every replacement is context-reviewed. |

## Inventory and Copy Contract

The authoritative inventory is a per-PR review ledger generated from reachable Expo Router screens in `app/**`, then transitively rendered `components/**`, plus UI-producing values in `constants/**`, `context/**`, `services/**`, and `utils/**`. Record file:line, surface (`visible`, navigation, alert, validation/error, loading/empty, notification, or accessibility), classification, and disposition. Candidate searches cover JSX text, `title`/`subtitle`/`placeholder`/`backLabel`, `Alert.alert`, accessibility labels/hints, template literals, and errors passed to rendered state. Each candidate is classified:

- **Translate:** text a user can see or hear, including bounded presentation fallbacks and push/local notification copy.
- **Preserve:** proper/profile names, user-created routine/exercise/variant names, symbols (`kg`, `lb`, `%`, `C`, `F`), accepted format tokens (`YYYY-MM-DD`, `HH:MM`), code identifiers, routes, enum/status values, AsyncStorage/Firebase/API keys and values, analytics identity, logs, and technical-only invariants.
- **Unreachable:** technical text proven not to cross a presentation boundary; record the evidence.

Enforce sentence case and the specification glossary: `rutina`, `entrenamiento`, recorded `sesión de entrenamiento`, `serie`, `serie de trabajo`, `serie al fallo`, `calentamiento`, `adherencia`, `progreso`, `gemas`, `peso corporal`; use `repeticiones` in prose. Do not rename identifiers. Interpolate preserved values unchanged; use explicit local `count === 1` wording for nouns, while preserving counts, percentages, and units. Accessibility translations retain purpose, state, consequence, units, and chart context—not merely visible-label wording.

## Data Flow and Invariants

    persisted/API enum or user name (unchanged) → existing selector/formatter → Spanish call-site copy → Text/Alert/accessibility/notification

Raw domain errors remain unchanged unless already intentionally surfaced; presentation catch sites map them to bounded Spanish fallbacks. Date, decimal, number, percentage, duration, parser, and unit behavior is unchanged, including decimal-point input.

## File Changes and Chained Delivery

Establish a clean prerequisite baseline first: current dirty overlap includes `progress.tsx`, `session/[id].tsx`, `LineChart.tsx`, `DataContext.tsx`, catalog/routine screens, `ExercisePicker.tsx`, `storage.ts`, and `analytics.ts`. Never overwrite or stash these changes into localization commits.

| PR seam (feature-branch chain) | Files grouped | Rollback |
|---|---|---|
| 1. Progress/history | `app/(tabs)/progress.tsx`, `app/session/[id].tsx`, `components/progress/**`, `components/LineChart.tsx`, presentation copy in `context/DataContext.tsx` | Revert PR 1; no data rollback. |
| 2. Shell/auth/training/catalog | layouts, `app/index.tsx`, `components/login/**`, shared UI/nav, `app/(tabs)/routines/**`, `app/routine/**`, `app/(tabs)/exercises/**`, `app/exercise/**`, picker/selectors | Revert PR 2 after PR 3 if needed. |
| 3. Shop/partner/sharing/final audit | shop/theme UI metadata, sharing UI/context, `constants/{shopThemes,kiss,welcome,encouragement}.ts`, `KissContext`, notification presentation copy, final ledger | Revert PR 3 independently. |

Each child targets the preceding branch; authored additions plus deletions must be measured before review and remain ≤400. Move an untouched low-coupling file to an adjacent seam if forecast exceeds the cap; do not split one file across concurrent dirty baselines.

## Testing Strategy

| Layer | Approach |
|---|---|
| Static | Re-run candidate searches on reachable surfaces; every English finding must be translated or ledgered as proper-name/symbol/technical-only/unreachable. Also scan diffs for changes to routes, keys, enum literals, formatters, parsers, and dependencies. |
| Automated | `npm test`, updating only copy-dependent assertions/snapshots (none currently identified as UI snapshots); `npx tsc --noEmit`; SDK 56 production bundle check: `npx expo export --platform android` to an ignored/temp output directory. |
| Manual | Phone and tablet × `rodaja` and `brisas`; normal/loading/empty/error/destructive flows; dashboard/history/catalog/routines/execution/shop/sharing/profile; screen-reader labels, hints, chart summaries, and dynamic singular/plural values. Run the combined matrix before prerequisite task 4.3. |

## Threat Matrix

N/A — this copy change does not alter routing, shell/subprocess execution, VCS automation, executable classification, or process integration.

## Migration / Rollout

No data migration or feature flag. Roll out through the three forced chained PRs and rollback in reverse dependency order.

## Open Questions

None.
