import type { ExperienceReceipt } from '../types';
import { trainingRank, xpForNextLevel } from './experience';

export type CelebrationStep = { level: number; from: number; to: number; capacity: number; start: number; end: number };

/** Rewind this receipt, rather than the live profile which may already include later sessions. */
export function celebrationSteps(receipt: ExperienceReceipt): CelebrationStep[] {
  let level = receipt.progress.level;
  let before = receipt.progress.xpIntoLevel - Math.max(0, receipt.earnedXp);
  while (before < 0 && level > 1) { level -= 1; before += xpForNextLevel(level); }
  const steps: CelebrationStep[] = [];
  const count = receipt.progress.level - level + 1;
  for (let index = 0; level <= receipt.progress.level; level += 1, index += 1) {
    const capacity = level === receipt.progress.level ? receipt.progress.xpForNextLevel : xpForNextLevel(level);
    steps.push({ level, from: index === 0 ? Math.max(0, before) : 0,
      to: level === receipt.progress.level ? receipt.progress.xpIntoLevel : capacity,
      capacity, start: index / count, end: (index + 1) / count });
  }
  return steps;
}

export function celebrationFrame(steps: CelebrationStep[], progress: number) {
  'worklet';
  const t = Math.min(1, Math.max(0, progress));
  const step = steps.find((item) => t < item.end) ?? steps[steps.length - 1];
  const fraction = Math.min(1, Math.max(0, (t - step.start) / (step.end - step.start)));
  const xp = step.from + (step.to - step.from) * fraction;
  return { level: step.level, xp: Math.round(xp), capacity: step.capacity, percent: Math.min(100, Math.max(0, xp / step.capacity * 100)), fraction };
}

export function celebrationRankChanged(steps: CelebrationStep[]) {
  return trainingRank(steps[0].level) !== trainingRank(steps[steps.length - 1].level);
}

export function rewardLabel(kind: string): string {
  const labels: Record<string, string> = {
    muscle_rank_up: 'Ascenso de rango muscular',
    contextual_record: 'Récord personal', personal_record: 'Récord personal',
    set: 'Series realizadas', completed_set: 'Series realizadas', valid_sets: 'Series realizadas',
    routine_completion: 'Entrenamiento realizado', perfection: 'Todas las series', weekly_extra: 'Entrenamiento extra',
    completion: 'Entrenamiento realizado', full_completion: 'Todas las series',
    full_completion_bonus: 'Todas las series', weekly_goal: 'Objetivo semanal',
    weekly_streak: 'Racha semanal', mesocycle_completed: 'Mesociclo completado',
  };
  return labels[kind] ?? 'Recompensa de entrenamiento';
}
