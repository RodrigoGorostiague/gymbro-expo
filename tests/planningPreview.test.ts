import { expect, test } from 'vitest';
import { buildGuidedWeeks, REST_DAY } from '../utils/planningPreview';
import type { Routine } from '../types';
const routine: Routine = { id: 'r', name: 'Upper', muscleGroups: [], exercises: [], createdAt: '' };
test('builds a real repeated week with independent IDs and frozen routine snapshots', () => {
  let id = 0;
  const weeks = buildGuidedWeeks(2, ['r', REST_DAY, null], [routine], () => String(++id));
  expect(weeks).toHaveLength(2);
  expect(weeks.map((week) => week.entries.length)).toEqual([2, 2]);
  expect(weeks[0].entries[1]).toMatchObject({ kind: 'rest' });
  const first = weeks[0].entries[0];
  expect(first).toMatchObject({ ref: { routineId: 'r' }, routineSnapshot: routine, planningState: 'pending' });
  if ('ref' in first) expect(first.routineSnapshot).not.toBe(routine);
  expect(new Set(weeks.flatMap((week) => [week.id, ...week.entries.map((entry) => entry.id)])).size).toBe(6);
});
test('does not turn unassigned calendar holes into invented rest or accept removed routines', () => {
  expect(() => buildGuidedWeeks(1, [null, 'r'], [routine], () => 'id')).toThrow('días intermedios');
  expect(() => buildGuidedWeeks(1, ['missing'], [routine], () => 'id')).toThrow('ya no está disponible');
  expect(buildGuidedWeeks(1, [null, null], [], () => 'id')[0].entries).toEqual([]);
});
