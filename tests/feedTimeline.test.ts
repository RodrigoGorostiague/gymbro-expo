import { describe, expect, test } from 'vitest';
import { feedDayKey, formatFeedDay, formatRelativeTime } from '../utils/feedTimeline';

const now = new Date(2026, 7, 8, 12, 0, 0).getTime();

describe('feed timeline formatting', () => {
  test('labels current and previous days without adding a visible date for same-day items', () => {
    expect(formatFeedDay('2026-08-08T09:00:00', now)).toBe('HOY');
    expect(formatFeedDay('2026-08-07T23:00:00', now)).toBe('AYER');
    expect(formatFeedDay('2026-08-06T23:00:00', now)).toBe('6 DE AGOSTO');
    expect(feedDayKey('2026-08-08T09:00:00')).not.toBe(feedDayKey('2026-08-07T23:00:00'));
  });

  test('formats a concise elapsed publication time', () => {
    expect(formatRelativeTime('2026-08-08T11:59:30', now)).toBe('ahora');
    expect(formatRelativeTime('2026-08-08T11:45:00', now)).toBe('hace 15 min');
    expect(formatRelativeTime('2026-08-08T09:00:00', now)).toBe('hace 3 h');
    expect(formatRelativeTime('2026-08-07T12:00:00', now)).toBe('ayer');
  });
});
