import { describe, expect, test } from 'vitest';
import { validateMesocycleExecutionLineage } from '../utils/mesocycleExecutionLineage';

const lineage = { mesocycleId: 'mesocycle-1', weekNumber: 1, plannedSessionId: 'session-1' };
const activeMesocycle = {
  id: lineage.mesocycleId,
  name: 'Block',
  goal: '',
  status: 'active' as const,
  durationWeeks: 1,
  createdAt: '',
  weeks: [{ id: 'week-1', weekNumber: 1, entries: [{ id: lineage.plannedSessionId, order: 1, ref: { routineId: 'routine-1', routineName: 'Upper', source: 'local' as const } }] }],
};

describe('mesocycle execution lineage', () => {
  test('allows standalone routine execution without lineage', () => {
    expect(validateMesocycleExecutionLineage([activeMesocycle], 'routine-1', undefined)).toEqual({ valid: true });
  });

  test('allows only an active mesocycle routine entry matching the route routine', () => {
    expect(validateMesocycleExecutionLineage([activeMesocycle], 'routine-1', lineage)).toEqual({ valid: true, lineage });
    expect(validateMesocycleExecutionLineage([activeMesocycle], 'other-routine', lineage)).toMatchObject({ valid: false, reason: 'missing-planned-session' });
  });

  test('rejects a past session unless it is resuming an active workout', () => {
    const dated = { ...activeMesocycle, startDate: '2026-01-01' };
    const today = new Date('2026-01-02T12:00:00');

    expect(validateMesocycleExecutionLineage([dated], 'routine-1', lineage, undefined, false, today)).toEqual({
      valid: false,
      mesocycleId: lineage.mesocycleId,
      reason: 'expired-planned-session',
    });
    expect(validateMesocycleExecutionLineage([dated], 'routine-1', lineage, undefined, true, today)).toEqual({ valid: true, lineage });
  });

  test.each(['draft', 'completed', 'archived'] as const)('rejects a %s mesocycle', (status) => {
    expect(validateMesocycleExecutionLineage([{ ...activeMesocycle, status }], 'routine-1', lineage)).toEqual({ valid: false, mesocycleId: lineage.mesocycleId, reason: 'inactive-mesocycle' });
  });

  test('rejects malformed, missing, and rest-session lineage', () => {
    expect(validateMesocycleExecutionLineage([activeMesocycle], 'routine-1', null, lineage.mesocycleId)).toEqual({ valid: false, mesocycleId: lineage.mesocycleId, reason: 'malformed' });
    expect(validateMesocycleExecutionLineage([], 'routine-1', lineage)).toEqual({ valid: false, mesocycleId: lineage.mesocycleId, reason: 'missing-mesocycle' });
    const withRest = { ...activeMesocycle, weeks: [{ ...activeMesocycle.weeks[0], entries: [{ id: lineage.plannedSessionId, kind: 'rest' as const }] }] };
    expect(validateMesocycleExecutionLineage([withRest], 'routine-1', lineage)).toEqual({ valid: false, mesocycleId: lineage.mesocycleId, reason: 'missing-planned-session' });
  });
});
