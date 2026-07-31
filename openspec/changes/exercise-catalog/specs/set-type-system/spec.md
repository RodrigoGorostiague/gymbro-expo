# Set Type System Specification

## Purpose

Sets within exercises carry a `tipo` field that classifies them as warmup (C), working (number), or failure (F). Each type has distinct execution semantics and volume calculation rules.

## Data Model

```typescript
type SetType = 'C' | number | 'F';

interface CatalogSet {
  id: string;
  tipo: SetType;
  weight: number;
  reps: number; // 0 when tipo === 'F'
}

interface RoutineSet {
  id: string;
  tipo: SetType;
  weight: number;
  reps: number; // 0 when tipo === 'F'
  completed?: boolean;
}
```

## Set Type Semantics

| Tipo | Label | Reps | Counts for Volume | Execution |
|------|-------|------|--------------------|-----------|
| `C` | Calentamiento | User-defined | YES | Performed normally, logged with weight+reps |
| `1`,`2`,`3`... | Working set | User-defined | YES | Performed normally, logged with weight+reps |
| `F` | Fallo | N/A (0) | YES (weight-only) | User performs reps until failure; reps field is 0 |

## Requirements

### Requirement: Set Type Assignment

Every set in both catalog and routine contexts MUST have a `tipo` field. The system MUST accept 'C', any positive integer, or 'F' as valid values.

#### Scenario: Assign warmup type

- GIVEN a user is configuring sets for an exercise
- WHEN the user sets tipo to 'C' with weight 20kg and reps 15
- THEN the set is stored with `tipo: 'C'`

#### Scenario: Assign failure type

- GIVEN a user is configuring sets
- WHEN the user sets tipo to 'F' with weight 80kg
- THEN the set is stored with `tipo: 'F'` and `reps: 0`

#### Scenario: Assign working set number

- GIVEN a user is configuring sets
- WHEN the user sets tipo to 1 with weight 60kg and reps 10
- THEN the set is stored with `tipo: 1`

### Requirement: Failure Set Execution

When executing a set with `tipo === 'F'`, the system MUST NOT display a reps input field. The user performs reps until failure; the actual rep count is NOT recorded in the set definition.

#### Scenario: Execute failure set

- GIVEN a routine exercise with a set `{ tipo: 'F', weight: 80, reps: 0 }`
- WHEN the user is executing this set
- THEN the UI shows weight but NOT a reps input
- AND the set is marked completed without a rep count

#### Scenario: Failure set volume calculation

- GIVEN a completed failure set with weight 80kg
- WHEN calculating total session volume
- THEN the set contributes weight-based volume (reps are 0, so tonnage contribution is 0; the set counts as 1 completed set)

### Requirement: Warmup Set Volume

Sets with `tipo === 'C'` MUST count toward total volume/tonnage calculations, identical to working sets.

#### Scenario: Warmup counts for volume

- GIVEN a completed warmup set `{ tipo: 'C', weight: 20, reps: 15 }`
- WHEN calculating total session tonnage
- THEN the set contributes 20 × 15 = 300 kg to total tonnage

### Requirement: Working Set Volume

Sets with numeric `tipo` MUST count toward total volume/tonnage calculations.

#### Scenario: Working set volume

- GIVEN a completed working set `{ tipo: 1, weight: 60, reps: 10 }`
- WHEN calculating total session tonnage
- THEN the set contributes 60 × 10 = 600 kg to total tonnage

### Requirement: Set Type in Catalog Defaults

Catalog exercises MAY define default sets with any combination of tipos. These defaults are copied when the exercise is added to a routine.

#### Scenario: Catalog with mixed set types

- GIVEN a catalog exercise with sets `[C(20kg,15), 1(60kg,10), 2(65kg,8), F(80kg,0)]`
- WHEN the exercise is added to a routine
- THEN the routine exercise inherits all 4 sets with their tipos preserved
