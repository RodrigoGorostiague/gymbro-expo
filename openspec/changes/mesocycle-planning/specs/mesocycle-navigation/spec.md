# Mesocycle Navigation Specification

## Purpose

Expose mesocycles as a dedicated product area and clean up routine terminology so routines remain reusable templates.

## Requirements

### Requirement: Dedicated Navigation and Terminology
The system MUST expose mesocycles through dedicated list/detail/editor flows and SHOULD relabel routine surfaces to preserve routine-library meaning.

#### Scenario: Enter mesocycle area
- GIVEN the user is in the app navigation
- WHEN the user chooses Mesocycles
- THEN the app MUST open mesocycle-specific list and detail flows
- AND routine execution remains launched from the referenced routine

#### Scenario: Preserve routine library language
- GIVEN the user is viewing routine screens
- WHEN mesocycles are available
- THEN routine UI MUST describe routines as reusable templates or library items
- AND mesocycle planning language MUST NOT replace routine-library terminology
