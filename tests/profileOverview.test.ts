import { describe, expect, test } from 'vitest';
import { summarizeProfileHistory } from '../utils/profileOverview';
import type { WorkoutSession } from '../types';

const now = Date.parse('2026-09-09T12:00:00Z');
const session = (id: string, completedAt: string, durationSeconds = 120): WorkoutSession => ({ id, completedAt, durationSeconds, routineId: 'routine', routineName: 'Strength', restTimerSeconds: 0, exercises: [] });
describe('private profile history', () => {
  test('provides an honest empty state', () => {
    expect(summarizeProfileHistory([], now)).toEqual({ completedCount: 0, recentCount: 0, minutes: 0, latest: null });
  });
  test('counts unique completed sessions and a rolling 30 day window without mutating history', () => {
    const old = session('old', '2026-07-01T12:00:00Z', 3600);
    const latest = session('latest', '2026-09-09T11:00:00Z', 1200);
    const history = [old, latest, latest];
    expect(summarizeProfileHistory(history, now)).toEqual({ completedCount: 2, recentCount: 1, minutes: 80, latest });
    expect(history).toEqual([old, latest, latest]);
  });
  test('rejects invalid and future completions instead of inventing completed work', () => {
    expect(summarizeProfileHistory([session('invalid', 'bad'), session('future', '2027-01-01T00:00:00Z')], now).completedCount).toBe(0);
  });
  test('ignores invalid and negative durations but retains real completed sessions', () => {
    const result = summarizeProfileHistory([session('negative', '2026-09-01', -100), session('invalid', '2026-09-02', NaN)], now);
    expect(result.completedCount).toBe(2);
    expect(result.minutes).toBe(0);
  });
});
