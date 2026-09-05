import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Mesocycle, Routine, WorkoutAttempt } from '../types';

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  return { data, getItem: vi.fn(async (key: string) => data.get(key) ?? null), setItem: vi.fn(async (key: string, value: string) => { data.set(key, value); }) };
});
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));

import { loadMesocycles, saveMesocycles } from '../utils/storage';
import {
  activateMesocycle,
  addExtraordinaryPlannedSession,
  cancelMesocycle,
  completeMesocycle,
  completeMesocycleWhenAllSessionsComplete,
  derivePlannedEntryDate,
  eligiblePlannedSessionDestinations,
  extendMesocycle,
  isMesocycleLifecycleOnlyEdit,
  movePlannedSession,
  pauseMesocycle,
  resumeMesocycle,
  scheduleMesocycle,
} from '../utils/mesocycles';

const plan = (durationWeeks = 2): Mesocycle => ({
  id: 'block', name: 'Block', goal: '', status: 'active', durationWeeks, startDate: '2026-08-30', createdAt: '2026-08-01T00:00:00.000Z',
  weeks: Array.from({ length: durationWeeks }, (_, index) => ({ id: `week-${index + 1}`, weekNumber: index + 1, entries: index === 0 ? [
    { id: 'past', ref: { routineId: 'routine', routineName: 'Upper', source: 'local' }, order: 1 },
    { id: 'attempted', ref: { routineId: 'routine', routineName: 'Upper', source: 'local' }, order: 2 },
    { id: 'future', ref: { routineId: 'routine', routineName: 'Upper', source: 'local' }, order: 3 },
    { id: 'rest', kind: 'rest' },
  ] : [] })),
});
const attempt = (plannedSessionId: string): WorkoutAttempt => ({ id: `attempt-${plannedSessionId}`, completedAt: '2026-08-31T12:00:00.000Z', lineage: { mesocycleId: 'block', weekNumber: 1, plannedSessionId } } as WorkoutAttempt);
const routine: Routine = { id: 'extra', name: 'Extra', muscleGroups: ['chest'], exercises: [], createdAt: '2026-08-01T00:00:00.000Z' };
const civil = (date: Date | null) => date && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

