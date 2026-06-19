# Analytics Exercise Matching Specification

## Purpose

Progress tracking and analytics MUST match exercises by stable catalog ID rather than by name string. This prevents false mismatches when exercises are renamed and enables reliable historical comparisons. Backward compatibility with old sessions (name-only, no catalogExerciseId) MUST be maintained via fallback matching.

## Data Model Changes

```typescript
// CompletedExercise now includes catalogExerciseId
interface CompletedExercise {
  exerciseId: string;          // RoutineExercise.id (instance)
  catalogExerciseId: string;   // NEW: stable reference to catalog
  name: string;                // snapshot name
  sets: CompletedSet[];
}

// WorkoutSession exercises carry the catalog reference
interface WorkoutSession {
  id: string;
  routineId: string;
  routineName: string;
  completedAt: string;
  durationSeconds: number;
  restTimerSeconds: number;
  exercises: CompletedExercise[]; // now includes catalogExerciseId
}
```

## Requirements

### Requirement: ID-Based Matching

When aggregating exercise history for progress tracking, the system MUST match exercises by `catalogExerciseId` as the primary key.

#### Scenario: Match exercises by ID across sessions

- GIVEN session A has CompletedExercise with `catalogExerciseId: "e1"` and session B has the same
- WHEN the analytics screen loads exercise history for "e1"
- THEN data from both sessions is aggregated under the same exercise

#### Scenario: Renamed exercise still matches

- GIVEN catalog exercise "e1" was originally named "Press Banca" and is now "Press Inclinado"
- WHEN analytics aggregates sessions containing `catalogExerciseId: "e1"`
- THEN all sessions are correctly grouped regardless of the name at time of recording

### Requirement: Name-Based Fallback

For sessions that predate the catalog (no `catalogExerciseId` field), the system MUST fall back to name-based matching.

#### Scenario: Old session without catalogExerciseId

- GIVEN an old session with CompletedExercise `{ name: "Press Banca" }` (no catalogExerciseId)
- WHEN analytics processes this session
- THEN the system matches by name "Press Banca" to find the corresponding catalog exercise
- AND the data point is included in the exercise history

#### Scenario: No catalog match for old name

- GIVEN an old session with CompletedExercise `{ name: "Old Exercise" }`
- WHEN no catalog exercise with name "Old Exercise" exists
- THEN the data point is displayed under the raw name "Old Exercise" without catalog linkage

### Requirement: Dual Matching Strategy

The matching algorithm MUST attempt `catalogExerciseId` first. Only when `catalogExerciseId` is absent or undefined MUST it fall back to name matching.

#### Scenario: Mixed old and new sessions

- GIVEN 3 sessions: two with `catalogExerciseId: "e1"`, one old session with `name: "Press Banca"` (no ID)
- WHEN analytics aggregates for exercise "e1" (currently named "Press Banca")
- THEN all 3 sessions contribute data points to the same exercise history

#### Scenario: New session always uses ID

- GIVEN a session recorded after the catalog migration
- WHEN the session is saved
- THEN every CompletedExercise includes `catalogExerciseId`

### Requirement: Session Recording with Catalog ID

When completing a workout, the system MUST write `catalogExerciseId` from each RoutineExercise into the CompletedExercise record.

#### Scenario: Record session with catalog IDs

- GIVEN a routine exercise with `catalogExerciseId: "e1"`
- WHEN the user completes the workout
- THEN the resulting WorkoutSession.exercises[0] has `catalogExerciseId: "e1"`

### Requirement: Volume Calculation with Set Types

Analytics volume calculations MUST respect set type semantics: 'C' and numeric sets contribute weight×reps to tonnage; 'F' sets contribute 0 tonnage (reps=0) but count toward completed set count.

#### Scenario: Volume with mixed set types

- GIVEN a completed exercise with sets: C(20,15), 1(60,10), F(80,0)
- WHEN calculating exercise tonnage
- THEN tonnage = (20×15) + (60×10) + (80×0) = 900 kg
- AND completed set count = 3
