import { describe, expect, test } from 'vitest';
import { Mesocycle } from '../types';
import { deriveMesocycleDayGuidance, deriveMesocycleScheduleProjection, flattenMesocycleEntries } from '../utils/mesocycles';
const cycle = (entries: Mesocycle['weeks']): Mesocycle => ({ id: 'cycle', name: 'Block', goal: '', status: 'active', durationWeeks: 2, startDate: '2026-03-07', createdAt: '', weeks: entries });
describe('weekly entry sequence', () => {
  test('retains mixed entries across weekly boundaries', () => expect(flattenMesocycleEntries(cycle([{ id: 'w1', weekNumber: 1, entries: [{ id: 'routine', ref: { routineId: 'upper', routineName: 'Upper', source: 'local' }, order: 1 }, { id: 'rest', kind: 'rest' }] }, { id: 'w2', weekNumber: 2, entries: [{ id: 'lower', ref: { routineId: 'lower', routineName: 'Lower', source: 'local' }, order: 1 }] }])).map(({ entry }) => entry.id)).toEqual(['routine', 'rest', 'lower']));
  test('uses local sequential date mapping and distinguishes rest from unplanned', () => {
    const subject = cycle([{ id: 'w1', weekNumber: 1, entries: [{ id: 'routine', ref: { routineId: 'upper', routineName: 'Upper', source: 'local' }, order: 1 }, { id: 'rest', kind: 'rest' }] }, { id: 'w2', weekNumber: 2, entries: [{ id: 'lower', ref: { routineId: 'lower', routineName: 'Lower', source: 'local' }, order: 1 }] }]);
    expect(deriveMesocycleDayGuidance(subject, new Date(2026, 2, 8))).toMatchObject({ state: 'rest' });
    expect(deriveMesocycleDayGuidance(subject, new Date(2026, 2, 10))).toMatchObject({ state: 'unplanned' });
  });
  test('preserves a sparse week-two entry calendar offset in the shared projection', () => {
    const subject = cycle([{ id: 'w1', weekNumber: 1, entries: [{ id: 'routine', ref: { routineId: 'upper', routineName: 'Upper', source: 'local' }, order: 1 }] }, { id: 'w2', weekNumber: 2, entries: [{ id: 'lower', ref: { routineId: 'lower', routineName: 'Lower', source: 'local' }, order: 1 }] }]);

    expect(deriveMesocycleScheduleProjection(subject, [], [], 'en-US')[1]).toMatchObject({
      entryId: 'lower', dayOffset: 7, dateLabel: { weekday: 'Saturday', date: 'March 14' }, scheduleState: 'past',
    });
  });
});
