import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Mesocycle } from '../types';

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: vi.fn(async (key: string) => data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { data.set(key, value); }),
  };
});

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));

import { loadMesocycles } from '../utils/storage';
import { clonePlannedWeekEntries, deriveMesocycleAdherence, deriveMesocycleScheduleProjection, transitionPlannedSession } from '../utils/mesocycles';
import { validateMesocycleExecutionLineage } from '../utils/mesocycleExecutionLineage';

const plan = (): Mesocycle => ({
  id: 'mesocycle-1', name: 'Block', goal: '', status: 'active', durationWeeks: 1, startDate: '2026-08-16', createdAt: '',
  weeks: [{
    id: 'week-1', weekNumber: 1,
    entries: [
      { id: 'pending', ref: { routineId: 'routine-1', routineName: 'Upper', source: 'local' }, order: 1 },
      { id: 'in-progress', ref: { routineId: 'routine-1', routineName: 'Upper', source: 'local' }, order: 2, planningState: 'in_progress' },
      { id: 'skipped', ref: { routineId: 'routine-1', routineName: 'Upper', source: 'local' }, order: 3, planningState: 'skipped' },
      { id: 'rescheduled', ref: { routineId: 'routine-1', routineName: 'Upper', source: 'local' }, order: 4, planningState: 'rescheduled', recoveredByPlannedSessionId: 'recovery', planningTransition: { from: 'pending', to: 'rescheduled', at: '2026-08-16T10:00:00.000Z' } },
      { id: 'cancelled', ref: { routineId: 'routine-1', routineName: 'Upper', source: 'local' }, order: 5, planningState: 'cancelled' },
      { id: 'recovery', ref: { routineId: 'routine-1', routineName: 'Upper', source: 'local' }, order: 6, recoveryForPlannedSessionId: 'rescheduled', isExtraordinary: true },
    ],
  }],
});

describe('planned session lifecycle', () => {
  beforeEach(() => { storage.data.clear(); vi.clearAllMocks(); });

  test('normalizes legacy sessions to pending and retains valid lifecycle metadata', async () => {
    storage.data.set('@gymbro/mesocycles/v2/owner', JSON.stringify([plan(), {
      ...plan(), id: 'legacy', weeks: [{ ...plan().weeks[0], entries: [{ id: 'legacy-session', ref: { routineId: 'routine-1', routineName: 'Upper', source: 'local' }, order: 1, planningState: 'unknown' }] }],
    }]));

    const [normalized, legacy] = await loadMesocycles('owner');
    expect(normalized.weeks[0].entries[3]).toMatchObject({ planningState: 'rescheduled', recoveredByPlannedSessionId: 'recovery', planningTransition: { to: 'rescheduled' } });
    expect(normalized.weeks[0].entries[5]).toMatchObject({ planningState: 'pending', recoveryForPlannedSessionId: 'rescheduled', isExtraordinary: true });
    expect(legacy.weeks[0].entries[0]).toMatchObject({ planningState: 'pending' });
  });

  test('projects terminal slots without counting them toward planned adherence', () => {
    const mesocycle = plan();
    const adherence = deriveMesocycleAdherence(mesocycle);
    const schedule = deriveMesocycleScheduleProjection(mesocycle, [], [], 'en-US', new Date('2026-08-16T12:00:00'));

    expect(adherence).toMatchObject({ plannedSessions: 3, completedSessions: 0 });
    expect(adherence.weeks[0].sessionStates.map(({ status }) => status)).toEqual(['not-started', 'not-started', 'skipped', 'rescheduled', 'cancelled', 'not-started']);
    expect(schedule[3]).toMatchObject({ planningState: 'rescheduled', recoveredByPlannedSessionId: 'recovery', planningTransition: { to: 'rescheduled' } });
    expect(schedule[5]).toMatchObject({ planningState: 'pending', recoveryForPlannedSessionId: 'rescheduled', isExtraordinary: true });
  });

  test('rejects skipped, rescheduled, and cancelled sessions while allowing pending and in-progress sessions', () => {
    const mesocycle = plan();
    for (const plannedSessionId of ['pending', 'in-progress', 'recovery']) {
      expect(validateMesocycleExecutionLineage([mesocycle], 'routine-1', { mesocycleId: mesocycle.id, weekNumber: 1, plannedSessionId })).toEqual({ valid: true, lineage: { mesocycleId: mesocycle.id, weekNumber: 1, plannedSessionId } });
    }
    for (const plannedSessionId of ['skipped', 'rescheduled', 'cancelled']) {
      expect(validateMesocycleExecutionLineage([mesocycle], 'routine-1', { mesocycleId: mesocycle.id, weekNumber: 1, plannedSessionId })).toEqual({ valid: false, mesocycleId: mesocycle.id, reason: 'non-executable-planned-session' });
    }
  });

  test('records a transition and resets lifecycle links when cloning a future week', () => {
    const entry = plan().weeks[0].entries[0];
    if ('kind' in entry) throw new Error('Expected routine entry');
    const transitioned = transitionPlannedSession(entry, 'skipped', '2026-08-16T10:00:00.000Z', 'Sick');
    const [clone] = clonePlannedWeekEntries([{ ...transitioned, recoveryForPlannedSessionId: 'older', recoveredByPlannedSessionId: 'newer' }]);

    expect(transitioned.planningTransition).toEqual({ from: 'pending', to: 'skipped', at: '2026-08-16T10:00:00.000Z', reason: 'Sick' });
    expect(clone).toMatchObject({ planningState: 'pending' });
    expect(clone).not.toHaveProperty('planningTransition');
    expect(clone).not.toHaveProperty('recoveryForPlannedSessionId');
    expect(clone).not.toHaveProperty('recoveredByPlannedSessionId');
  });
});
