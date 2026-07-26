# Spanish Interface Copy Specification

## Purpose

Establish Spanish interface copy without behavior changes.

## Requirements

### Requirement: Complete Spanish Interface

Every reachable screen, component, navigation/tab title, alert, confirmation, validation, surfaced error, and loading/empty/error state MUST use neutral, professional Spanish. This includes authentication, dashboard, history, routines, exercises, catalog, shop, sharing, profile, notifications, and partner flows. No unintended English MUST remain in normal UI; proper nouns and technical unit symbols MAY remain.

#### Scenario: Normal interface
- GIVEN either profile on a phone or tablet
- WHEN every screen, tab, component, and action is visited
- THEN all user-facing copy MUST be Spanish except permitted names and symbols

### Requirement: Terminology and Register

Copy MUST use sentence case and this glossary: routine=`rutina`; workout=`entrenamiento`; recorded workout=`sesión de entrenamiento`; set=`serie`; working set=`serie de trabajo`; failure set=`serie al fallo`; warm-up=`calentamiento`; adherence=`adherencia`; progress=`progreso`; gems=`gemas`; bodyweight=`peso corporal`. Prose SHOULD use `repeticiones`; slang, voseo, and regional imperatives MUST NOT appear.

#### Scenario: Repeated concept
- GIVEN a glossary concept appears across multiple flows
- WHEN those surfaces are reviewed
- THEN each MUST use the prescribed term and neutral/professional register

### Requirement: Dynamic Copy Fidelity

Interpolations, plurals, counts, percentages, and units MUST preserve values and grammatical meaning. User-generated profile, routine, exercise, and variant names MUST remain unchanged within Spanish copy.

#### Scenario: Dynamic quantities
- GIVEN a value is singular, plural, a percentage, or a measurement
- WHEN translated copy renders it
- THEN its value and symbol MUST remain accurate and its grammar MUST agree

#### Scenario: User-generated name
- GIVEN a user name contains English, accents, or unusual casing
- WHEN translated UI displays it
- THEN the name MUST remain byte-for-byte unchanged

### Requirement: Behavioral and Identity Invariants

Identifiers, routes, enums, storage keys/values, API values, logs, analytics identity, persisted data, and business logic MUST remain unchanged. The change MUST NOT add selection, detection, fallback runtime, localization architecture, or dependencies. Date, number, unit, input, and parsing semantics MUST remain unchanged; decimal-comma parsing is unsupported.

#### Scenario: Stable identity
- GIVEN existing local or shared data is processed
- WHEN Spanish copy is used
- THEN persisted, API, enum, route, log, and analytics values MUST remain identical

#### Scenario: Numeric input
- GIVEN an input accepts its existing decimal syntax
- WHEN its guidance is translated
- THEN parsing MUST remain unchanged and MUST NOT imply decimal-comma support

### Requirement: Equivalent Accessibility

Accessibility labels and hints MUST convey equivalent Spanish purpose, state, action, consequence, units, and chart context. Existing roles and interaction semantics MUST remain unchanged.

#### Scenario: Assistive navigation
- GIVEN assistive technology is enabled
- WHEN controls, charts, errors, or destructive actions receive focus
- THEN Spanish announcements MUST communicate meaning while preserving roles and states

### Requirement: Verification Coverage

Verification MUST combine existing checks, a static reachable-English audit, and walkthroughs for both profiles on phone and tablet, covering accessibility, errors, dashboard, history, catalog, routines, exercises, shop, sharing, and profile.

#### Scenario: Static and automated checks
- GIVEN all slices are integrated
- WHEN regression checks and the English audit run
- THEN behavior MUST pass and findings MUST be translated, permitted, or unreachable

#### Scenario: Manual matrix
- GIVEN both form factors and profiles are available
- WHEN normal, loading, empty, error, and accessibility paths are walked
- THEN every specified surface MUST satisfy this specification

### Requirement: Sequencing and Reversible Delivery

Localization MUST start after dashboard and catalog implementation through task 4.2 is integrated and MUST finish before their manual task 4.3 validation. Independently reversible chained slices MUST NOT revert unrelated dirty-workspace behavior.

#### Scenario: Dependency gate
- GIVEN either prerequisite through task 4.2 is incomplete
- WHEN application is requested
- THEN application MUST wait, while specification work MAY proceed

#### Scenario: Slice rollback
- GIVEN one chained slice regresses copy
- WHEN that slice is rolled back
- THEN unrelated work and other valid slices MUST remain intact
