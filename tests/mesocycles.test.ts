import { describe, expect, test } from 'vitest';
import { completeMesocycleWhenAllSessionsComplete, mesocycleCompletionBlockReason, projectMesocycleRoutineIds } from '../utils/mesocycles';

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

describe('mesocycle completion', () => {
  const mesocycle = {
    id: 'block', name: 'Block', goal: '', status: 'active' as const, durationWeeks: 1, createdAt: '', weeks: [{
      id: 'week', weekNumber: 1, entries: [
        { id: 'first', order: 1, ref: { routineId: 'upper', routineName: 'Upper', source: 'local' as const } },
        { id: 'last', order: 2, ref: { routineId: 'lower', routineName: 'Lower', source: 'local' as const } },
      ],
    }],
  };
  const attempt = (plannedSessionId: string, adherence: number) => ({
    id: plannedSessionId, owner: 'member', routineId: plannedSessionId, recordedRoutineName: plannedSessionId, completedAt: '', durationSeconds: 0, restTimerSeconds: 0, version: 1 as const,
    lineage: { mesocycleId: mesocycle.id, weekNumber: 1, plannedSessionId }, exercises: [],
    completion: { validSets: 0, plannedSets: 0, adherence, displayPercent: adherence * 100, status: adherence === 1 ? 'fully-completed' as const : 'completed' as const },
    reward: { setGems: 0, completionGems: 0, fullCompletionBonus: 0, totalGems: 0, qualifiesForCompletion: adherence >= .7 }, rewardApplication: { id: plannedSessionId, state: 'pending' as const },
  });

  test('closes only after every planned session reaches the reward-eligible threshold', () => {
    expect(completeMesocycleWhenAllSessionsComplete(mesocycle, [attempt('first', .7)])).toBe(mesocycle);
    expect(completeMesocycleWhenAllSessionsComplete(mesocycle, [attempt('first', .7), attempt('last', .7)])).toMatchObject({ status: 'completed' });
  });

  test('blocks manual completion until one session is finalized and no dated routine is future', () => {
    const dated = { ...mesocycle, startDate: '2026-08-20' };
    expect(mesocycleCompletionBlockReason(dated, [], new Date('2026-08-16T12:00:00'))).toContain('al menos un entrenamiento');
    expect(mesocycleCompletionBlockReason(dated, [attempt('first', .7)], new Date('2026-08-16T12:00:00'))).toContain('fechas futuras');
    expect(mesocycleCompletionBlockReason({ ...mesocycle, startDate: '2026-08-01' }, [attempt('first', .7)], new Date('2026-08-16T12:00:00'))).toBeNull();
  });
});