describe('mesocycle lifecycle and calendar operations', () => {
  beforeEach(() => { storage.data.clear(); vi.clearAllMocks(); });

  test('normalizes every current state while preserving archived legacy meaning and lifecycle history', async () => {
    const states = ['draft', 'scheduled', 'active', 'completed', 'paused', 'cancelled', 'archived'] as const;
    storage.data.set('@gymbro/mesocycles/v2/owner', JSON.stringify(states.map((status) => ({ ...plan(), id: status, status, pausedAt: status === 'paused' ? '2026-09-01T10:00:00Z' : undefined, pausedOn: status === 'paused' ? '2026-09-01' : undefined, lifecycleHistory: [{ type: 'paused', at: '2026-09-01T10:00:00Z', localDate: '2026-09-01' }] }))));
    const restored = await loadMesocycles('owner');
    expect(restored.map(({ status }) => status)).toEqual(states);
    expect(restored.at(-1)).toMatchObject({ id: 'archived', status: 'archived', lifecycleHistory: [{ type: 'paused' }] });
  });

  test('enforces draft scheduling and activation transitions', () => {
    const draft = { ...plan(), status: 'draft' as const };
    expect(scheduleMesocycle(draft).status).toBe('scheduled');
    expect(activateMesocycle(scheduleMesocycle(draft)).status).toBe('active');
    expect(() => activateMesocycle(plan())).toThrow('draft or scheduled');
  });

  test('resumes across month and week boundaries by local calendar days without shifting attempted sessions', () => {
    const paused = pauseMesocycle(plan(), '2026-08-31T23:30:00');
    const resumed = resumeMesocycle(paused, [attempt('attempted')], '2026-09-02T00:15:00');
    const event = resumed.lifecycleHistory?.at(-1);
    expect(event).toMatchObject({ type: 'resumed', shiftDays: 2, shiftedPlannedSessionIds: ['future'] });
    expect(civil(derivePlannedEntryDate(resumed, 'attempted', 1))).toBe('2026-08-31');
    expect(civil(derivePlannedEntryDate(resumed, 'future', 2))).toBe('2026-09-03');
  });

  test('round-trips pause history and compounds repeated restart-safe pauses', async () => {
    const first = resumeMesocycle(pauseMesocycle(plan(), '2026-08-30T09:00:00'), [], '2026-09-02T09:00:00');
    await saveMesocycles('owner', [pauseMesocycle(first, '2026-09-03T18:00:00')]);
    const [restored] = await loadMesocycles('owner');
    const second = resumeMesocycle(restored, [], '2026-09-05T08:00:00');
    expect(second.scheduleShiftDays).toBe(5);
    expect(civil(derivePlannedEntryDate(second, 'future', 2))).toBe('2026-09-06');
    expect(second.lifecycleHistory?.filter(({ type }) => type === 'resumed')).toHaveLength(2);
  });

  test('applies each completed pause once and does not move a historical rest day', () => {
    const historicalRest = { ...plan(), weeks: [{ ...plan().weeks[0], entries: [{ id: 'old-rest', kind: 'rest' }, ...plan().weeks[0].entries.slice(1)] }, plan().weeks[1]] } as Mesocycle;
    const resumed = resumeMesocycle(pauseMesocycle(historicalRest, '2026-08-31T09:00:00'), [], '2026-09-02T09:00:00');

    expect(civil(derivePlannedEntryDate(resumed, 'old-rest', 0))).toBe('2026-08-30');
    expect(civil(derivePlannedEntryDate(resumed, 'future', 2))).toBe('2026-09-03');
  });

  test('blocks manual completion while a pause-shifted pending session is still future', () => {
    const resumed = resumeMesocycle(pauseMesocycle(plan(), '2026-08-31T09:00:00'), [attempt('past')], '2026-09-02T09:00:00');
    expect(() => completeMesocycle(resumed, [attempt('past')], '2026-09-02T12:00:00', new Date('2026-09-02T12:00:00'))).toThrow('fechas futuras');
  });

  test('inherits completed pause shifts for sessions added after resuming', async () => {
    const resumed = resumeMesocycle(pauseMesocycle(plan(), '2026-08-30T09:00:00'), [], '2026-09-02T09:00:00');
    expect(eligiblePlannedSessionDestinations(resumed, new Date('2026-09-03T12:00:00'))).toContainEqual({ weekNumber: 1, entryId: 'rest' });
    const updated = addExtraordinaryPlannedSession(resumed, routine, { weekNumber: 1, entryId: 'rest' }, 'extraordinary');
    await saveMesocycles('owner', [updated]);
    const [restored] = await loadMesocycles('owner');

    expect(restored.weeks[0].entries[3]).toMatchObject({ id: 'extraordinary', scheduleShiftDays: 3 });
    expect(civil(derivePlannedEntryDate(restored, 'extraordinary', 3))).toBe('2026-09-05');
  });

  test('uses zero shift for a same-local-day pause', () => {
    const resumed = resumeMesocycle(pauseMesocycle(plan(), '2026-09-01T01:00:00'), [], '2026-09-01T23:00:00');
    expect(resumed.lifecycleHistory?.at(-1)).toMatchObject({ type: 'resumed', shiftDays: 0 });
  });

  test('extends only with new empty future weeks and enforces the 52-week bound', () => {
    let sequence = 0;
    const extended = extendMesocycle(plan(2), 2, () => `new-${++sequence}`);
    expect(extended.durationWeeks).toBe(4);
    expect(extended.weeks.slice(0, 2)).toEqual(plan(2).weeks);
    expect(extended.weeks.slice(2)).toEqual([{ id: 'new-1', weekNumber: 3, entries: [] }, { id: 'new-2', weekNumber: 4, entries: [] }]);
    expect(() => extendMesocycle(plan(52), 1)).toThrow('52 weeks');
  });

  test('cancels only future non-attempted sessions and preserves historical attempts', () => {
    const cancelled = cancelMesocycle(plan(), [attempt('attempted')], '2026-08-31T12:00:00');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.weeks[0].entries[0]).not.toHaveProperty('planningState');
    expect(cancelled.weeks[0].entries[1]).not.toHaveProperty('planningState');
    expect(cancelled.weeks[0].entries[2]).toMatchObject({ planningState: 'cancelled', planningTransition: { reason: 'Mesocycle cancelled' } });
    expect(cancelled.lifecycleHistory?.at(-1)).toMatchObject({ type: 'cancelled' });
  });

  test('never auto-completes or grants completion semantics after cancellation', () => {
    const cancelled = cancelMesocycle(plan(), [], '2026-08-31T12:00:00');
    const result = completeMesocycleWhenAllSessionsComplete(cancelled, [attempt('past'), attempt('attempted'), attempt('future')]);

    expect(result).toBe(cancelled);
    expect(result.lifecycleHistory?.some(({ type }) => type === 'completed')).toBe(false);
  });

  test('keeps lifecycle-only mutations on the attempted plan while versioning prescription edits', () => {
    const paused = pauseMesocycle(plan(), '2026-09-01T12:00:00');
    expect(isMesocycleLifecycleOnlyEdit(plan(), paused)).toBe(true);
    expect(isMesocycleLifecycleOnlyEdit(plan(), cancelMesocycle(plan(), [], '2026-08-31T12:00:00'))).toBe(true);
    expect(isMesocycleLifecycleOnlyEdit(plan(), extendMesocycle(plan(), 1))).toBe(false);
  });

  test('adds an independent extraordinary snapshot without recovery links', () => {
    const result = addExtraordinaryPlannedSession(plan(), routine, { weekNumber: 1, entryId: 'rest' }, 'extraordinary');
    const entry = result.weeks[0].entries[3];
    expect(entry).toMatchObject({ id: 'extraordinary', isExtraordinary: true, planningState: 'pending', routineSnapshot: { id: 'extra' } });
    expect(entry).not.toHaveProperty('recoveryForPlannedSessionId');
    expect(entry).not.toHaveProperty('recoveredByPlannedSessionId');
  });

  test('moves a future pending session across weeks while rejecting attempted and terminal sessions', () => {
    const moved = movePlannedSession(plan(), { weekNumber: 1, entryId: 'future' }, { weekNumber: 2 }, [], new Date('2026-08-30T12:00:00'));
    expect(moved.weeks[0].entries.some(({ id }) => id === 'future')).toBe(false);
    expect(moved.weeks[1].entries[0]).toMatchObject({ id: 'future', order: 1 });
    expect(() => movePlannedSession(plan(), { weekNumber: 1, entryId: 'attempted' }, { weekNumber: 2 }, [attempt('attempted')], new Date('2026-08-30T12:00:00'))).toThrow('non-attempted pending');
    const terminal = { ...plan(), weeks: [{ ...plan().weeks[0], entries: plan().weeks[0].entries.map((entry) => entry.id === 'future' && 'ref' in entry ? { ...entry, planningState: 'cancelled' as const } : entry) }, plan().weeks[1]] };
    expect(() => movePlannedSession(terminal, { weekNumber: 1, entryId: 'future' }, { weekNumber: 2 }, [], new Date('2026-08-30T12:00:00'))).toThrow('non-attempted pending');
  });
});
