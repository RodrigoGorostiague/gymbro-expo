import { describe, expect, test } from 'vitest';
import {
  deriveMesocycleDateRange,
  deriveMesocycleTemporalLabel,
  findOverlappingMesocycle,
  getMesocycleStatusCopy,
  groupMesocyclesForList,
  isCurrentMesocycleStatus,
  isTerminalMesocycleStatus,
  sortMesocyclesActiveFirst,
} from '../utils/mesocycleAnalytics';

const plan = (overrides: Partial<{ id: string; status: 'draft' | 'scheduled' | 'active' | 'completed' | 'paused' | 'cancelled' | 'archived'; startDate: string; durationWeeks: number }> = {}) => ({
  id: 'candidate',
  status: 'scheduled' as const,
  startDate: '2026-02-01',
  durationWeeks: 2,
  ...overrides,
});

describe('mesocycle analytics domain utilities', () => {
  test('recognizes the rebuild lifecycle statuses and rejects legacy-only values', () => {
    expect(['draft', 'scheduled', 'active', 'completed', 'paused', 'cancelled'].every(isCurrentMesocycleStatus)).toBe(true);
    expect(isCurrentMesocycleStatus('archived')).toBe(false);
    expect(isTerminalMesocycleStatus('completed')).toBe(true);
    expect(isTerminalMesocycleStatus('cancelled')).toBe(true);
    expect(isTerminalMesocycleStatus('active')).toBe(false);
  });

  test('derives an inclusive date range across month boundaries', () => {
    expect(deriveMesocycleDateRange(plan({ startDate: '2026-02-22' }))).toEqual({
      startDate: '2026-02-22',
      endDate: '2026-03-07',
      dayCount: 14,
    });
  });

  test('rejects missing, invalid, and non-positive date ranges', () => {
    expect(deriveMesocycleDateRange(plan({ startDate: '2026-02-31' }))).toBeNull();
    expect(deriveMesocycleDateRange(plan({ durationWeeks: 0 }))).toBeNull();
  });

  test.each([
    ['upcoming', '2026-01-31'],
    ['in-progress', '2026-02-01'],
    ['in-progress', '2026-02-14'],
    ['ended', '2026-02-15'],
  ] as const)('labels a dated mesocycle as %s', (expected, today) => {
    expect(deriveMesocycleTemporalLabel(plan(), new Date(`${today}T12:00:00`))).toBe(expected);
  });

  test('labels undated mesocycles safely', () => {
    expect(deriveMesocycleTemporalLabel(plan({ startDate: '' }))).toBe('undated');
  });

  test('finds inclusive overlap at range boundaries but ignores terminal and self plans', () => {
    const candidate = plan({ id: 'candidate', startDate: '2026-02-01', durationWeeks: 2 });
    const completed = plan({ id: 'completed', status: 'completed', startDate: '2026-02-10' });
    const adjacent = plan({ id: 'adjacent', status: 'active', startDate: '2026-02-14', durationWeeks: 1 });

    expect(findOverlappingMesocycle(candidate, [candidate, completed, adjacent])).toBe(adjacent);
    expect(findOverlappingMesocycle(plan({ status: 'cancelled' }), [adjacent])).toBeUndefined();
  });

  test('sorts active mesocycles first without mutating relative order', () => {
    const source = [plan({ id: 'draft', status: 'draft' }), plan({ id: 'active-a', status: 'active' }), plan({ id: 'paused', status: 'paused' }), plan({ id: 'active-b', status: 'active' })];
    expect(sortMesocyclesActiveFirst(source).map(({ id }) => id)).toEqual(['active-a', 'active-b', 'draft', 'paused']);
    expect(source.map(({ id }) => id)).toEqual(['draft', 'active-a', 'paused', 'active-b']);
  });

  test('groups mesocycles with active plans visible first and other sections separated', () => {
    const source = [
      { ...plan({ id: 'draft-old', status: 'draft' }), createdAt: '2026-02-01T10:00:00Z' },
      { ...plan({ id: 'completed', status: 'completed', startDate: '2026-02-01' }), createdAt: '2026-02-02T10:00:00Z' },
      { ...plan({ id: 'active-upcoming', status: 'active', startDate: '2026-02-20' }), createdAt: '2026-02-03T10:00:00Z' },
      { ...plan({ id: 'active-current', status: 'active', startDate: '2026-02-14' }), createdAt: '2026-02-04T10:00:00Z' },
      { ...plan({ id: 'shared', status: 'draft' }), createdAt: '2026-02-05T10:00:00Z', sharedFrom: { requestId: 'request', senderId: 'sender', acceptedAt: '2026-02-05T10:00:00Z' } },
      { ...plan({ id: 'draft-new', status: 'draft' }), createdAt: '2026-02-06T10:00:00Z' },
      { ...plan({ id: 'archived', status: 'archived' }), createdAt: '2026-02-07T10:00:00Z' },
    ];

    const groups = groupMesocyclesForList(source);
    expect(groups.map(({ key, items }) => [key, items.map(({ id }) => id)])).toEqual([
      ['active', ['active-current', 'active-upcoming']],
      ['shared', ['shared']],
      ['draft', ['draft-new', 'draft-old']],
      ['completed', ['completed']],
      ['archived', ['archived']],
    ]);
  });

  test('provides non-empty UI-safe copy for every lifecycle status', () => {
    for (const status of ['draft', 'scheduled', 'active', 'completed', 'paused', 'cancelled'] as const) {
      const copy = getMesocycleStatusCopy(status);
      expect(copy.label).not.toHaveLength(0);
      expect(copy.description).not.toHaveLength(0);
      expect(copy.accessibilityLabel).toContain(copy.label.toLowerCase());
    }
  });
});
