import { ActualEffort, ExerciseLoadMode, LoadUnit, Mesocycle, WorkoutAttempt } from '../types';
import { readActualEffort } from './actualEffort';
import { flattenMesocycleEntries, isExecutablePlannedSession } from './mesocycles';
import { isValidPerformance } from './workoutAttempts';

export interface MesocycleExposure {
  attemptId: string;
  at: string;
  weekNumber: number;
  load: number;
  reps: number;
  sets: number;
  volume: number | null;
  efforts: ActualEffort[];
}
export interface MesocycleEvolution {
  id: string;
  name: string;
  routineName: string;
  mode: ExerciseLoadMode;
  unit: LoadUnit;
  points: MesocycleExposure[];
}

/** Compare the same routine, exercise occurrence, variant, load semantics and performed set structure. */
export function deriveMesocycleEvolution(mesocycle: Mesocycle, attempts: readonly WorkoutAttempt[], owner: string | null): MesocycleEvolution[] {
  const groups = new Map<string, MesocycleEvolution>();
  if (!owner) return [];
  for (const { weekNumber, entry } of flattenMesocycleEntries(mesocycle)) {
    if (!('ref' in entry) || !isExecutablePlannedSession(entry)) continue;
    const attempt = attempts.filter((item) => item.owner === owner && item.routineId === entry.ref.routineId
      && item.lineage?.mesocycleId === mesocycle.id && item.lineage.weekNumber === weekNumber
      && item.lineage.plannedSessionId === entry.id && Number.isFinite(Date.parse(item.completedAt)))
      .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt) || b.id.localeCompare(a.id))[0];
    if (!attempt) continue;
    for (const exercise of attempt.exercises) {
      const sets = exercise.sets.filter(({ plan, result }) => plan && result && plan.type !== 'C' && result.performed
        && result.setId === plan.id && result.performance && result.performance.durationSeconds === undefined && !result.performance.bodyweightUnspecified && isValidPerformance(result.performance));
      const first = sets[0]?.result.performance;
      if (!first || sets.some(({ result }) => result.performance!.mode !== first.mode || result.performance!.unit !== first.unit)) continue;
      const id = JSON.stringify([attempt.routineId, exercise.exerciseId, exercise.variant ?? attempt.id,
        first.mode, first.unit, first.bodyweightIncluded ?? false, sets.map(({ plan }) => [plan.id, plan.type, plan.backoffGroupId]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) ]);
      const group = groups.get(id) ?? { id, name: exercise.recordedName, routineName: entry.ref.routineName, mode: first.mode, unit: first.unit, points: [] };
      const loads = sets.map(({ result }) => {
        const value = result.performance!;
        return value.mode === 'external-load' ? value.load : value.mode === 'assisted' ? value.assistance : value.bodyweight;
      });
      group.points.push({ attemptId: attempt.id, at: attempt.completedAt, weekNumber,
        load: Math.max(...loads), reps: sets.reduce((sum, { result }) => sum + result.performance!.reps, 0), sets: sets.length,
        volume: first.mode === 'external-load' ? sets.reduce((sum, { result }, index) => sum + loads[index] * result.performance!.reps, 0) : null,
        efforts: sets.flatMap(({ result }) => { const effort = readActualEffort(result.actualEffort); return effort ? [effort] : []; }),
      });
      groups.set(id, group);
    }
  }
  return [...groups.values()].map((group) => ({ ...group, points: group.points.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.attemptId.localeCompare(b.attemptId)) }));
}

export function exposureEffortLabel(point: MesocycleExposure): string {
  const labels = (['rir', 'rpe'] as const).flatMap((kind) => {
    const values = point.efforts.filter((effort) => effort.kind === kind).map(({ value }) => value);
    if (!values.length) return [];
    const min = Math.min(...values), max = Math.max(...values);
    return [`${kind.toUpperCase()} ${min === max ? min : `${min}–${max}`} (${values.length}/${point.sets} series)`];
  });
  return labels.join(' · ') || 'Esfuerzo sin registrar';
}
