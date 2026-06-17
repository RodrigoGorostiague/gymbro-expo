import { WorkoutSession } from '../types';
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

export function getWorkoutsInWeek(sessions: WorkoutSession[], weeksAgo: number): number {
  const { start, end } = getWeekRange(weeksAgo);
  return sessions.filter((s) => {
    const d = new Date(s.completedAt);
    return d >= start && d <= end;
  }).length;
}

export function shouldAwardWeeklyGoalBonus(
  sessions: WorkoutSession[],
  bonusWeekKey: string | null,
): { award: boolean; weekKey: string; currentWeek: number; lastWeek: number } {
  const weekKey = getWeekKey();
  const currentWeek = getWorkoutsInWeek(sessions, 0);
  const lastWeek = getWorkoutsInWeek(sessions, 1);

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
