# Exercise Catalog Specification

## Purpose

Independent exercise catalog providing CRUD operations for exercises with muscle group tagging, variant classification, and default set templates. Catalog exercises serve as the source of truth that routines reference via snapshot.

## Data Model

```typescript
type MuscleGroup = 'pecho' | 'espalda' | 'cuadriceps' | 'femorales' | 'gemelos' | 'hombros' | 'bíceps' | 'tríceps' | 'core' | 'glúteos' | 'fullBody';
type ExerciseVariant = 'mancuernas' | 'barra' | 'libre';

interface CatalogSet {
  id: string;
  tipo: 'C' | number | 'F';
  weight: number;
  reps: number; // 0 when tipo is 'F'
}

interface Exercise {
  id: string;
  name: string;
  muscleGroups: MuscleGroup[]; // at least 1
  variant: ExerciseVariant;
  defaultSets: CatalogSet[];
}
```

Storage: AsyncStorage key `@gymbro/exercises`, serialized as `Exercise[]`.

## Requirements

### Requirement: Exercise Creation

The system MUST allow creating exercises with a non-empty name, at least one muscle group, a variant, and zero or more default sets. The system SHALL generate a unique `id` on creation.

#### Scenario: Create exercise with all fields

- GIVEN the catalog is open and the user initiates creation
- WHEN the user provides name "Press Banca", muscleGroups ["pecho", "tríceps"], variant "barra", and 3 default sets
- THEN a new Exercise is persisted with a unique id and all provided fields
- AND the exercise appears in the catalog list

#### Scenario: Reject exercise with no muscle groups

- GIVEN the user is creating an exercise
- WHEN the user submits with an empty muscleGroups array
- THEN the system MUST reject the submission and display a validation error

#### Scenario: Reject exercise with empty name

- GIVEN the user is creating an exercise
- WHEN the user submits with name "" or whitespace-only
- THEN the system MUST reject the submission and display a validation error

### Requirement: Exercise Editing

The system MUST allow editing any field of an existing catalog exercise. Edits MUST NOT propagate to routines that already reference this exercise (snapshot isolation).

#### Scenario: Edit exercise name

- GIVEN an exercise "Press Banca" exists in the catalog
- WHEN the user changes the name to "Press Inclinado" and saves
- THEN the catalog reflects the new name
- AND routines containing a snapshot of this exercise retain "Press Banca"

#### Scenario: Edit default sets

- GIVEN an exercise with 3 default sets
- WHEN the user adds a 4th set and saves
- THEN the catalog exercise has 4 sets
- AND existing routine copies are unchanged

### Requirement: Exercise Deletion

The system MUST allow deleting exercises from the catalog. Deletion MUST NOT remove or alter RoutineExercise snapshots that reference the deleted exercise.

#### Scenario: Delete exercise referenced by routines

- GIVEN exercise "X" is in the catalog and referenced by 2 routines via snapshot
- WHEN the user deletes "X" from the catalog
- THEN the catalog no longer contains "X"
- AND both routines still display their snapshot copies normally

### Requirement: Catalog Listing

The system MUST display all catalog exercises. The listing SHOULD support filtering by muscle group.

#### Scenario: List all exercises

- GIVEN the catalog contains 5 exercises
- WHEN the user opens the catalog tab
- THEN all 5 exercises are displayed with name, muscle groups, and variant

#### Scenario: Filter by muscle group

- GIVEN the catalog contains exercises tagged "pecho" and "espalda"
- WHEN the user filters by "pecho"
- THEN only exercises with "pecho" in their muscleGroups are shown

### Requirement: Catalog Storage Isolation

The catalog MUST be stored under a dedicated AsyncStorage key (`@gymbro/exercises`), separate from routines and sessions.

#### Scenario: Catalog persists independently

- GIVEN the catalog has 3 exercises and routines exist
- WHEN routines are cleared
- THEN the catalog exercises remain intact
