import React from 'react';
import { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { changeText, findButton, findText, mockAlert, mockRouter, press, render, resetRuntimeHarness, setMockData, setMockParams } from './helpers/runtimeHarness';
import RoutinesScreen from '../app/(tabs)/routines';
import EditRoutineScreen from '../app/routine/[id]';
import MesocycleSummaryScreen from '../app/mesocycle/summary/[id]';
import ExecuteRoutineScreen from '../app/routine/execute/[id]';
import { matchesActiveWorkout } from '../utils/activeWorkoutReentry';
import { __emitAppState } from './helpers/reactNativeStub';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: 'rodaja', welcomeMessage: null, setWelcomeMessage: vi.fn() }) }));
vi.mock('../context/ShareContext', () => ({ useShare: () => ({ pendingShares: [], hasPendingShare: () => false }) }));
vi.mock('../context/ShopContext', () => ({ useShop: () => ({ retryPendingRewards: vi.fn() }) }));
vi.mock('../components/LogoutButton', () => ({ LogoutButton: () => null }));
vi.mock('../components/ShareRoutineModal', () => ({ ShareRoutineModal: () => null }));

const routineA = { id: 'routine-a', name: 'Upper', muscleGroups: ['pecho'], exercises: [], createdAt: '' };
const routineB = { ...routineA, id: 'routine-b', name: 'Lower' };
const draft = { version: 1 as const, owner: 'rodaja' as const, attemptId: 'attempt-a', routineId: routineA.id, startedAtMs: 1, restTimerSeconds: 0, completedSets: {}, setValues: {} };
const lineage = { mesocycleId: 'm1', weekNumber: 1, plannedSessionId: 's1' };
const mesocycle = { id: lineage.mesocycleId, name: 'Block', goal: '', status: 'active' as const, durationWeeks: 1, createdAt: '', weeks: [{ id: 'week-1', weekNumber: lineage.weekNumber, entries: [{ id: lineage.plannedSessionId, ref: { routineId: routineA.id, routineName: routineA.name, source: 'local' as const }, order: 1 }] }] };

beforeEach(() => { vi.clearAllMocks(); resetRuntimeHarness(); });
afterEach(() => { vi.useRealTimers(); });

