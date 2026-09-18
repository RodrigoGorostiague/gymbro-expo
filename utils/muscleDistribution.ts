import type { CatalogMuscleGroup } from '../services/catalog';
import type { MuscleDistributionEntry } from '../services/socialGraph';
import type { WorkoutAttempt } from '../types';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function ownMuscleDistribution(attempts: readonly WorkoutAttempt[], groups: readonly CatalogMuscleGroup[], now = Date.now()): MuscleDistributionEntry[] {
  const parents = groups.filter((group) => group.type === 'Grupo padre' && group.visibleInFilters);
  const values = new Map(parents.map((group) => [group.id, 0]));
  const parentIdsByGroup = new Map(groups.map((group) => [group.id, group.parentIds ?? []]));

  for (const attempt of attempts) {
    if (now - new Date(attempt.completedAt).getTime() > NINETY_DAYS_MS) continue;
    for (const exercise of attempt.exercises) {
      if (!exercise.sets.some((set) => set.result.performed)) continue;
      const participations = exercise.catalog?.muscleParticipations
        ?? [
          ...(exercise.attribution?.primary ? [{ muscleGroupId: exercise.attribution.primary, role: 'Principal' as const, relevance: 1, originalLabel: '' }] : []),
          ...(exercise.attribution?.secondary ?? []).map((muscleGroupId) => ({ muscleGroupId, role: 'Secundario' as const, relevance: 0.5, originalLabel: '' })),
        ];
      const exerciseValues = new Map<string, number>();
      for (const participation of participations) {
        const parentIds = parentIdsByGroup.get(participation.muscleGroupId) ?? (values.has(participation.muscleGroupId) ? [participation.muscleGroupId] : []);
        const relevance = Number.isFinite(participation.relevance) && participation.relevance > 0
          ? participation.relevance
          : participation.role === 'Principal' ? 1 : 0.5;
        for (const parentId of parentIds) {
          if (values.has(parentId)) exerciseValues.set(parentId, (exerciseValues.get(parentId) ?? 0) + relevance);
        }
      }
      for (const [parentId, relevance] of exerciseValues) {
        values.set(parentId, (values.get(parentId) ?? 0) + Math.min(1, relevance));
      }
    }
  }

  return parents.map((group) => ({ id: group.id, label: group.displayName, value: values.get(group.id) ?? 0 }));
}
