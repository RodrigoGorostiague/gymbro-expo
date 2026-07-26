import { WorkoutAttempt } from '../types';
import { startOfWeek } from './analytics';

export function getWeekKey(date: Date = new Date()): string {
  const start = startOfWeek(date);
  return start.toISOString().slice(0, 10);
}

function getWeekRange(weeksAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const start = startOfWeek(now);
  start.setDate(start.getDate() - weeksAgo * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function getWorkoutsInWeek(
  attempts: readonly WorkoutAttempt[],
  weeksAgo: number,
): number {
  const { start, end } = getWeekRange(weeksAgo);
  return attempts.filter((attempt) => {
    const d = new Date(attempt.completedAt);
    return attempt.completion.status !== 'partial' && d >= start && d <= end;
  }).length;
}

export function shouldAwardWeeklyGoalBonus(
  attempts: readonly WorkoutAttempt[],
  bonusWeekKey: string | null,
): { award: boolean; weekKey: string; currentWeek: number; lastWeek: number } {
  const weekKey = getWeekKey();
  const currentWeek = getWorkoutsInWeek(attempts, 0);
  const lastWeek = getWorkoutsInWeek(attempts, 1);

  if (bonusWeekKey === weekKey) {
    return { award: false, weekKey, currentWeek, lastWeek };
  }

  return {
    award: currentWeek > lastWeek && lastWeek >= 0,
    weekKey,
    currentWeek,
    lastWeek,
  };
}
