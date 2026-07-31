# Meaningful Progress Dashboard Specification

## Purpose

Present accessible, explainable comparisons.

## Requirements

### Requirement: Scope and Historical Filters

The dashboard MUST provide global, muscle, exercise, and routine scopes. Filters MUST use stable identities and include historical entities retained by owned snapshots.

#### Scenario: Select scope
- GIVEN compatible owned attempts exist
- WHEN the user selects a muscle, exercise, or routine
- THEN metrics and charts MUST reflect only that scope

#### Scenario: Historical selection
- GIVEN a deleted entity remains in owned attempt snapshots
- WHEN filters are opened
- THEN it MUST appear as historical and remain selectable

### Requirement: Equivalent Period Comparison

The default MUST compare the latest and preceding non-overlapping 7-day intervals under one local-time boundary policy. Included dates MUST be visible.

#### Scenario: Default periods
- GIVEN attempts span 14 days
- WHEN the dashboard opens
- THEN it MUST compare adjacent non-overlapping 7-day intervals

#### Scenario: Boundary observation
- GIVEN an attempt falls exactly on a period boundary
- WHEN periods are aggregated
- THEN it MUST belong to exactly one displayed interval

### Requirement: Explainable Signals and Trends

Activity, adherence, recorded load, muscle exposure, and exercise performance MUST remain independent. Trends MUST require two compatible valid observations.

#### Scenario: Independent changes
- GIVEN workout count rises while adherence falls
- WHEN global data is shown
- THEN both MUST appear independently without a composite score

#### Scenario: Trend
- GIVEN two compatible exercise observations exist
- WHEN the exercise scope is shown
- THEN a trend MAY be shown per supported indicator

#### Scenario: Sparse trend
- GIVEN only one compatible valid observation exists
- WHEN a trend is requested
- THEN its absolute value MUST remain visible with a not-enough-data state

### Requirement: Sparse, Legacy, and Incompatible Data

The dashboard MUST distinguish empty, insufficient, unknown, and incompatible data. It MUST NOT fabricate percentages from missing or zero baselines.

#### Scenario: Zero baseline
- GIVEN the previous period value is zero and the current value is nonzero
- WHEN comparison is rendered
- THEN absolute values MUST be shown without a misleading percentage

#### Scenario: Unsupported records
- GIVEN records cannot support the selected dimension or comparison
- WHEN the scope is rendered
- THEN usable activity MAY remain while unsupported trends explain their exclusion

### Requirement: Loading, Error, and Empty Behavior

Loading MUST identify pending content; errors MUST offer retry; empty states MUST explain and clear active filters.

#### Scenario: Loading or error
- GIVEN dashboard data is loading or fails
- WHEN the screen renders
- THEN it MUST show the matching non-chart state without stale claims
- AND an error MUST expose retry

#### Scenario: Empty filter
- GIVEN data exists outside the active filter
- WHEN the filtered result is empty
- THEN the dashboard MUST explain this and allow clearing filters

### Requirement: Accessible Responsive Presentation

Charts and controls MUST adapt to supported sizes and orientations. Charts MUST provide title, units, period, non-color-only distinctions, and an accessible value/trend summary.

#### Scenario: Resize
- GIVEN the dashboard is visible
- WHEN its available dimensions change
- THEN charts and filters MUST reflow and remain operable and legible

#### Scenario: Screen reader
- GIVEN assistive technology is active
- WHEN a chart or filter receives focus
- THEN its label, selection, units, values, and state MUST be understandable nonvisually

#### Scenario: Dense or sparse
- GIVEN a series has crowded labels or too few points
- WHEN it renders
- THEN labels MUST remain distinguishable and unsupported trend lines MUST NOT imply continuity

### Requirement: Truthful Interpretation

The dashboard MUST label each signal precisely and MUST NOT claim growth, physiological outcomes, or hidden overall progress.

#### Scenario: Exposure increases
- GIVEN weighted muscle exposure rises between periods
- WHEN its summary is rendered
- THEN it MUST describe increased recorded exposure, not muscle growth
