import { expect, test } from 'vitest';
import { actualEffortMetrics, actualEffortSummary } from '../utils/actualEffort';
test('feed summary separates scales and includes zero, counts only completed recorded sets', () => {
 const metrics = actualEffortMetrics([{ sets: [{ completed: true, actualEffort: { kind: 'rir', value: 0 } }, { completed: true, actualEffort: { kind: 'rir', value: 3 } }, { completed: true, actualEffort: { kind: 'rpe', value: 9 } }, { completed: false, actualEffort: { kind: 'rpe', value: 6 } }, { completed: true }] }]);
 expect(actualEffortSummary(metrics)).toEqual([{ kind: 'rir', min: 0, max: 3, count: 2 }, { kind: 'rpe', min: 9, max: 9, count: 1 }]);
});
test('legacy/missing and invalid summaries are not invented', () => {
 expect(actualEffortMetrics([{ sets: [{ completed: true }] }])).toEqual({});
 expect(actualEffortSummary({})).toEqual([]);
 expect(actualEffortSummary({ actualRirMin: 0, actualRirMax: 7, actualRirCount: 2 })).toEqual([]);
});
