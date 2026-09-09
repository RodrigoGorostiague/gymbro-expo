import type { WorkoutSession } from '../types';

/** Owner-only summary of available history, never a public-profile projection. */
export function summarizeProfileHistory(sessions: readonly WorkoutSession[], now = Date.now()) {
  const unique = new Map<string, WorkoutSession>();
  for (const session of sessions) {
    const completed = Date.parse(session.completedAt);
    if (session.id && Number.isFinite(completed) && completed <= now) unique.set(session.id, session);
  }
  const completed = [...unique.values()].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  const recent = completed.filter((session) => Date.parse(session.completedAt) >= now - 30 * 86_400_000);
  return {
    completedCount: completed.length,
    recentCount: recent.length,
    minutes: Math.round(completed.reduce((total, session) => total + (Number.isFinite(session.durationSeconds) ? Math.max(0, session.durationSeconds) : 0), 0) / 60),
    latest: completed[0] ?? null,
  };
}
