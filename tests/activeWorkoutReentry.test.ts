import React from 'react';
import { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { changeText, findButton, findText, mockAlert, mockRouter, press, render, resetRuntimeHarness, setMockData, setMockParams } from './helpers/runtimeHarness';
import RoutinesScreen from '../app/(tabs)/routines';
import EditRoutineScreen from '../app/routine/[id]';
import MesocycleSummaryScreen from '../app/mesocycle/summary/[id]';
import ExecuteRoutineScreen from '../app/routine/execute/[id]';
import { hasActiveWorkoutReentryIntegrity, matchesActiveWorkout } from '../utils/activeWorkoutReentry';
import { __emitAppState, __emitHardwareBackPress } from './helpers/reactNativeStub';

const finishJointWorkout = vi.hoisted(() => vi.fn());
const leaveJointWorkout = vi.hoisted(() => vi.fn());
const prepareJointWorkoutPublication = vi.hoisted(() => vi.fn(async () => undefined));
const queueJointWorkoutPublication = vi.hoisted(() => vi.fn(async () => undefined));
const removePendingJointWorkoutPublication = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: 'rodaja', welcomeMessage: null, setWelcomeMessage: vi.fn() }) }));
vi.mock('../context/ShopContext', () => ({ useShop: () => ({ retryPendingRewards: vi.fn() }) }));
vi.mock('../components/LogoutButton', () => ({ LogoutButton: () => null }));
vi.mock('../services/jointWorkouts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/jointWorkouts')>(),
  finishJointWorkout,
  leaveJointWorkout,
}));
vi.mock('../services/jointWorkoutPublicationQueue', () => ({ prepareJointWorkoutPublication, queueJointWorkoutPublication, removePendingJointWorkoutPublication }));

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

  test.each([
    ['accepts a standalone draft with an existing routine', draft, [routineA], [], true],
    ['rejects a draft whose routine was deleted', draft, [], [], false],
    ['accepts an exactly matching planned session', { ...draft, lineage }, [routineA], [mesocycle], true],
    ['rejects missing lineage entries', { ...draft, lineage }, [routineA], [{ ...mesocycle, weeks: [] }], false],
    ['rejects lineage pointing at another routine', { ...draft, lineage }, [routineA], [{ ...mesocycle, weeks: [{ ...mesocycle.weeks[0], entries: [{ ...mesocycle.weeks[0].entries[0], ref: { ...mesocycle.weeks[0].entries[0].ref, routineId: routineB.id } }] }] }], false],
  ])('%s', (_name, activeDraft, routines, mesocycles, expected) => {
    expect(hasActiveWorkoutReentryIntegrity(activeDraft, routines, mesocycles)).toBe(expected);
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
    setMockData({ getRoutine: vi.fn(() => routineA), mesocycles: [mesocycle], activeWorkoutDraft: { ...draft, lineage: { ...lineage, plannedSessionId: 'other' } }, addAttempt: vi.fn(), startActiveWorkout: vi.fn(), updateActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn() });
    const screen = render(React.createElement(ExecuteRoutineScreen));
    expect(findButton(screen.root, 'Continuar entrenamiento en curso')).toBeTruthy();
  });

  test('clears the matching draft and presents a safe training fallback when the routine is unavailable', async () => {
    const clearActiveWorkoutIfMatches = vi.fn(async () => undefined);
    setMockParams({ id: routineA.id });
    setMockData({ getRoutine: vi.fn(() => undefined), mesocycles: [], activeWorkoutDraft: draft, clearActiveWorkoutIfMatches, addAttempt: vi.fn(), startActiveWorkout: vi.fn(), updateActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn() });

    const screen = render(React.createElement(ExecuteRoutineScreen));
    expect(findText(screen.root, 'Entrenamiento no disponible')).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(clearActiveWorkoutIfMatches).toHaveBeenCalledWith({ owner: 'rodaja', routineId: routineA.id }));
    press(findButton(screen.root, 'Volver a entrenar'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/train');
  });

  test('does not start a second draft when another workout is active and offers its continuation', () => {
    const startActiveWorkout = vi.fn();
    setMockParams({ id: routineB.id });
    setMockData({ getRoutine: vi.fn(() => routineB), mesocycles: [], activeWorkoutDraft: draft, addAttempt: vi.fn(), startActiveWorkout, updateActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn() });

    const screen = render(React.createElement(ExecuteRoutineScreen));
    press(findButton(screen.root, 'Continuar entrenamiento en curso'));

    expect(startActiveWorkout).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/routine/execute/[id]', params: { id: routineA.id } });
  });

  test('catches a rejected start and ignores a second tap while the first start is pending', async () => {
    let rejectStart!: (error: Error) => void;
    const startActiveWorkout = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectStart = reject; }));
    setMockParams({ id: routineA.id });
    setMockData({ getRoutine: vi.fn(() => routineA), mesocycles: [], activeWorkoutDraft: null, addAttempt: vi.fn(), startActiveWorkout, updateActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn() });

    const screen = render(React.createElement(ExecuteRoutineScreen));
    const start = findButton(screen.root, 'Iniciar entrenamiento');
    press(start);
    press(start);
    expect(startActiveWorkout).toHaveBeenCalledTimes(1);

    rejectStart(new Error('Ya hay un entrenamiento activo para este perfil.'));
    await vi.waitFor(() => expect(mockAlert.alert).toHaveBeenCalledWith('No se pudo iniciar el entrenamiento', 'Ya hay un entrenamiento activo para este perfil.'));
  });

  test('restores the joint session from the active workout draft when the route is reopened', () => {
    setMockParams({ id: routineA.id });
    setMockData({ getRoutine: vi.fn(() => routineA), mesocycles: [], activeWorkoutDraft: { ...draft, jointWorkoutId: 'joint-1' }, addAttempt: vi.fn(), startActiveWorkout: vi.fn(), updateActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn() });
    const screen = render(React.createElement(ExecuteRoutineScreen));
    expect(screen.root.find((node) => node.props.accessibilityLabel === 'Mostrar entrenamiento conjunto')).toBeTruthy();
  });

  test('joins the shared workout when an active draft is updated from a notification', () => {
    setMockParams({ id: routineA.id });
    setMockData({ getRoutine: vi.fn(() => routineA), mesocycles: [], activeWorkoutDraft: draft, addAttempt: vi.fn(), startActiveWorkout: vi.fn(), updateActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn() });
    const screen = render(React.createElement(ExecuteRoutineScreen));

    setMockData({ getRoutine: vi.fn(() => routineA), mesocycles: [], activeWorkoutDraft: { ...draft, jointWorkoutId: 'joint-1' }, addAttempt: vi.fn(), startActiveWorkout: vi.fn(), updateActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn() });
    act(() => { screen.update(React.createElement(ExecuteRoutineScreen)); });

    expect(mockRouter.setParams).toHaveBeenCalledWith({ jointWorkoutId: 'joint-1' });
  });

  test('leaves the server joint session before cancelling the local draft', async () => {
    const cancelActiveWorkout = vi.fn(async () => undefined);
    const updateActiveWorkout = vi.fn(async () => undefined);
    leaveJointWorkout.mockResolvedValue(undefined);
    setMockParams({ id: routineA.id, jointWorkoutId: 'joint-1' });
    setMockData({ getRoutine: vi.fn(() => routineA), mesocycles: [], activeWorkoutDraft: { ...draft, jointWorkoutId: 'joint-1' }, addAttempt: vi.fn(), startActiveWorkout: vi.fn(), updateActiveWorkout, cancelActiveWorkout });
    const screen = render(React.createElement(ExecuteRoutineScreen));

    press(screen.root.find((node) => node.props.accessibilityLabel === 'Pausar entrenamiento'));
    await vi.waitFor(() => expect(findText(screen.root, 'Entrenamiento pausado')).toBeTruthy());
    await act(async () => { screen.root.find((node) => node.props.accessibilityLabel === 'Cancelar entrenamiento').props.onPress(); await Promise.resolve(); });

    await vi.waitFor(() => expect(cancelActiveWorkout).toHaveBeenCalledTimes(1));
    expect(updateActiveWorkout).toHaveBeenCalledWith(expect.objectContaining({ jointCancellationPending: true }));
    expect(leaveJointWorkout).toHaveBeenCalledWith('joint-1');
    expect(updateActiveWorkout.mock.invocationCallOrder[0]).toBeLessThan(leaveJointWorkout.mock.invocationCallOrder[0]);
    expect(leaveJointWorkout.mock.invocationCallOrder[0]).toBeLessThan(cancelActiveWorkout.mock.invocationCallOrder[0]);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  test('preserves the local draft when server joint cancellation fails', async () => {
    const cancelActiveWorkout = vi.fn(async () => undefined);
    const updateActiveWorkout = vi.fn(async () => undefined);
    leaveJointWorkout.mockRejectedValue(new Error('Joint service unavailable'));
    setMockParams({ id: routineA.id, jointWorkoutId: 'joint-1' });
    setMockData({ getRoutine: vi.fn(() => routineA), mesocycles: [], activeWorkoutDraft: { ...draft, jointWorkoutId: 'joint-1' }, addAttempt: vi.fn(), startActiveWorkout: vi.fn(), updateActiveWorkout, cancelActiveWorkout });
    const screen = render(React.createElement(ExecuteRoutineScreen));

    press(screen.root.find((node) => node.props.accessibilityLabel === 'Pausar entrenamiento'));
    await vi.waitFor(() => expect(findText(screen.root, 'Entrenamiento pausado')).toBeTruthy());
    await act(async () => { screen.root.find((node) => node.props.accessibilityLabel === 'Cancelar entrenamiento').props.onPress(); await Promise.resolve(); });

    await vi.waitFor(() => expect(mockAlert.alert).toHaveBeenCalledWith('No se pudo cancelar el entrenamiento', 'Joint service unavailable'));
    expect(cancelActiveWorkout).not.toHaveBeenCalled();
    expect(updateActiveWorkout).toHaveBeenCalledWith(expect.objectContaining({ jointCancellationPending: true }));
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(findButton(screen.root, 'Reanudar').props.disabled).toBe(true);
    expect(findButton(screen.root, 'Finalizar entrenamiento').props.disabled).toBe(true);
    expect(screen.root.find((node) => node.props.accessibilityLabel === 'Cancelar entrenamiento').props.disabled).toBe(false);
  });

  test('restores the durable cancellation lock after remount and retries leave before clearing the draft', async () => {
    let persistedDraft = { ...draft, jointWorkoutId: 'joint-1' };
    const updateActiveWorkout = vi.fn(async (next) => { persistedDraft = next; });
    const firstCancelActiveWorkout = vi.fn(async () => undefined);
    leaveJointWorkout.mockRejectedValueOnce(new Error('Response lost after commit'));
    setMockParams({ id: routineA.id, jointWorkoutId: 'joint-1' });
    setMockData({ getRoutine: vi.fn(() => routineA), mesocycles: [], activeWorkoutDraft: persistedDraft, addAttempt: vi.fn(), startActiveWorkout: vi.fn(), updateActiveWorkout, cancelActiveWorkout: firstCancelActiveWorkout });
    const firstMount = render(React.createElement(ExecuteRoutineScreen));

    press(firstMount.root.find((node) => node.props.accessibilityLabel === 'Pausar entrenamiento'));
    await vi.waitFor(() => expect(findText(firstMount.root, 'Entrenamiento pausado')).toBeTruthy());
    press(firstMount.root.find((node) => node.props.accessibilityLabel === 'Cancelar entrenamiento'));
    await vi.waitFor(() => expect(mockAlert.alert).toHaveBeenCalledWith('No se pudo cancelar el entrenamiento', 'Response lost after commit'));
    expect(persistedDraft).toMatchObject({ jointWorkoutId: 'joint-1', jointCancellationPending: true });
    expect(firstCancelActiveWorkout).not.toHaveBeenCalled();

    firstMount.unmount();
    resetRuntimeHarness();
    leaveJointWorkout.mockResolvedValue(undefined);
    const restartedCancelActiveWorkout = vi.fn(async () => undefined);
    setMockParams({ id: routineA.id });
    setMockData({ getRoutine: vi.fn(() => routineA), mesocycles: [], activeWorkoutDraft: persistedDraft, addAttempt: vi.fn(), startActiveWorkout: vi.fn(), updateActiveWorkout, cancelActiveWorkout: restartedCancelActiveWorkout });
    const restartedMount = render(React.createElement(ExecuteRoutineScreen));

    await vi.waitFor(() => expect(findText(restartedMount.root, 'Entrenamiento pausado')).toBeTruthy());
    expect(findButton(restartedMount.root, 'Reanudar').props.disabled).toBe(true);
    expect(findButton(restartedMount.root, 'Finalizar entrenamiento').props.disabled).toBe(true);
    await vi.waitFor(() => expect(leaveJointWorkout).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(restartedCancelActiveWorkout).toHaveBeenCalledTimes(1));
    expect(leaveJointWorkout.mock.invocationCallOrder[1]).toBeLessThan(restartedCancelActiveWorkout.mock.invocationCallOrder[0]);
  });

  test('waits through the old timeout boundary and clears the draft only after a late authoritative leave', async () => {
    vi.useFakeTimers();
    const cancelActiveWorkout = vi.fn(async () => undefined);
    const addAttempt = vi.fn();
    leaveJointWorkout.mockImplementation(() => new Promise<void>((resolve) => setTimeout(resolve, 12_001)));
    setMockParams({ id: routineA.id, jointWorkoutId: 'joint-1' });
    setMockData({ getRoutine: vi.fn(() => routineA), mesocycles: [], activeWorkoutDraft: { ...draft, jointWorkoutId: 'joint-1' }, addAttempt, startActiveWorkout: vi.fn(), updateActiveWorkout: vi.fn(), cancelActiveWorkout });
    const screen = render(React.createElement(ExecuteRoutineScreen));

    press(screen.root.find((node) => node.props.accessibilityLabel === 'Pausar entrenamiento'));
    await act(async () => { await Promise.resolve(); });
    press(screen.root.find((node) => node.props.accessibilityLabel === 'Cancelar entrenamiento'));
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });

    expect(cancelActiveWorkout).not.toHaveBeenCalled();
    expect(mockAlert.alert).not.toHaveBeenCalledWith('No se pudo cancelar el entrenamiento', expect.any(String));
    expect(findButton(screen.root, 'Reanudar').props.disabled).toBe(true);
    expect(findButton(screen.root, 'Finalizar entrenamiento').props.disabled).toBe(true);
    act(() => { findButton(screen.root, 'Finalizar entrenamiento').props.onPress(); });
    expect(addAttempt).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(cancelActiveWorkout).toHaveBeenCalledTimes(1);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  test('keeps individual workout cancellation local', async () => {
    const cancelActiveWorkout = vi.fn(async () => undefined);
    setMockParams({ id: routineA.id });
    setMockData({ getRoutine: vi.fn(() => routineA), mesocycles: [], activeWorkoutDraft: draft, addAttempt: vi.fn(), startActiveWorkout: vi.fn(), updateActiveWorkout: vi.fn(), cancelActiveWorkout });
    const screen = render(React.createElement(ExecuteRoutineScreen));

    press(screen.root.find((node) => node.props.accessibilityLabel === 'Pausar entrenamiento'));
    await vi.waitFor(() => expect(findText(screen.root, 'Entrenamiento pausado')).toBeTruthy());
    await act(async () => { screen.root.find((node) => node.props.accessibilityLabel === 'Cancelar entrenamiento').props.onPress(); await Promise.resolve(); });

    await vi.waitFor(() => expect(cancelActiveWorkout).toHaveBeenCalledTimes(1));
    expect(leaveJointWorkout).not.toHaveBeenCalled();
  });

  test('keeps an accredited joint completion successful when its publication fails and retries only the publication', async () => {
    const routineWithSet = {
      ...routineA,
      exercises: [{ id: 'exercise-1', name: 'Press', muscleGroups: ['pecho'], loadMode: 'external-load' as const, loadUnit: 'kg' as const, sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }] }],
    };
    const addAttempt = vi.fn().mockResolvedValue({
      attempt: {},
      receipt: { balance: 12, entries: [{ kind: 'valid_sets', amount: 1, breakdown: {} }], weekly: {} },
      experienceReceipt: undefined,
    });
    finishJointWorkout.mockRejectedValueOnce(new Error('Joint service unavailable')).mockResolvedValueOnce(undefined);
    setMockParams({ id: routineWithSet.id, jointWorkoutId: 'joint-1' });
    setMockData({
      getRoutine: vi.fn(() => routineWithSet), mesocycles: [], routines: [routineWithSet], exercises: [], definitions: [],
      activeWorkoutDraft: { ...draft, routineId: routineWithSet.id, jointWorkoutId: 'joint-1' }, addAttempt, startActiveWorkout: vi.fn(),
      updateActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn(),
    });

    const screen = render(React.createElement(ExecuteRoutineScreen));
    press(screen.root.find((node) => node.props.accessibilityLabel === 'Pausar entrenamiento'));
    await vi.waitFor(() => expect(findText(screen.root, 'Entrenamiento pausado')).toBeTruthy());
    press(findButton(screen.root, 'Finalizar entrenamiento'));

    await vi.waitFor(() => expect(findText(screen.root, '¡Entrenamiento completado!')).toBeTruthy());
    expect(findText(screen.root, '+1 gemas')).toBeTruthy();
    expect(findText(screen.root, 'Tu resultado conjunto todavía no se publicó')).toBeTruthy();
    expect(queueJointWorkoutPublication).toHaveBeenCalledWith('rodaja', expect.objectContaining({ workoutId: 'joint-1' }));
    expect(prepareJointWorkoutPublication.mock.invocationCallOrder[0]).toBeLessThan(addAttempt.mock.invocationCallOrder[0]);
    expect(mockAlert.alert).not.toHaveBeenCalledWith('No se pudo finalizar el entrenamiento', expect.any(String));

    press(findButton(screen.root, 'Reintentar publicación'));
    await vi.waitFor(() => expect(finishJointWorkout).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(findText(screen.root, 'Tu resultado conjunto todavía no se publicó')).toBeUndefined());
    expect(removePendingJointWorkoutPublication).toHaveBeenCalledWith('rodaja', 'joint-1');
    expect(addAttempt).toHaveBeenCalledTimes(1);
  });

  test('retains an inert prepared joint publication when attempt finalization rejects generically', async () => {
    const routineWithSet = {
      ...routineA,
      exercises: [{ id: 'exercise-1', name: 'Press', muscleGroups: ['pecho'], loadMode: 'external-load' as const, loadUnit: 'kg' as const, sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }] }],
    };
    const addAttempt = vi.fn().mockRejectedValue(new Error('rejected'));
    setMockParams({ id: routineWithSet.id, jointWorkoutId: 'joint-1' });
    setMockData({
      getRoutine: vi.fn(() => routineWithSet), mesocycles: [], routines: [routineWithSet], exercises: [], definitions: [],
      activeWorkoutDraft: { ...draft, routineId: routineWithSet.id, jointWorkoutId: 'joint-1' }, addAttempt, startActiveWorkout: vi.fn(),
      updateActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn(),
    });

    const screen = render(React.createElement(ExecuteRoutineScreen));
    press(screen.root.find((node) => node.props.accessibilityLabel === 'Pausar entrenamiento'));
    await vi.waitFor(() => expect(findText(screen.root, 'Entrenamiento pausado')).toBeTruthy());
    press(findButton(screen.root, 'Finalizar entrenamiento'));

    await vi.waitFor(() => expect(mockAlert.alert).toHaveBeenCalledWith(expect.any(String), expect.any(String)));
    expect(prepareJointWorkoutPublication.mock.invocationCallOrder[0]).toBeLessThan(addAttempt.mock.invocationCallOrder[0]);
    expect(removePendingJointWorkoutPublication).not.toHaveBeenCalled();
    expect(finishJointWorkout).not.toHaveBeenCalled();
  });

  test('keeps a prepared publication inert when finalization times out ambiguously', async () => {
    vi.useFakeTimers();
    const routineWithSet = {
      ...routineA,
      exercises: [{ id: 'exercise-1', name: 'Press', muscleGroups: ['pecho'], loadMode: 'external-load' as const, loadUnit: 'kg' as const, sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }] }],
    };
    setMockParams({ id: routineWithSet.id, jointWorkoutId: 'joint-1' });
    setMockData({
      getRoutine: vi.fn(() => routineWithSet), mesocycles: [], routines: [routineWithSet], exercises: [], definitions: [],
      activeWorkoutDraft: { ...draft, routineId: routineWithSet.id, jointWorkoutId: 'joint-1' }, addAttempt: vi.fn(() => new Promise(() => undefined)), startActiveWorkout: vi.fn(),
      updateActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn(),
    });

    const screen = render(React.createElement(ExecuteRoutineScreen));
    press(screen.root.find((node) => node.props.accessibilityLabel === 'Pausar entrenamiento'));
    await act(async () => { await Promise.resolve(); });
    press(findButton(screen.root, 'Finalizar entrenamiento'));
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });

    expect(prepareJointWorkoutPublication).toHaveBeenCalledWith('rodaja', expect.objectContaining({ attemptId: 'attempt-a', workoutId: 'joint-1' }));
    expect(removePendingJointWorkoutPublication).not.toHaveBeenCalled();
    expect(finishJointWorkout).not.toHaveBeenCalled();
  });

  test('keeps exercise addition collapsed at the end until a parent group is selected', () => {
    const routineWithSet = {
      ...routineA,
      exercises: [{ id: 'exercise-1', name: 'Press', muscleGroups: ['pecho'], variant: 'bar', sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }] }],
    };
    const catalogExercise = { id: 'catalog-1', name: 'Aperturas', muscleGroups: ['pecho'], variant: 'mancuerna', defaultSets: [] };
    const updateActiveWorkout = vi.fn();
    setMockParams({ id: routineWithSet.id });
    setMockData({
      getRoutine: vi.fn(() => routineWithSet), mesocycles: [], exercises: [catalogExercise], definitions: [],
      activeWorkoutDraft: { ...draft, routineId: routineWithSet.id }, addAttempt: vi.fn(), startActiveWorkout: vi.fn(),
      updateActiveWorkout, cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn(),
    });

    const screen = render(React.createElement(ExecuteRoutineScreen));
    press(screen.root.find((node) => node.props.accessibilityLabel === 'Agregar ejercicio'));
    const picker = screen.root.find((node) => (node.type as any) === 'ExercisePicker');
    expect(picker.props.visible).toBe(true);
    expect(picker.props.catalogMode).toBe(true);
    act(() => { picker.props.onSelect(catalogExercise); });

    expect(updateActiveWorkout).toHaveBeenCalledWith(expect.objectContaining({
      routineSnapshot: expect.objectContaining({ exercises: expect.arrayContaining([expect.objectContaining({ name: 'Aperturas' })]) }),
    }));
  });

  test('changes an unstarted exercise position only in the active snapshot while keeping started exercises locked', () => {
    const routineWithSets = {
      ...routineA,
      exercises: [
        { id: 'first', name: 'Press', muscleGroups: ['pecho'], variant: 'bar', sets: [{ id: 'first-set', tipo: 1 as const, weight: 10, reps: 8 }] },
        { id: 'second', name: 'Row', muscleGroups: ['espalda'], variant: 'bar', sets: [{ id: 'second-set', tipo: 1 as const, weight: 20, reps: 10 }] },
        { id: 'third', name: 'Curl', muscleGroups: ['biceps'], variant: 'bar', sets: [{ id: 'third-set', tipo: 1 as const, weight: 8, reps: 12 }] },
      ],
    };
    const snapshot = structuredClone(routineWithSets);
    const updateActiveWorkout = vi.fn();
    setMockParams({ id: routineWithSets.id });
    setMockData({
      getRoutine: vi.fn(() => routineWithSets), mesocycles: [], exercises: [], definitions: [],
      activeWorkoutDraft: { ...draft, routineId: routineWithSets.id, routineSnapshot: snapshot, completedSets: { 'first-first-set': true }, setValues: { 'first-first-set': { weight: '12.5', reps: '9' }, 'second-second-set': { weight: '22.5', reps: '11' }, 'third-third-set': { weight: '10', reps: '13' } } },
      addAttempt: vi.fn(), startActiveWorkout: vi.fn(), updateActiveWorkout, cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn(),
    });

    const screen = render(React.createElement(ExecuteRoutineScreen));
    const lockedPosition = screen.root.find((node) => node.props.accessibilityLabel === 'Cambiar posición de Press');
    const lockedDeletion = screen.root.find((node) => node.props.accessibilityLabel === 'Eliminar Press del entrenamiento actual');
    expect(lockedPosition.props.accessibilityState).toEqual({ disabled: true });
    expect(lockedPosition.props.accessibilityHint).toBe('No se puede modificar un ejercicio iniciado');
    expect(lockedDeletion.props.accessibilityState).toEqual({ disabled: true });
    expect(lockedDeletion.props.accessibilityHint).toBe('No se puede modificar un ejercicio iniciado');
    press(lockedPosition);
    press(lockedDeletion);
    expect(mockAlert.alert).not.toHaveBeenCalled();
    expect(screen.root.findAll((node) => (node.type as any) === 'Modal' && node.props.visible)).toHaveLength(0);

    const changePosition = screen.root.find((node) => node.props.accessibilityLabel === 'Cambiar posición de Row');
    expect(changePosition.props.accessibilityHint).toBe('Abre las posiciones disponibles para este ejercicio solo en este entrenamiento');
    expect(findText(changePosition, 'Cambiar posición')).toBeTruthy();
    press(changePosition);
    press(screen.root.find((node) => node.props.accessibilityLabel === 'Mover Row a la posición 3, Curl'));

    const movedDraft = updateActiveWorkout.mock.calls.at(-1)?.[0];
    expect(movedDraft.routineSnapshot.exercises.map((exercise: { id: string }) => exercise.id)).toEqual(['first', 'third', 'second']);
    expect(movedDraft.completedSets).toEqual({ 'first-first-set': true });
    expect(movedDraft.setValues).toEqual({ 'first-first-set': { weight: '12.5', reps: '9' }, 'second-second-set': { weight: '22.5', reps: '11' }, 'third-third-set': { weight: '10', reps: '13' } });
    expect(routineWithSets.exercises.map((exercise) => exercise.id)).toEqual(['first', 'second', 'third']);

    const removeSet = screen.root.find((node) => node.props.accessibilityLabel === 'Quitar serie 1 de Row');
    expect(removeSet.props.accessibilityHint).toBe('Elimina esta serie del entrenamiento actual');
    expect(removeSet.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ height: 44, width: 44 })]));
    expect(removeSet.findAll((node) => (node.type as any) === 'Text')).toHaveLength(0);
  });

  test('confirms deletion of an unstarted exercise and persists only the reconciled active snapshot', () => {
    const routineWithSets = {
      ...routineA,
      exercises: [
        { id: 'first', name: 'Press', muscleGroups: ['pecho'], variant: 'bar', sets: [{ id: 'first-set', tipo: 1 as const, weight: 10, reps: 8 }] },
        { id: 'second', name: 'Row', muscleGroups: ['espalda'], variant: 'bar', sets: [{ id: 'second-set', tipo: 1 as const, weight: 20, reps: 10 }] },
      ],
    };
    const snapshot = structuredClone(routineWithSets);
    const updateActiveWorkout = vi.fn();
    setMockParams({ id: routineWithSets.id });
    setMockData({
      getRoutine: vi.fn(() => routineWithSets), mesocycles: [], exercises: [], definitions: [],
      activeWorkoutDraft: {
        ...draft,
        routineId: routineWithSets.id,
        routineSnapshot: snapshot,
        completedSets: { 'first-first-set': false, 'second-second-set': false },
        setValues: {
          'first-first-set': { weight: '12.5', reps: '9' },
          'second-second-set': { weight: '22.5', reps: '11' },
        },
      },
      addAttempt: vi.fn(), startActiveWorkout: vi.fn(), updateActiveWorkout, cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn(),
    });

    const screen = render(React.createElement(ExecuteRoutineScreen));
    const removeExercise = screen.root.find((node) => node.props.accessibilityLabel === 'Eliminar Row del entrenamiento actual');
    expect(removeExercise.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ height: 44, width: 44 })]));
    press(removeExercise);
    expect(mockAlert.alert).toHaveBeenCalledWith(
      '¿Eliminar ejercicio?',
      'Se eliminará Row solo de este entrenamiento. Tu rutina guardada no cambiará.',
      expect.arrayContaining([expect.objectContaining({ text: 'Eliminar ejercicio', style: 'destructive' })]),
    );
    act(() => { mockAlert.alert.mock.calls.at(-1)?.[2][1].onPress(); });

    expect(updateActiveWorkout).toHaveBeenLastCalledWith(expect.objectContaining({
      routineSnapshot: expect.objectContaining({ exercises: [expect.objectContaining({ id: 'first' })] }),
      setValues: { 'first-first-set': { weight: '12.5', reps: '9' } },
      completedSets: { 'first-first-set': false },
    }));
    expect(routineWithSets.exercises.map((exercise) => exercise.id)).toEqual(['first', 'second']);
  });

     test('keeps the social hub outside the exercise scroller', () => {
    const routineWithSet = {
      ...routineA,
      exercises: [{ id: 'exercise-1', name: 'Press', muscleGroups: ['pecho'], variant: 'bar', sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }] }],
    };
    setMockParams({ id: routineWithSet.id });
    setMockData({
      getRoutine: vi.fn(() => routineWithSet), mesocycles: [], exercises: [], definitions: [],
      activeWorkoutDraft: { ...draft, routineId: routineWithSet.id }, addAttempt: vi.fn(), startActiveWorkout: vi.fn(),
      updateActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn(),
    });

    const screen = render(React.createElement(ExecuteRoutineScreen));
    const lists = screen.root.findAll((node) => (node.type as any) === 'FlatList');

       expect(lists).toHaveLength(1);
        expect(lists[0].props.contentContainerStyle).toEqual(expect.objectContaining({ paddingBottom: 104, paddingTop: 82 }));
       expect(lists[0].props.stickyHeaderIndices).toBeUndefined();
        expect(lists[0].props.stickyHeaderHiddenOnScroll).toBeUndefined();
        expect(lists[0].props.StickyHeaderComponent).toBeUndefined();
        expect(lists[0].props.onScroll).toEqual(expect.any(Function));
        expect(lists[0].props.scrollEventThrottle).toBe(16);
        expect(findText(screen.root, '00:00')).toBeTruthy();
        expect(findText(screen.root, '01:30')).toBeTruthy();
        expect(screen.root.find((node) => node.props.accessibilityLabel === 'Pausar entrenamiento')).toBeTruthy();
     expect(screen.root.find((node) => node.props.accessibilityLabel === 'Mostrar entrenamiento conjunto')).toBeTruthy();
    expect(screen.root.find((node) => node.props.accessibilityLabel === 'Agregar ejercicio')).toBeTruthy();
     expect(screen.root.findAll((node) => (node.type as any) === 'ScrollView')).toHaveLength(0);
    });

    test('persists a completed set and its rest before hardware back leaves the session', async () => {
      const routineWithSet = {
        ...routineA,
        exercises: [{ id: 'exercise-1', name: 'Press', muscleGroups: ['pecho'], variant: 'bar', sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }] }],
      };
      const updateActiveWorkout = vi.fn().mockResolvedValue(undefined);
      setMockParams({ id: routineWithSet.id });
      setMockData({
        getRoutine: vi.fn(() => routineWithSet), mesocycles: [], exercises: [], definitions: [],
        activeWorkoutDraft: { ...draft, routineId: routineWithSet.id, setValues: { 'exercise-1-set-1': { weight: '10', reps: '8' } } }, addAttempt: vi.fn(), startActiveWorkout: vi.fn(),
        updateActiveWorkout, cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn(),
      });

      const screen = render(React.createElement(ExecuteRoutineScreen));
      press(screen.root.findAll((node) => (node.type as any) === 'HapticPressable').find((node) => node.props.accessibilityLabel === undefined)!);

      await act(async () => { expect(__emitHardwareBackPress()).toBe(true); await Promise.resolve(); });

      expect(updateActiveWorkout).toHaveBeenCalledWith(expect.objectContaining({
        completedSets: { 'exercise-1-set-1': true },
        restEndsAtMs: expect.any(Number),
      }));
      expect(mockRouter.back).toHaveBeenCalled();
    });

   test('expands joint training from the sticky community control', async () => {
     const routineWithSet = {
       ...routineA,
       exercises: [{ id: 'exercise-1', name: 'Press', muscleGroups: ['pecho'], variant: 'bar', sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }] }],
     };
     setMockParams({ id: routineWithSet.id });
     setMockData({
       getRoutine: vi.fn(() => routineWithSet), mesocycles: [], exercises: [], definitions: [],
       activeWorkoutDraft: { ...draft, routineId: routineWithSet.id }, addAttempt: vi.fn(), startActiveWorkout: vi.fn(),
       updateActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn(),
     });

     const screen = render(React.createElement(ExecuteRoutineScreen));
     press(screen.root.find((node) => node.props.accessibilityLabel === 'Mostrar entrenamiento conjunto'));

     expect(screen.root.find((node) => node.props.accessibilityLabel === 'Ocultar entrenamiento conjunto').props.accessibilityState).toEqual({ expanded: true });
     expect(findText(screen.root, 'Entrenamiento conjunto')).toBeTruthy();
     await vi.waitFor(() => expect(findText(screen.root, 'Nadie de tu círculo está entrenando ahora.')).toBeTruthy());
   });

    test('pauses both persisted timers before opening the workout decision menu', async () => {
     const routineWithSet = {
       ...routineA,
       exercises: [{ id: 'exercise-1', name: 'Press', muscleGroups: ['pecho'], variant: 'bar', sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }] }],
     };
     const updateActiveWorkout = vi.fn();
     setMockParams({ id: routineWithSet.id });
     setMockData({
       getRoutine: vi.fn(() => routineWithSet), mesocycles: [], exercises: [], definitions: [],
       activeWorkoutDraft: { ...draft, routineId: routineWithSet.id, restEndsAtMs: Date.now() + 30_000 }, addAttempt: vi.fn(), startActiveWorkout: vi.fn(),
       updateActiveWorkout, cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn(),
     });

     const screen = render(React.createElement(ExecuteRoutineScreen));
     press(screen.root.find((node) => node.props.accessibilityLabel === 'Pausar entrenamiento'));

     await vi.waitFor(() => expect(updateActiveWorkout).toHaveBeenCalledWith(expect.objectContaining({
       pausedAtMs: expect.any(Number),
       pausedRestRemainingSeconds: expect.any(Number),
       restEndsAtMs: undefined,
     })));
     await vi.waitFor(() => expect(screen.root.find((node) => (node.type as any) === 'Modal').props.visible).toBe(true));
      expect(findText(screen.root, 'Entrenamiento pausado')).toBeTruthy();
    });

    test('opens the pause menu immediately and offers sync retry after a timeout', async () => {
      vi.useFakeTimers();
      const routineWithSet = {
        ...routineA,
        exercises: [{ id: 'exercise-1', name: 'Press', muscleGroups: ['pecho'], variant: 'bar', sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }] }],
      };
      const updateActiveWorkout = vi.fn(() => new Promise<void>(() => undefined));
      setMockParams({ id: routineWithSet.id });
      setMockData({
        getRoutine: vi.fn(() => routineWithSet), mesocycles: [], exercises: [], definitions: [],
        activeWorkoutDraft: { ...draft, routineId: routineWithSet.id, routineSnapshot: routineWithSet }, addAttempt: vi.fn(), startActiveWorkout: vi.fn(),
        updateActiveWorkout, cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn(),
      });

      const screen = render(React.createElement(ExecuteRoutineScreen));
      const pause = () => screen.root.find((node) => node.props.accessibilityLabel === 'Pausar entrenamiento');
      press(pause());
      expect(screen.root.find((node) => (node.type as any) === 'Modal').props.visible).toBe(true);
      expect(findText(screen.root, 'Entrenamiento pausado')).toBeTruthy();
      await act(async () => { vi.advanceTimersByTime(12_000); });
      expect(findText(screen.root, 'La pausa sigue guardada en este dispositivo. Se sincronizará al reintentar o volver a la app.')).toBeTruthy();

      const callsBeforeRetry = updateActiveWorkout.mock.calls.length;
      press(findButton(screen.root, 'Reintentar sincronización'));
      expect(updateActiveWorkout).toHaveBeenCalledTimes(callsBeforeRetry + 1);
    });

    test('keeps the mounted rest countdown moving while persistence is still pending and shows one completion badge', async () => {
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
     mockAlert.alert.mockClear();
     press(screen.root.findAll((node) => (node.type as any) === 'HapticPressable').find((node) => node.props.accessibilityLabel === undefined)!);
     expect(mockAlert.alert).not.toHaveBeenCalled();
     expect(findText(screen.root, '00:03')).toBeTruthy();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    mockAlert.alert.mockClear();
    act(() => { vi.advanceTimersByTime(1_000); });
    act(() => { __emitAppState('active'); });
    expect(findText(screen.root, '00:02')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(2_000); });
    act(() => { __emitAppState('active'); });
     expect(mockAlert.alert).not.toHaveBeenCalled();
     expect(findText(screen.root, 'Descanso terminado')).toBeTruthy();
     press(screen.root.find((node) => node.props.accessibilityLabel === 'Cerrar aviso de descanso'));
      expect(findText(screen.root, 'Descanso terminado')).toBeUndefined();
   });

   test('replaces an active rest with the full countdown from the latest completed set', () => {
     vi.useFakeTimers();
     vi.setSystemTime(new Date('2026-07-30T20:00:00.000Z'));
     const routineWithSets = {
       ...routineA,
       exercises: [{
         id: 'exercise-1', name: 'Press', loadMode: 'external-load' as const, loadUnit: 'kg' as const,
         sets: [
           { id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 },
           { id: 'set-2', tipo: 2 as const, weight: 10, reps: 8 },
         ],
       }],
     };
     setMockParams({ id: routineWithSets.id });
     setMockData({
       getRoutine: vi.fn(() => routineWithSets),
       activeWorkoutDraft: { ...draft, routineId: routineWithSets.id, restTimerSeconds: 3 },
       addAttempt: vi.fn(), startActiveWorkout: vi.fn(), updateActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn(),
     });

     const screen = render(React.createElement(ExecuteRoutineScreen));
     const inputs = screen.root.findAll((node) => (node.type as any) === 'GlassInput');
     ['10', '8', '10', '8'].forEach((value, index) => changeText(inputs[index], value));
     const completeNextSet = () => press(screen.root.findAll((node) => (node.type as any) === 'HapticPressable')
       .find((node) => node.props.accessibilityLabel === undefined)!);

     completeNextSet();
     act(() => { vi.advanceTimersByTime(2_000); });
     expect(findText(screen.root, '00:01')).toBeTruthy();
     completeNextSet();
     expect(findText(screen.root, '00:03')).toBeTruthy();

     act(() => { vi.advanceTimersByTime(2_000); });
     expect(findText(screen.root, 'Descanso terminado')).toBeUndefined();
     act(() => { vi.advanceTimersByTime(1_000); });
     expect(findText(screen.root, 'Descanso terminado')).toBeTruthy();
   });

    test('reopens a completed set so its values and intensity can be corrected and reconfirmed', async () => {
    const routineWithSet = {
      ...routineA,
      exercises: [{
        id: 'exercise-1',
        name: 'Press',
        loadMode: 'external-load' as const,
        loadUnit: 'kg' as const,
        sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }],
      }],
    };
    const updateActiveWorkout = vi.fn();
    setMockParams({ id: routineWithSet.id });
    setMockData({
      getRoutine: vi.fn(() => routineWithSet),
      activeWorkoutDraft: { ...draft, routineId: routineWithSet.id },
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
    press(screen.root.findAll((node) => (node.type as any) === 'HapticPressable').find((node) => node.props.accessibilityLabel === undefined)!);

     expect(inputs[0].props.editable).toBe(false);
     press(screen.root.find((node) => node.props.accessibilityLabel === 'Editar Serie 1'));
     expect(inputs[0].props.editable).toBe(true);
     expect(updateActiveWorkout).toHaveBeenCalledWith(expect.objectContaining({
       completedSets: { 'exercise-1-set-1': false },
     }));

     press(screen.root.find((node) => node.props.accessibilityLabel === 'Configurar intensidad objetivo'));
     press(screen.root.find((node) => node.props.accessibilityLabel === 'RPE'));
     press(screen.root.find((node) => node.props.accessibilityLabel === 'RPE 8'));
     expect(updateActiveWorkout).toHaveBeenLastCalledWith(expect.objectContaining({
       routineSnapshot: expect.objectContaining({
         exercises: [expect.objectContaining({ sets: [expect.objectContaining({ effortTarget: { kind: 'rpe', value: 8 } })] })],
       }),
     }));

      changeText(inputs[0], '12.5');
     changeText(inputs[1], '7');
      expect(updateActiveWorkout).not.toHaveBeenLastCalledWith(expect.objectContaining({
         setValues: { 'exercise-1-set-1': { weight: '12.5', reps: '7' } },
       }));
      await act(async () => { inputs[1].props.onBlur(); });
      expect(updateActiveWorkout).toHaveBeenLastCalledWith(expect.objectContaining({
        setValues: { 'exercise-1-set-1': { weight: '12.5', reps: '7' } },
      }));
    });

    test('shows a non-blocking save indicator while an active workout change persists', async () => {
      const routineWithSet = {
        ...routineA,
        exercises: [{ id: 'exercise-1', name: 'Press', muscleGroups: ['pecho'], loadMode: 'external-load' as const, loadUnit: 'kg' as const, sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }] }],
      };
      const updateActiveWorkout = vi.fn(() => new Promise<void>(() => undefined));
      setMockParams({ id: routineWithSet.id });
      setMockData({
        getRoutine: vi.fn(() => routineWithSet), mesocycles: [], exercises: [], definitions: [],
        activeWorkoutDraft: { ...draft, routineId: routineWithSet.id }, addAttempt: vi.fn(), startActiveWorkout: vi.fn(),
        updateActiveWorkout, cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn(),
      });

      const screen = render(React.createElement(ExecuteRoutineScreen));
      const input = screen.root.findAll((node) => (node.type as any) === 'GlassInput')[0];
      changeText(input, '12.5');

      expect(findText(screen.root, 'Guardando datos...')).toBeTruthy();
      expect(input.props.editable).not.toBe(false);
      expect(screen.root.find((node) => node.props.accessibilityLabel === 'Guardando datos').props.accessibilityState).toEqual({ busy: true });
    });

    test('keeps unfinished set editing and additions available after another set is complete', () => {
      const routineWithSets = {
        ...routineA,
        exercises: [{
          id: 'exercise-1',
          name: 'Press',
          loadMode: 'external-load' as const,
          loadUnit: 'kg' as const,
          sets: [
            { id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 },
            { id: 'set-2', tipo: 2 as const, weight: 10, reps: 8 },
          ],
        }],
      };
      const updateActiveWorkout = vi.fn();
      setMockParams({ id: routineWithSets.id });
      setMockData({
        getRoutine: vi.fn(() => routineWithSets),
        activeWorkoutDraft: { ...draft, routineId: routineWithSets.id, completedSets: { 'exercise-1-set-1': true } },
        addAttempt: vi.fn(),
        startActiveWorkout: vi.fn(),
        updateActiveWorkout,
        cancelActiveWorkout: vi.fn(),
        refreshActiveWorkoutTiming: vi.fn(),
      });

      const screen = render(React.createElement(ExecuteRoutineScreen));
      press(screen.root.find((node) => node.props.accessibilityLabel === 'Editar Serie 2'));
      const warmupButtons = screen.root.findAll((node) => (node.type as any) === 'HapticPressable' && node.props.accessibilityLabel === 'Calentamiento');
      expect(warmupButtons).toHaveLength(1);
      press(warmupButtons[0]);
      expect(screen.root.find((node) => node.props.accessibilityLabel === 'Editar Calentamiento')).toBeTruthy();
      expect(updateActiveWorkout).toHaveBeenLastCalledWith(expect.objectContaining({
        routineSnapshot: expect.objectContaining({
          exercises: [expect.objectContaining({ sets: [expect.objectContaining({ tipo: 1 }), expect.objectContaining({ tipo: 'C' })] })],
        }),
      }));

      press(screen.root.find((node) => node.props.accessibilityLabel === 'Agregar serie a Press'));
      expect(updateActiveWorkout).toHaveBeenLastCalledWith(expect.objectContaining({
        routineSnapshot: expect.objectContaining({
          exercises: [expect.objectContaining({ sets: expect.arrayContaining([expect.objectContaining({ id: 'set-1', tipo: 1 })]) })],
        }),
      }));
      expect(screen.root.find((node) => node.props.accessibilityLabel === 'Agregar backoff a Press')).toBeTruthy();
    });

    test('configures, resets, and persists intensity for an unfinished series', () => {
     const routineWithSet = {
       ...routineA,
       exercises: [{
         id: 'exercise-1',
         name: 'Press',
         loadMode: 'external-load' as const,
         loadUnit: 'kg' as const,
         sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }],
       }],
     };
     const updateActiveWorkout = vi.fn();
     setMockParams({ id: routineWithSet.id });
     setMockData({
       getRoutine: vi.fn(() => routineWithSet),
       activeWorkoutDraft: { ...draft, routineId: routineWithSet.id },
       addAttempt: vi.fn(),
       startActiveWorkout: vi.fn(),
       updateActiveWorkout,
       cancelActiveWorkout: vi.fn(),
       refreshActiveWorkoutTiming: vi.fn(),
     });

     const screen = render(React.createElement(ExecuteRoutineScreen));
     press(screen.root.find((node) => node.props.accessibilityLabel === 'Configurar intensidad objetivo'));
     press(screen.root.find((node) => node.props.accessibilityLabel === 'RIR'));
     press(screen.root.find((node) => node.props.accessibilityLabel === 'RIR 2'));

     expect(screen.root.find((node) => node.props.accessibilityLabel === 'Editar RIR 2')).toBeTruthy();
     expect(updateActiveWorkout).toHaveBeenLastCalledWith(expect.objectContaining({
       routineSnapshot: expect.objectContaining({
         exercises: [expect.objectContaining({ sets: [expect.objectContaining({ effortTarget: { kind: 'rir', value: 2 } })] })],
       }),
     }));

     press(screen.root.find((node) => node.props.accessibilityLabel === 'Editar RIR 2'));
     press(screen.root.find((node) => node.props.accessibilityLabel === 'Sin objetivo'));
     expect(screen.root.find((node) => node.props.accessibilityLabel === 'Configurar intensidad objetivo')).toBeTruthy();
   });

 });
