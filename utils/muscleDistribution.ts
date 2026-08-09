import type { CatalogMuscleGroup } from '../services/catalog';
import type { MuscleDistributionEntry } from '../services/socialGraph';
import type { WorkoutAttempt } from '../types';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function ownMuscleDistribution(attempts: readonly WorkoutAttempt[], groups: readonly CatalogMuscleGroup[], now = Date.now()): MuscleDistributionEntry[] {
  const parents = groups.filter((group) => group.type === 'Grupo padre' && group.visibleInFilters);
  const values = new Map(parents.map((group) => [group.id, 0]));

  for (const attempt of attempts) {
    if (now - new Date(attempt.completedAt).getTime() > NINETY_DAYS_MS) continue;
    for (const exercise of attempt.exercises) {
      if (!exercise.sets.some((set) => set.result.performed)) continue;
      const muscleIds = exercise.catalog?.muscleParticipations.map((entry) => entry.muscleGroupId)
        ?? [exercise.attribution?.primary, ...(exercise.attribution?.secondary ?? [])].filter((id): id is string => Boolean(id));
      for (const id of new Set(muscleIds)) {
        if (values.has(id)) values.set(id, (values.get(id) ?? 0) + 1);
      }
    }
  }

  return parents.map((group) => ({ id: group.id, label: group.displayName, value: values.get(group.id) ?? 0 }));
}
