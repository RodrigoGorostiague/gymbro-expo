# Routine Muscle Groups Specification

## Purpose

Routines MUST be tagged with the muscle groups they target. This enables exercise filtering during routine building and provides at-a-glance information on routine cards.

## Data Model

```typescript
type MuscleGroup = 'pecho' | 'espalda' | 'cuadriceps' | 'femorales' | 'gemelos' | 'hombros' | 'bíceps' | 'tríceps' | 'core' | 'glúteos' | 'trapecio' | 'antebrazos' | 'aductores' | 'abductores' | 'dorsales' | 'fullBody';

interface Routine {
  id: string;
  name: string;
  muscleGroups: MuscleGroup[]; // NEW: at least 1
  exercises: RoutineExercise[];
  createdAt: string;
  isShared?: boolean;
  shareId?: string;
}
```

## Requirements

### Requirement: Muscle Group Selection on Creation

The system MUST require at least one muscle group when creating a routine. The selection MUST support multi-select from the full MuscleGroup enum.

#### Scenario: Create routine with muscle groups

- GIVEN the user is on the routine creation screen
- WHEN the user enters name "Push Day", selects ["pecho", "hombros", "tríceps"]
- THEN the routine is created with those muscle groups persisted

#### Scenario: Reject routine with no muscle groups

- GIVEN the user is creating a routine
- WHEN the user submits without selecting any muscle group
- THEN the system MUST reject and display a validation error

#### Scenario: fullBody as exclusive selection

- GIVEN the user selects "fullBody"
- WHEN the selection is applied
- THEN "fullBody" MAY be combined with other groups or stand alone (system does not enforce exclusivity)

### Requirement: Muscle Groups Display on Routine Cards

The system SHOULD display the routine's muscle groups as tags/chips on the routine list screen.

#### Scenario: Routine card shows muscle groups

- GIVEN a routine "Push Day" with muscleGroups ["pecho", "hombros"]
- WHEN the user views the routines list
- THEN the card displays "pecho" and "hombros" as visible labels

### Requirement: Muscle Group Selection on Editing

The system MUST allow editing a routine's muscle groups and MUST require at least one selection. Updated routine groups MUST drive exercise picker filtering and inline exercise-creation defaults without changing existing RoutineExercise muscle-group snapshots.

#### Scenario: Edit routine muscle groups

- GIVEN a routine with muscleGroups ["pecho"] and an existing exercise snapshot
- WHEN the user changes the routine selection to ["espalda", "dorsales"] and saves
- THEN the routine persists ["espalda", "dorsales"]
- AND the existing exercise snapshot remains unchanged

#### Scenario: Reject removing all muscle groups

- GIVEN the user is editing a routine
- WHEN the user clears every muscle group and saves
- THEN the system MUST reject and display a validation error

#### Scenario: Updated groups drive routine composition

- GIVEN the user changes a routine's muscle groups
- WHEN the user opens the exercise picker or creates an exercise inline
- THEN the picker and inline creation defaults use the updated selection

### Requirement: Muscle Group Multi-Select Component

The system MUST provide a reusable `MuscleGroupSelector` component that renders all 16 muscle group options with toggle selection.

#### Scenario: Toggle muscle groups on/off

- GIVEN the selector is rendered with no selection
- WHEN the user taps "pecho" then "espalda"
- THEN both "pecho" and "espalda" are selected
- AND tapping "pecho" again deselects it

#### Scenario: Display labels

- GIVEN the selector renders
- THEN each option displays a human-readable label (e.g., "Pecho", "Espalda", "Cuádriceps")

### Requirement: Muscle Groups on Shared Routines

When a routine is shared, its muscleGroups array MUST be included in the shared document.

#### Scenario: Share routine includes muscle groups

- GIVEN a routine with muscleGroups ["piernas"] is shared
- WHEN the receiving device resolves the shared document
- THEN the merged routine includes the muscleGroups field
