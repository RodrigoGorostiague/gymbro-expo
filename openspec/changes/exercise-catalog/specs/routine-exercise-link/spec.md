# Routine Exercise Link Specification

## Purpose

Exercises within routines are now snapshot references to catalog exercises. When added, the exercise's name and muscleGroups are copied into the routine. Sets are routine-specific and independently editable. Once added, name and muscleGroups are locked (immutable within the routine).

## Data Model

```typescript
interface RoutineExercise {
  id: string;                  // unique per routine instance
  catalogExerciseId: string;   // reference to catalog Exercise.id
  name: string;                // snapshot from catalog at time of add
  muscleGroups: MuscleGroup[]; // snapshot from catalog at time of add
  variant: ExerciseVariant;    // snapshot from catalog at time of add
  sets: RoutineSet[];          // routine-specific, fully editable
}

interface RoutineSet {
  id: string;
  tipo: 'C' | number | 'F';
  weight: number;
  reps: number; // 0 when tipo === 'F'
  completed?: boolean;
}
```

## Requirements

### Requirement: Exercise Addition via Snapshot

When adding an exercise to a routine, the system MUST copy `name`, `muscleGroups`, and `variant` from the catalog exercise into the RoutineExercise. The `catalogExerciseId` MUST reference the source catalog exercise. Default sets from the catalog SHOULD be copied as the initial routine sets.

#### Scenario: Add catalog exercise to routine

- GIVEN catalog exercise `{ id: "e1", name: "Press Banca", muscleGroups: ["pecho"], variant: "barra", defaultSets: [C(20,15), 1(60,10)] }`
- WHEN the user adds it to routine "Push Day"
- THEN a RoutineExercise is created with `catalogExerciseId: "e1"`, `name: "Press Banca"`, same muscleGroups, same variant
- AND sets are initialized from `defaultSets`

#### Scenario: Snapshot preserves name after catalog edit

- GIVEN a routine exercise snapped with `name: "Press Banca"`
- WHEN the catalog exercise is renamed to "Press Inclinado"
- THEN the routine exercise still displays "Press Banca"

### Requirement: Locked Fields in Routine

Once a RoutineExercise is created, its `name`, `muscleGroups`, and `variant` fields MUST NOT be editable from the routine editing screen. Only `sets` are editable.

#### Scenario: Attempt to edit locked fields

- GIVEN a routine exercise with locked name "Press Banca"
- WHEN the user opens the routine editing screen
- THEN the name and muscle groups are displayed as read-only
- AND only the sets section is editable

#### Scenario: Edit sets of routine exercise

- GIVEN a routine exercise with sets `[1(60,10), 2(65,8)]`
- WHEN the user changes set 1 weight to 62.5 and adds set 3
- THEN the routine exercise updates to `[1(62.5,10), 2(65,8), 3(new)]`

### Requirement: Exercise Picker

The system MUST provide an `ExercisePicker` modal that lists catalog exercises and allows filtering by muscle group. The picker SHOULD pre-filter by the routine's muscle groups.

#### Scenario: Open exercise picker

- GIVEN routine "Push Day" with muscleGroups ["pecho", "hombros"]
- WHEN the user taps "Add Exercise"
- THEN the picker opens showing catalog exercises filtered to those with "pecho" OR "hombros" in their muscleGroups

#### Scenario: Select exercise from picker

- GIVEN the picker is open and showing filtered exercises
- WHEN the user taps "Press Banca"
- THEN the exercise is added to the routine via snapshot
- AND the picker closes

### Requirement: Inline Exercise Creation

The system MUST allow creating a new catalog exercise from within the routine editing flow. The new exercise MUST auto-assign the routine's muscle groups.

#### Scenario: Create exercise from routine flow

- GIVEN the user is in routine "Push Day" (muscleGroups: ["pecho", "hombros"])
- WHEN the user taps "Create New Exercise" from the picker
- THEN a creation form opens with muscleGroups pre-selected as ["pecho", "hombros"]
- AND the user can modify the selection before saving
- AND the new exercise is added to the catalog AND added to the routine via snapshot

### Requirement: Exercise Removal from Routine

The system MUST allow removing a RoutineExercise from a routine. This MUST NOT affect the catalog exercise.

#### Scenario: Remove exercise from routine

- GIVEN a routine with 3 exercises
- WHEN the user removes the second exercise
- THEN the routine has 2 exercises
- AND the catalog exercise is unaffected

### Requirement: Unique Instance ID

Each RoutineExercise MUST have a unique `id` within the routine, even if the same catalog exercise is added multiple times.

#### Scenario: Add same exercise twice

- GIVEN catalog exercise "Press Banca" (id: "e1")
- WHEN the user adds it to a routine twice
- THEN two RoutineExercise entries exist with different `id` values but the same `catalogExerciseId`
