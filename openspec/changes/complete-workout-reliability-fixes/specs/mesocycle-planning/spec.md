# Mesocycle Planning Specification

## Mesocycle Planning — Delta

### Requirement: Session selection and first-entry date
The system MUST present routine choices with the same selected-state styling in create and edit flows, MUST allow a rest entry, and MUST derive `startDate` from the first scheduled entry (including rest); it MUST leave the date unset with no entries.

#### Scenario: First week selection
- GIVEN a new first week and available routines
- WHEN the user selects a routine or Rest
- THEN the selected control is visibly distinguishable in either flow
- AND the first entry determines the displayed start date.

#### Scenario: Empty schedule
- GIVEN no scheduled entries
- WHEN the mesocycle is saved or rendered
- THEN no derived start date is shown.
