import { ExperienceProgress, TrainingRank } from '../types';

export function xpForNextLevel(level: number): number {
  return Math.ceil(80 + 20 * level ** 1.45);
}

export function trainingRank(level: number): TrainingRank {
  if (level < 5) return 'Principiante';
  if (level < 10) return 'Intermedio';
  if (level < 20) return 'Avanzado';
  if (level < 35) return 'GymBro';
  if (level < 50) return 'GymRat';
  if (level < 70) return 'G-Boom';
  if (level < 85) return 'Alfa';
  return 'Sigma';
}

export function experienceProgressPercent(progress: ExperienceProgress): number {
  if (progress.xpForNextLevel <= 0) return 0;
  return Math.min(100, Math.max(0, progress.xpIntoLevel / progress.xpForNextLevel * 100));
}
