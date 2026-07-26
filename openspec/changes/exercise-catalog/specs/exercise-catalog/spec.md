# Exercise Catalog Specification

## Purpose

Independent exercise catalog providing CRUD operations for exercises with muscle group tagging, variant classification, and default set templates. Catalog exercises serve as the source of truth that routines reference via snapshot.

## Data Model

```typescript
type MuscleGroup = 'pecho' | 'espalda' | 'cuadriceps' | 'femorales' | 'gemelos' | 'hombros' | 'bíceps' | 'tríceps' | 'core' | 'glúteos' | 'fullBody';
type ExerciseVariant = string; // normalized, validated global catalog entry

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

Storage: AsyncStorage key `@gymbro/exercise-catalog/v1`, serialized as one versioned envelope containing both `variants` and `exercises`. On first bootstrap only, exercises are copied non-destructively from `@gymbro/exercises`; that legacy key remains untouched for rollback.

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

### Requirement: Global Variant Management

The system MUST expose one device-wide variant catalog to both profiles. Users MUST be able to create, rename, and delete normalized variant names. Renaming MUST update every catalog Exercise using that variant in the same persisted envelope, while routine, shared-routine, and history snapshots remain unchanged.

Variant names MUST use NFC normalization, trimmed and collapsed whitespace, a maximum of 40 characters, and case-insensitive Spanish-locale duplicate comparison. Exercise creation and editing MUST reject variants absent from the latest persisted catalog.

Deletion MUST be rejected when the variant is used by any catalog exercise, with the exercise count and names shown to the user. Deletion of the final variant MUST also be rejected. The initial `barra`, `mancuernas`, `polea`, and `libre` entries are otherwise ordinary editable entries and MUST NOT be reinserted after bootstrap.

#### Scenario: Rename a variant used by catalog exercises

- GIVEN two catalog exercises use variant "barra" and a routine snapshot also records "barra"
- WHEN the user renames "barra" to "barra olímpica"
- THEN the variant and both catalog exercises are persisted atomically as "barra olímpica"
- AND the routine snapshot remains "barra"

#### Scenario: Block deletion of an in-use variant

- GIVEN variant "polea" is used by two catalog exercises
- WHEN the user attempts to delete "polea"
- THEN deletion is rejected with both exercise names and a count of 2

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

The catalog MUST be stored under a dedicated AsyncStorage key (`@gymbro/exercise-catalog/v1`), separate from routines and sessions. Variants and exercises MUST be written together in one envelope.

#### Scenario: Catalog persists independently

- GIVEN the catalog has 3 exercises and routines exist
- WHEN routines are cleared
- THEN the catalog exercises remain intact
