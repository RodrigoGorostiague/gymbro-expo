import { Mesocycle, MesocycleEntry, WorkoutLineage } from '../types';

type ParsedLineage = WorkoutLineage | null | undefined;

export type MesocycleExecutionLineageValidation =
  | { valid: true; lineage?: WorkoutLineage }
  | { valid: false; mesocycleId?: string; reason: 'malformed' | 'missing-mesocycle' | 'inactive-mesocycle' | 'missing-planned-session' };

function isRoutineEntry(entry: MesocycleEntry): entry is Exclude<MesocycleEntry, { kind: 'rest' }> {
  return !('kind' in entry && entry.kind === 'rest');
}

export function validateMesocycleExecutionLineage(
  mesocycles: readonly Mesocycle[],
  routineId: string,
  lineage: ParsedLineage,
  mesocycleId?: string,
): MesocycleExecutionLineageValidation {
  if (lineage === undefined) return { valid: true };
  if (lineage === null) return { valid: false, mesocycleId, reason: 'malformed' };

  const mesocycle = mesocycles.find((candidate) => candidate.id === lineage.mesocycleId);
  if (!mesocycle) return { valid: false, mesocycleId: lineage.mesocycleId, reason: 'missing-mesocycle' };
  if (mesocycle.status !== 'active') return { valid: false, mesocycleId: mesocycle.id, reason: 'inactive-mesocycle' };

  const entry = mesocycle.weeks
    .find((week) => week.weekNumber === lineage.weekNumber)
    ?.entries.find((candidate) => candidate.id === lineage.plannedSessionId);
  if (!entry || !isRoutineEntry(entry) || entry.ref.routineId !== routineId) {
    return { valid: false, mesocycleId: mesocycle.id, reason: 'missing-planned-session' };
  }

  return { valid: true, lineage };
}
