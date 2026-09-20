/** Game balance, not physiological thresholds. Keep policy version and SQL in sync. */
export const MUSCLE_RANKS = [
  { name: 'Principiante', xp: 0, color: '#94A3B8' },
  { name: 'Intermedio', xp: 100, color: '#84CC16' },
  { name: 'Avanzado', xp: 300, color: '#F97316' },
  { name: 'GymBro', xp: 800, color: '#FBBF24' },
  { name: 'GymRat', xp: 1800, color: '#EF4444' },
  { name: 'G-Boom', xp: 3500, color: '#38BDF8' },
  { name: 'Alfa', xp: 6000, color: '#3B82F6' },
  { name: 'Sigma', xp: 10000, color: '#A855F7' },
] as const;
export const MUSCLE_RANK_POLICY = { version: 1, dailyCap: 60, weeklyCap: 120, graceDays: 7, decay: .005, maxXp: 11000 } as const;
export function muscleRankIndex(xp: number) {
  return MUSCLE_RANKS.reduce((rank, item, index) => xp >= item.xp ? index : rank, 0);
}
