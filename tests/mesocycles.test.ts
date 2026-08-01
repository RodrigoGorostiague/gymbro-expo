import { describe, expect, test } from 'vitest';
import { projectMesocycleRoutineIds } from '../utils/mesocycles';

describe('mesocycle import projection', () => {
  const mesocycle = { id: 'source', name: 'Source', goal: '', status: 'draft' as const, durationWeeks: 1, createdAt: '', weeks: [{ id: 'week', weekNumber: 1, entries: [{ id: 'session', order: 1, ref: { routineId: 'routine-source', routineName: 'Routine', source: 'shared' as const, shareId: 'share' } }] }] };

  test('rewrites imported routine references as local recipient references', () => {
    const result = projectMesocycleRoutineIds([mesocycle], { 'routine-source': 'import:brisas:routine:routine-source' });
    const ref = (result[0].weeks[0].entries[0] as { ref: { routineId: string; source: string; shareId?: string } }).ref;
    expect(ref).toMatchObject({ routineId: 'import:brisas:routine:routine-source', source: 'local' });
    expect(ref).not.toHaveProperty('shareId');
  });

  test('rejects a missing routine map without changing the source snapshot', () => {
    expect(() => projectMesocycleRoutineIds([mesocycle], {})).toThrow('unknown routine');
    expect(mesocycle.weeks[0].entries[0]).toMatchObject({ ref: { routineId: 'routine-source', source: 'shared', shareId: 'share' } });
  });
});
