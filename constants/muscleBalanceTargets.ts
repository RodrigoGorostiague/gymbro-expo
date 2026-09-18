import type { CatalogMuscleGroup } from '../services/catalog';
import type { MuscleDistributionEntry } from '../services/socialGraph';

export const MUSCLE_BALANCE_TARGETS = [
  { id: 'balanced', label: 'Equilibrio general', description: 'Distribuye el estímulo entre todas las zonas principales.' },
  { id: 'upper', label: 'Énfasis tren superior', description: 'Prioriza pecho, espalda, hombros y brazos.' },
  { id: 'lower', label: 'Énfasis tren inferior', description: 'Prioriza piernas, glúteos y core.' },
] as const;

export type MuscleBalanceTargetId = (typeof MUSCLE_BALANCE_TARGETS)[number]['id'];

const upperBodyTerms = ['pecho', 'espalda', 'hombro', 'bicep', 'tricep', 'trapecio', 'dorsal', 'antebrazo'];
const lowerBodyTerms = ['cuadricep', 'femoral', 'gemelo', 'gluteo', 'aductor', 'abductor'];

function normalized(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('en-US');
}

function emphasisFor(group: CatalogMuscleGroup, targetId: MuscleBalanceTargetId): number {
  if (targetId === 'balanced') return 1;
  const terms = targetId === 'upper' ? upperBodyTerms : lowerBodyTerms;
  return terms.some((term) => normalized(group.displayName).includes(term)) ? 1.5 : 0.65;
}

export function muscleBalanceTargetForId(value: unknown): MuscleBalanceTargetId {
  return MUSCLE_BALANCE_TARGETS.some((target) => target.id === value) ? value as MuscleBalanceTargetId : 'balanced';
}

export function muscleBalanceTargetEntries(groups: readonly CatalogMuscleGroup[], targetId: MuscleBalanceTargetId): MuscleDistributionEntry[] {
  return groups
    .filter((group) => group.type === 'Grupo padre' && group.visibleInFilters)
    .map((group) => ({ id: group.id, label: group.displayName, value: emphasisFor(group, targetId) }));
}
