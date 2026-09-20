import type { WorkoutAttempt } from '../types';
import { deriveMuscleVolume, MUSCLE_VOLUME_AXES } from './muscleVolume';
import { MUSCLE_RANK_POLICY } from '../constants/muscleRanks';

export type MuscleRankPause = { start: string; end: string | null };
export type MuscleRankAxis = { id: string; xp: number; peakXp: number; lastActivity: string | null; protectionDays: number; earnedToday: number; earnedSevenDays: number };
export type MuscleRanks = { policyVersion: 1; subjectId: string; asOf: string; axes: MuscleRankAxis[]; paused: boolean; pauseStartsOn: string | null; pauseEndsOn: string | null };
export type MuscleRankDay = { day: string; equivalents: Record<string, number> };
const DAY = 86400000;
const dayNumber = (day: string) => Math.floor(Date.parse(day) / DAY);
const dayString = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);

/** Aggregate once per UTC day, sharing volume's validation and direct/indirect policy. */
export function muscleRankDays(attempts: readonly WorkoutAttempt[], subjectId: string, now: number): MuscleRankDay[] {
  const groups = new Map<number, WorkoutAttempt[]>();
  const seen = new Set<string>();
  for (const attempt of attempts) {
    const time = Date.parse(attempt.completedAt);
    if (attempt.owner !== subjectId || !attempt.id || !Number.isFinite(time) || time >= now || seen.has(attempt.id)) continue;
    seen.add(attempt.id);
    const day = Math.floor(time / DAY);
    groups.set(day, [...(groups.get(day) ?? []), attempt]);
  }
  return [...groups].sort(([a], [b]) => a - b).map(([day, records]) => ({
    day: dayString(day),
    equivalents: Object.fromEntries(deriveMuscleVolume(records, subjectId, 7, Math.min(now, (day + 1) * DAY)).current.axes.map(axis => [axis.id, axis.equivalent])),
  }));
}

/** Replay in date order; paused UTC days neither earn points nor advance the decay clock. */
export function rankFromDays(days: readonly MuscleRankDay[], subjectId: string, now: number, pauses: readonly MuscleRankPause[] = []): MuscleRanks {
  const today = Math.floor(now / DAY);
  const intervals = pauses.map(p => ({ start: dayNumber(p.start), end: p.end ? dayNumber(p.end) : Infinity }));
  const pausedAt = (day: number) => intervals.some(p => day >= p.start && day < p.end);
  const activeDay = (day: number) => day - intervals.reduce((n, p) => n + Math.max(0, Math.min(day, p.end) - p.start), 0);
  const events = [...days].sort((a, b) => a.day.localeCompare(b.day)).filter(d => dayNumber(d.day) <= today && !pausedAt(dayNumber(d.day)));
  const axes = MUSCLE_VOLUME_AXES.map(({ id }): MuscleRankAxis => {
    let xp = 0, peakXp = 0, protectedAt: number | null = null, processedAt = 0;
    let lastActivity: string | null = null;
    let credits: { day: number; xp: number }[] = [];
    const decayTo = (day: number) => {
      if (protectedAt !== null) xp *= Math.pow(1 - MUSCLE_RANK_POLICY.decay, Math.max(0, day - Math.max(processedAt, protectedAt + MUSCLE_RANK_POLICY.graceDays)));
      processedAt = day;
    };
    for (const event of events) {
      const equivalent = event.equivalents[id] ?? 0;
      if (equivalent <= 0) continue;
      const calendarDay = dayNumber(event.day), clock = activeDay(calendarDay);
      decayTo(clock);
      credits = credits.filter(c => c.day >= calendarDay - 6);
      const earned = Math.min(equivalent * 10, MUSCLE_RANK_POLICY.dailyCap, Math.max(0, MUSCLE_RANK_POLICY.weeklyCap - credits.reduce((n, c) => n + c.xp, 0)));
      credits.push({ day: calendarDay, xp: earned });
      xp = Math.min(MUSCLE_RANK_POLICY.maxXp, xp + earned);
      peakXp = Math.max(peakXp, xp);
      if (protectedAt === null || equivalent >= 2) protectedAt = clock;
      lastActivity = event.day;
    }
    const clock = activeDay(today);
    decayTo(clock);
    // Floor presentation values: rounding must never promote a muscle prematurely.
    return { id, xp: Math.floor(xp), peakXp: Math.floor(peakXp), lastActivity,
      protectionDays: protectedAt === null ? 0 : Math.max(0, MUSCLE_RANK_POLICY.graceDays - (clock - protectedAt)),
      earnedToday: credits.filter(c => c.day === today).reduce((n, c) => n + c.xp, 0),
      earnedSevenDays: credits.filter(c => c.day >= today - 6).reduce((n, c) => n + c.xp, 0) };
  });
  const latest = [...pauses].sort((a, b) => b.start.localeCompare(a.start)).find(p => !p.end || dayNumber(p.end) > today);
  return { policyVersion: 1, subjectId, asOf: new Date(now).toISOString(), axes, paused: pausedAt(today), pauseStartsOn: latest?.start ?? null, pauseEndsOn: latest?.end ?? null };
}

export function deriveMuscleRanks(attempts: readonly WorkoutAttempt[], subjectId: string, now = Date.now(), pauses: readonly MuscleRankPause[] = []) {
  return rankFromDays(muscleRankDays(attempts, subjectId, now), subjectId, now, pauses);
}