describe('active workout re-entry', () => {
  test.each([
    ['matches the owner and routine', draft, { owner: 'rodaja' as const, routineId: routineA.id }, true],
    ['rejects another owner', draft, { owner: 'brisas' as const, routineId: routineA.id }, false],
    ['rejects another routine', draft, { owner: 'rodaja' as const, routineId: routineB.id }, false],
    ['rejects a planned target without draft lineage', draft, { owner: 'rodaja' as const, routineId: routineA.id, lineage: { mesocycleId: 'm1', weekNumber: 1, plannedSessionId: 's1' } }, false],
    ['rejects a different mesocycle', { ...draft, lineage }, { owner: 'rodaja' as const, routineId: routineA.id, lineage: { ...lineage, mesocycleId: 'm2' } }, false],
    ['rejects a different week', { ...draft, lineage }, { owner: 'rodaja' as const, routineId: routineA.id, lineage: { ...lineage, weekNumber: 2 } }, false],
    ['rejects a different planned session', { ...draft, lineage }, { owner: 'rodaja' as const, routineId: routineA.id, lineage: { ...lineage, plannedSessionId: 's2' } }, false],
  ])('%s', (_name, activeDraft, target, expected) => {
    expect(matchesActiveWorkout(activeDraft, target)).toBe(expected);
  });

  test('offers Continue only for the matching routine from Training and detail', () => {
    setMockData({ routines: [routineA, routineB], deleteRoutine: vi.fn(), activeWorkoutDraft: draft });
    const training = render(React.createElement(RoutinesScreen));
    press(training.root.find((node) => node.props.accessibilityLabel === 'Continuar Upper'));
    expect(mockRouter.push).toHaveBeenCalledWith('/routine/execute/routine-a');
    expect(training.root.findAll((node) => node.props.accessibilityLabel === 'Continuar Lower')).toHaveLength(0);
    press(training.root.find((node) => node.props.accessibilityLabel === 'Entrenar Lower'));
    expect(mockRouter.push).toHaveBeenCalledWith('/routine/execute/routine-b');

    resetRuntimeHarness();
    setMockParams({ id: routineA.id });
    setMockData({ exercises: [], getExercise: vi.fn(), getRoutine: vi.fn(() => routineA), updateRoutine: vi.fn(), activeWorkoutDraft: draft });
    const detail = render(React.createElement(EditRoutineScreen));
    press(detail.root.find((node) => node.props.accessibilityLabel === 'Continuar Upper'));
    expect(mockRouter.push).toHaveBeenCalledWith('/routine/execute/routine-a');
  });

  test('continues only an exactly matching planned mesocycle session', () => {
    setMockParams({ id: mesocycle.id });
    setMockData({ attempts: [], getMesocycle: vi.fn(() => mesocycle), routines: [routineA], resolvePlannedRoutine: vi.fn(() => routineA), activeWorkoutDraft: { ...draft, lineage } });
    const matching = render(React.createElement(MesocycleSummaryScreen));
    press(matching.root.find((node) => node.props.accessibilityLabel === 'Continuar Upper'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/routine/execute/[id]', params: { id: routineA.id, mesocycleId: lineage.mesocycleId, weekNumber: '1', plannedSessionId: lineage.plannedSessionId } });

    resetRuntimeHarness();
    setMockParams({ id: mesocycle.id });
    setMockData({ attempts: [], getMesocycle: vi.fn(() => mesocycle), routines: [routineA], resolvePlannedRoutine: vi.fn(() => routineA), activeWorkoutDraft: { ...draft, lineage: { ...lineage, plannedSessionId: 'other' } } });
    const mismatch = render(React.createElement(MesocycleSummaryScreen));
    expect(mismatch.root.findAll((node) => node.props.accessibilityLabel === 'Continuar Upper')).toHaveLength(0);
    press(mismatch.root.find((node) => node.props.accessibilityLabel === 'Ejecutar Upper'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/routine/execute/[id]', params: { id: routineA.id, mesocycleId: lineage.mesocycleId, weekNumber: '1', plannedSessionId: lineage.plannedSessionId } });
  });

  test('keeps setup visible when the execute route lineage does not match the draft', () => {
    setMockParams({ id: routineA.id, mesocycleId: lineage.mesocycleId, weekNumber: '1', plannedSessionId: lineage.plannedSessionId });
    setMockData({ getRoutine: vi.fn(() => routineA), activeWorkoutDraft: { ...draft, lineage: { ...lineage, plannedSessionId: 'other' } }, addAttempt: vi.fn(), startActiveWorkout: vi.fn(), updateActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn() });
    const screen = render(React.createElement(ExecuteRoutineScreen));
    expect(findButton(screen.root, 'Iniciar entrenamiento')).toBeTruthy();
  });

  test('keeps the mounted rest countdown moving while persistence is still pending', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T20:00:00.000Z'));
    const routineWithSet = {
      ...routineA,
      exercises: [{
        id: 'exercise-1',
        name: 'Press',
        loadMode: 'external' as const,
        loadUnit: 'kg' as const,
        sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }],
      }],
    };
    const updateActiveWorkout = vi.fn(() => new Promise<void>(() => undefined));
    setMockParams({ id: routineWithSet.id });
    setMockData({
      getRoutine: vi.fn(() => routineWithSet),
      activeWorkoutDraft: { ...draft, routineId: routineWithSet.id, restTimerSeconds: 3 },
      addAttempt: vi.fn(),
      startActiveWorkout: vi.fn(),
      updateActiveWorkout,
      cancelActiveWorkout: vi.fn(),
      refreshActiveWorkoutTiming: vi.fn(),
    });

    const screen = render(React.createElement(ExecuteRoutineScreen));
    const inputs = screen.root.findAll((node) => (node.type as any) === 'GlassInput');
    changeText(inputs[0], '10');
    changeText(inputs[1], '8');
    press(screen.root.find((node) => (node.type as any) === 'HapticPressable'));
    expect(findText(screen.root, '00:03')).toBeTruthy();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    mockAlert.alert.mockClear();
    act(() => { vi.advanceTimersByTime(1_000); });
    act(() => { __emitAppState('active'); });
    expect(findText(screen.root, '00:02')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(2_000); });
    act(() => { __emitAppState('active'); });
    expect(mockAlert.alert).toHaveBeenCalledTimes(1);
    expect(mockAlert.alert).toHaveBeenCalledWith(
      'Descanso terminado',
      'Continúa con la próxima serie.',
      [{ text: 'Entendido' }],
    );
  });

});
