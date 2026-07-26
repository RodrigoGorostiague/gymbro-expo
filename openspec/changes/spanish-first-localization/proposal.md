# Proposal: Spanish-First Localization

## Intent

Replace mixed-language and regionally informal interface copy with neutral, professional Latin-American Spanish before final catalog/dashboard validation. Behavior, data identity, and formatting contracts remain stable.

## Proposal Question Round

Final boundaries supplied; no assumptions remain.

## Scope

### In Scope
- Translate approximately 180–240 user-facing strings across screens, navigation, alerts, surfaced errors, product workflows, accessibility, and loading/error/empty states.
- Normalize existing Spanish to the terminology and register below while preserving user-generated names.
- Preserve behavior and copy-dependent snapshots; update only assertions/checklists affected by revised copy.

### Out of Scope
- Any i18n runtime, locale detection, language switcher, typed catalog, or new dependency, including `expo-localization`, `i18next`, and `react-i18next`.
- Changes to identifiers, routes, enums, storage/API keys or values, logs, user content, business logic, persisted data, decimal parsing, or locale-sensitive date/number/unit behavior.

## Capabilities

### New Capabilities
- `spanish-interface-copy`: Spanish-only, neutral/professional user-facing copy across the existing product interface.

### Modified Capabilities
- None.

## Terminology and Quality Policy

Use sentence case and stable terms: *rutina*, *entrenamiento* (recorded: *sesión de entrenamiento*), *serie*, *serie de trabajo*, *serie al fallo*, *calentamiento*, *adherencia*, *progreso*, *gemas*, and *peso corporal*. Prefer *repeticiones* in prose; avoid slang, voseo, and regional imperatives. Accessibility copy must preserve meaning, state, consequences, and chart context. Examples must match current parsers.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `app/**`, `components/**` | Modified | Visible, workflow, state, and accessibility copy |
| `constants/**`, `context/**`, `services/**`, `utils/**` | Modified | Display metadata, messages, notifications, and surfaced fallbacks only |
| Existing snapshots/checklists | Modified | Preserve behavioral coverage while aligning expected copy |

## Delivery Boundaries

1. Progress, charts, legacy resolution, and session history/editing.
2. Navigation, authentication, shared UI, routines/execution, exercises, and catalog.
3. Shop, sharing, partner/welcome/encouragement messages, notifications, final English-copy audit, and combined walkthrough.

Use a forced feature-branch chain; each PR must remain within 400 authored changed lines.

## Dependencies

Start from integrated `exercise-catalog` and `meaningful-progress-dashboard` work through task 4.2. Complete localization before either feature's manual task 4.3 validation. Protect the dirty workspace by establishing that clean baseline first.

## Risks and Rollback

Risks: high-churn overlap may lose work; edits may alter stable values, tone, formatting, or accessibility; 550–850 lines may exceed budgets. Mitigate through three boundaries, invariant review, snapshots, and walkthrough. Roll back each chained PR independently in reverse order; no data or dependency rollback is required.

## Success Criteria

- [ ] All existing user-facing interface copy is neutral/professional Spanish, with no unintended English remainder.
- [ ] Identifiers, persisted/API values, user-generated names, logs, business logic, formatting, units, and parsing remain unchanged.
- [ ] Existing snapshots/regression gates pass and accessibility, empty/error/loading, catalog, dashboard, and sharing flows complete the Spanish walkthrough.
