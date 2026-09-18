import React from 'react';
import { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { changeText, findButton, findText, mockAlert, mockRouter, press, render, resetRuntimeHarness, setMockData, setMockParams } from './helpers/runtimeHarness';
import { createWorkoutAttempt } from '../utils/workoutAttempts';
import { ActiveWorkoutDraft, Routine } from '../types';
import RoutinesScreen from '../app/(tabs)/routines';
vi.mock('../services/routineEditorDraft', () => ({ readRoutineDraft: async () => null, writeRoutineDraft: async () => undefined, removeRoutineDraft: async () => undefined }));
import EditRoutineScreen from '../app/routine/[id]';
import MesocycleSummaryScreen from '../app/mesocycle/summary/[id]';
import ExecuteRoutineScreen from '../app/routine/execute/[id]';
import { hasActiveWorkoutReentryIntegrity, matchesActiveWorkout } from '../utils/activeWorkoutReentry';
import { __emitAppState, __emitHardwareBackPress } from './helpers/reactNativeStub';

const publishWorkoutStartActivity = vi.hoisted(() => vi.fn(async () => undefined));
const listActiveWorkoutInviteCandidates = vi.hoisted(() => vi.fn(async (): Promise<any[]> => []));
const inviteActiveWorkoutMember = vi.hoisted(() => vi.fn(async () => 'joint-new'));
const resolveJointWorkoutAttempt = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null));
const finishJointWorkout = vi.hoisted(() => vi.fn());
const leaveJointWorkout = vi.hoisted(() => vi.fn());
const prepareJointWorkoutPublication = vi.hoisted(() => vi.fn(async () => undefined));
const queueJointWorkoutPublication = vi.hoisted(() => vi.fn(async () => undefined));
const flushPendingJointWorkoutPublications = vi.hoisted(() => vi.fn());
const loadJointPublicationProgress = vi.hoisted(() => vi.fn(async () => []));

vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: 'rodaja', welcomeMessage: null, setWelcomeMessage: vi.fn() }) }));
vi.mock('../context/ShopContext', () => ({ useShop: () => ({ retryPendingRewards: vi.fn() }) }));
vi.mock('../components/LogoutButton', () => ({ LogoutButton: () => null }));
vi.mock('../services/jointWorkouts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/jointWorkouts')>(),
  finishJointWorkoutAttempt: finishJointWorkout,
  leaveJointWorkoutAttempt: leaveJointWorkout,
  resolveJointWorkoutAttempt,
  listActiveWorkoutInviteCandidates, inviteActiveWorkoutMember,
}));
vi.mock('../services/workoutStartActivity', async (importOriginal) => ({ ...await importOriginal<typeof import('../services/workoutStartActivity')>(), publishWorkoutStartActivity }));
vi.mock('../services/jointWorkoutPublicationQueue', () => ({ prepareJointWorkoutPublication, queueJointWorkoutPublication, flushPendingJointWorkoutPublications, loadJointPublicationProgress }));

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

  test('offers Continue only for the matching routine from Training and detail', async () => {
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
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
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

    press(screen.root.find((node) => node.props.accessibilityLabel === 'Finalizar sesión'));
    await vi.waitFor(() => expect(findText(screen.root, 'Finalizar entrenamiento')).toBeTruthy());
    await act(async () => { screen.root.find((node) => node.props.accessibilityLabel === 'Cancelar entrenamiento').props.onPress(); await Promise.resolve(); });

    await vi.waitFor(() => expect(cancelActiveWorkout).toHaveBeenCalledTimes(1));
    expect(updateActiveWorkout).toHaveBeenCalledWith(expect.objectContaining({ jointCancellationPending: true }));
    expect(leaveJointWorkout).toHaveBeenCalledWith('rodaja', 'attempt-a', 'joint-1');
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

    press(screen.root.find((node) => node.props.accessibilityLabel === 'Finalizar sesión'));
    await vi.waitFor(() => expect(findText(screen.root, 'Finalizar entrenamiento')).toBeTruthy());
    await act(async () => { screen.root.find((node) => node.props.accessibilityLabel === 'Cancelar entrenamiento').props.onPress(); await Promise.resolve(); });

    await vi.waitFor(() => expect(mockAlert.alert).toHaveBeenCalledWith('No se pudo cancelar el entrenamiento', 'Joint service unavailable'));
    expect(cancelActiveWorkout).not.toHaveBeenCalled();
    expect(updateActiveWorkout).toHaveBeenCalledWith(expect.objectContaining({ jointCancellationPending: true }));
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(screen.root.find((node) => node.props.accessibilityLabel === 'Cerrar opciones de finalización').props.disabled).toBe(true);
    expect(findButton(screen.root, 'Guardar sesión').props.disabled).toBe(true);
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

    press(firstMount.root.find((node) => node.props.accessibilityLabel === 'Finalizar sesión'));
    await vi.waitFor(() => expect(findText(firstMount.root, 'Finalizar entrenamiento')).toBeTruthy());
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

    await vi.waitFor(() => expect(findText(restartedMount.root, 'Finalizar entrenamiento')).toBeTruthy());
    expect(restartedMount.root.find((node) => node.props.accessibilityLabel === 'Cerrar opciones de finalización').props.disabled).toBe(true);
    expect(findButton(restartedMount.root, 'Guardar sesión').props.disabled).toBe(true);
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

    press(screen.root.find((node) => node.props.accessibilityLabel === 'Finalizar sesión'));
    await act(async () => { await Promise.resolve(); });
    press(screen.root.find((node) => node.props.accessibilityLabel === 'Cancelar entrenamiento'));
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });

    expect(cancelActiveWorkout).not.toHaveBeenCalled();
    expect(mockAlert.alert).not.toHaveBeenCalledWith('No se pudo cancelar el entrenamiento', expect.any(String));
    expect(screen.root.find((node) => node.props.accessibilityLabel === 'Cerrar opciones de finalización').props.disabled).toBe(true);
    expect(findButton(screen.root, 'Guardar sesión').props.disabled).toBe(true);
    act(() => { findButton(screen.root, 'Guardar sesión').props.onPress(); });
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

    press(screen.root.find((node) => node.props.accessibilityLabel === 'Finalizar sesión'));
    await vi.waitFor(() => expect(findText(screen.root, 'Finalizar entrenamiento')).toBeTruthy());
    await act(async () => { screen.root.find((node) => node.props.accessibilityLabel === 'Cancelar entrenamiento').props.onPress(); await Promise.resolve(); });

    await vi.waitFor(() => expect(cancelActiveWorkout).toHaveBeenCalledTimes(1));
    expect(leaveJointWorkout).not.toHaveBeenCalled();
  });

  test('keeps an accredited joint completion successful when its publication fails and retries only the publication', async () => {
    const routineWithSet = {
      ...routineA,
      exercises: [{ id: 'exercise-1', name: 'Press', muscleGroups: ['legacy-label'], attribution: { primary: 'GM-101', secondary: ['GM-102'], weights: { 'GM-101': 1, 'GM-102': 0.5 } }, loadMode: 'external-load' as const, loadUnit: 'kg' as const, sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }] }],
    };
    const addAttempt = vi.fn().mockResolvedValue({
      attempt: {},
      receipt: { balance: 12, entries: [{ kind: 'valid_sets', amount: 1, breakdown: {} }], weekly: {} },
      experienceReceipt: undefined,
    });
    flushPendingJointWorkoutPublications.mockRejectedValueOnce(new Error('Joint service unavailable')).mockResolvedValueOnce(1);
    setMockParams({ id: routineWithSet.id, jointWorkoutId: 'joint-1' });
    setMockData({
      getRoutine: vi.fn(() => routineWithSet), mesocycles: [], routines: [routineWithSet], exercises: [], definitions: [],
      activeWorkoutDraft: { ...draft, routineId: routineWithSet.id, jointWorkoutId: 'joint-1' }, addAttempt, startActiveWorkout: vi.fn(),
      updateActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn(),
    });

    const screen = render(React.createElement(ExecuteRoutineScreen));
    press(screen.root.find((node) => node.props.accessibilityLabel === 'Finalizar sesión'));
    await vi.waitFor(() => expect(findText(screen.root, 'Finalizar entrenamiento')).toBeTruthy());
    press(findButton(screen.root, 'Guardar sesión'));
    const intent = mockAlert.alert.mock.calls.at(-1);
    if (intent?.[0] === 'Guardar lo realizado') act(() => { intent[2]?.find((action: { text: string; onPress?: () => void }) => action.text === 'Guardar sesión')?.onPress?.(); });

    await vi.waitFor(() => expect(findText(screen.root, '¡Tu esfuerzo cuenta!')).toBeTruthy());
    expect(screen.root.findAllByProps({ accessibilityLabel: '1 gemas ganadas. Saldo: 12 gemas' }).length).toBeGreaterThan(0);
    expect(findText(screen.root, 'Entrenamiento guardado. Publicación conjunta pendiente.')).toBeTruthy();
    expect(queueJointWorkoutPublication).toHaveBeenCalledWith('rodaja', expect.objectContaining({ workoutId: 'joint-1' }));
    expect(flushPendingJointWorkoutPublications).toHaveBeenCalledWith('rodaja');
    expect(queueJointWorkoutPublication).toHaveBeenCalledWith('rodaja', expect.objectContaining({completedWorkout:expect.objectContaining({exercises:[expect.objectContaining({muscleGroupIds:['GM-101','GM-102']})]})}));
    expect(prepareJointWorkoutPublication.mock.invocationCallOrder[0]).toBeLessThan(addAttempt.mock.invocationCallOrder[0]);
    expect(mockAlert.alert).not.toHaveBeenCalledWith('No se pudo finalizar el entrenamiento', expect.any(String));

    press(findButton(screen.root, 'Reintentar publicación'));
    await vi.waitFor(() => expect(flushPendingJointWorkoutPublications).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(findText(screen.root, 'Entrenamiento guardado. Publicación conjunta pendiente.')).toBeUndefined());
    expect(loadJointPublicationProgress).toHaveBeenCalledWith('rodaja');
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
    press(screen.root.find((node) => node.props.accessibilityLabel === 'Finalizar sesión'));
    await vi.waitFor(() => expect(findText(screen.root, 'Finalizar entrenamiento')).toBeTruthy());
    press(findButton(screen.root, 'Guardar sesión'));
    const intent = mockAlert.alert.mock.calls.at(-1);
    if (intent?.[0] === 'Guardar lo realizado') act(() => { intent[2]?.find((action: { text: string; onPress?: () => void }) => action.text === 'Guardar sesión')?.onPress?.(); });

    await vi.waitFor(() => expect(mockAlert.alert).toHaveBeenCalledWith(expect.any(String), expect.any(String)));
    expect(prepareJointWorkoutPublication.mock.invocationCallOrder[0]).toBeLessThan(addAttempt.mock.invocationCallOrder[0]);
    expect(flushPendingJointWorkoutPublications).not.toHaveBeenCalled();
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
    press(screen.root.find((node) => node.props.accessibilityLabel === 'Finalizar sesión'));
    await act(async () => { await Promise.resolve(); });
    press(findButton(screen.root, 'Guardar sesión'));
    const intent = mockAlert.alert.mock.calls.at(-1);
    if (intent?.[0] === 'Guardar lo realizado') act(() => { intent[2]?.find((action: { text: string; onPress?: () => void }) => action.text === 'Guardar sesión')?.onPress?.(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });

    expect(prepareJointWorkoutPublication).toHaveBeenCalledWith('rodaja', expect.objectContaining({ attemptId: 'attempt-a', workoutId: 'joint-1' }));
    expect(flushPendingJointWorkoutPublications).not.toHaveBeenCalled();
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
    press(findButton(screen.root, 'Desplegar ejercicios'));
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
    press(findButton(screen.root, 'Desplegar ejercicios'));
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
        expect(screen.root.find((node) => node.props.accessibilityLabel === 'Finalizar sesión')).toBeTruthy();
     expect(screen.root.find((node) => node.props.accessibilityLabel === 'Mostrar entrenamiento conjunto')).toBeTruthy();
    expect(screen.root.find((node) => node.props.accessibilityLabel === 'Agregar ejercicio')).toBeTruthy();
     expect(screen.root.findAll((node) => (node.type as any) === 'ScrollView')).toHaveLength(0);
    });

    test('persists the final completed set without rest before hardware back leaves the session', async () => {
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
      press(screen.root.findAll((node) => (node.type as any) === 'HapticPressable').find((node) => String(node.props.accessibilityLabel).startsWith('Finalizar serie '))!);

      await act(async () => { expect(__emitHardwareBackPress()).toBe(true); await Promise.resolve(); });

      expect(updateActiveWorkout).toHaveBeenCalledWith(expect.objectContaining({
        completedSets: { 'exercise-1-set-1': true },
        restEndsAtMs: undefined,
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

    test('opens finalization without pausing or writing the timers', async () => {
      const updateActiveWorkout = vi.fn();
      setMockParams({ id: routineA.id });
      setMockData({ getRoutine: () => routineA, mesocycles: [], activeWorkoutDraft: { ...draft, routineSnapshot: routineA, startedAtMs: Date.now(), restEndsAtMs: Date.now() + 30_000 }, updateActiveWorkout, addAttempt: vi.fn(), cancelActiveWorkout: vi.fn() });
      const screen = render(React.createElement(ExecuteRoutineScreen));
      expect(screen.root.findAll((node) => /Pausar entrenamiento|Resolver entrenamiento pausado/.test(node.props.accessibilityLabel ?? ''))).toHaveLength(0);
      press(screen.root.find((node) => node.props.accessibilityLabel === 'Finalizar sesión'));
      expect(findButton(screen.root, 'Guardar sesión')).toBeTruthy();
      expect(updateActiveWorkout).not.toHaveBeenCalled();
    });

    test('automatically resumes a legacy paused draft preserving elapsed and remaining rest', async () => {
      const now = Date.now();
      const updateActiveWorkout = vi.fn(async (_draft: ActiveWorkoutDraft) => undefined);
      setMockParams({ id: routineA.id });
      setMockData({ getRoutine: () => routineA, mesocycles: [], activeWorkoutDraft: { ...draft, routineSnapshot: routineA, startedAtMs: now - 60_000, pausedAtMs: now - 20_000, pausedRestRemainingSeconds: 15, pausedDurationMs: 5000 }, updateActiveWorkout, addAttempt: vi.fn(), cancelActiveWorkout: vi.fn() });
      render(React.createElement(ExecuteRoutineScreen));
      await vi.waitFor(() => expect(updateActiveWorkout).toHaveBeenCalledWith(expect.objectContaining({ pausedAtMs: undefined, pausedRestRemainingSeconds: undefined, pausedDurationMs: expect.any(Number), restEndsAtMs: expect.any(Number) })));
      const saved = updateActiveWorkout.mock.calls.at(-1)![0] as any;
      expect(saved.pausedDurationMs).toBeGreaterThanOrEqual(25000);
      expect(saved.restEndsAtMs).toBeGreaterThanOrEqual(now + 15000);
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
        sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }, { id: 'pending-set', tipo: 2 as const, weight: 10, reps: 8 }],
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
     press(screen.root.findAll((node) => (node.type as any) === 'HapticPressable').find((node) => String(node.props.accessibilityLabel).startsWith('Finalizar serie '))!);
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
           { id: 'pending-set', tipo: 3 as const, weight: 10, reps: 8 },
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
       .find((node) => String(node.props.accessibilityLabel).startsWith('Finalizar serie '))!);

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
    let inputs = screen.root.findAll((node) => (node.type as any) === 'GlassInput');
    changeText(inputs[0], '10');
    changeText(inputs[1], '8');
    press(screen.root.findAll((node) => (node.type as any) === 'HapticPressable').find((node) => String(node.props.accessibilityLabel).startsWith('Finalizar serie '))!);

     press(screen.root.find((node) => node.props.accessibilityLabel === 'Desplegar Press'));
     expect(screen.root.findAll((node) => (node.type as any) === 'GlassInput')).toHaveLength(0);
     press(screen.root.find((node) => node.props.accessibilityLabel === 'Editar serie 1 de Press'));
     inputs = screen.root.findAll((node) => (node.type as any) === 'GlassInput');
     expect(inputs[0].props.editable).toBe(true);
     expect(updateActiveWorkout).toHaveBeenCalledWith(expect.objectContaining({
       completedSets: { 'exercise-1-set-1': false },
     }));

     press(screen.root.find((node) => node.props.accessibilityLabel === 'Registrar esfuerzo realizado'));
     press(screen.root.find((node) => node.props.accessibilityLabel === 'RPE'));
     press(screen.root.find((node) => node.props.accessibilityLabel === 'RPE 8'));
     expect(updateActiveWorkout).toHaveBeenLastCalledWith(expect.objectContaining({
       setValues: expect.objectContaining({ 'exercise-1-set-1': expect.objectContaining({ actualEffort: { kind: 'rpe', value: 8 } }) }),
     }));

      changeText(inputs[0], '12.5');
     changeText(inputs[1], '7');
      expect(updateActiveWorkout).not.toHaveBeenLastCalledWith(expect.objectContaining({
         setValues: { 'exercise-1-set-1': { weight: '12.5', reps: '7', actualEffort: { kind: 'rpe', value: 8 } } },
       }));
      await act(async () => { inputs[1].props.onBlur(); });
      expect(updateActiveWorkout).toHaveBeenLastCalledWith(expect.objectContaining({
        setValues: { 'exercise-1-set-1': { weight: '12.5', reps: '7', actualEffort: { kind: 'rpe', value: 8 } } },
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
     press(screen.root.find((node) => node.props.accessibilityLabel === 'Registrar esfuerzo realizado'));
     press(screen.root.find((node) => node.props.accessibilityLabel === 'RIR'));
     press(screen.root.find((node) => node.props.accessibilityLabel === 'RIR 2'));

     expect(screen.root.find((node) => node.props.accessibilityLabel === 'Editar RIR 2')).toBeTruthy();
     expect(updateActiveWorkout).toHaveBeenLastCalledWith(expect.objectContaining({
       setValues: expect.objectContaining({ 'exercise-1-set-1': expect.objectContaining({ actualEffort: { kind: 'rir', value: 2 } }) }),
     }));

     press(screen.root.find((node) => node.props.accessibilityLabel === 'Editar RIR 2'));
     press(screen.root.find((node) => node.props.accessibilityLabel === 'Sin registrar'));
     expect(screen.root.find((node) => node.props.accessibilityLabel === 'Registrar esfuerzo realizado')).toBeTruthy();
   });

 });

describe('finalization recovery boundaries', () => {
  const captureRoutine = { ...routineA, exercises: [{ id: 'exercise-1', name: 'Press', muscleGroups: ['GM-101'], variant: 'Barra', sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }] }] };
  const capturedDraft = { ...draft, startedAtMs: Date.now(), routineSnapshot: captureRoutine, completedSets: { 'exercise-1-set-1': true }, setValues: { 'exercise-1-set-1': { weight: '10', reps: '8' } } };
  const receipt = { attempt: {}, receipt: { balance: 0, entries: [], weekly: {} }, experienceReceipt: undefined };
  function setup(addAttempt: ReturnType<typeof vi.fn>, updateActiveWorkout = vi.fn(async () => undefined), activeDraft: any = capturedDraft) {
    setMockParams({ id: captureRoutine.id });
    setMockData({ getRoutine: vi.fn(() => captureRoutine), routines: [captureRoutine], mesocycles: [], activeWorkoutDraft: activeDraft, addAttempt, updateActiveWorkout, startActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn() });
    return render(React.createElement(ExecuteRoutineScreen));
  }
  function finish(screen: ReturnType<typeof render>) {
    press(screen.root.find((node) => node.props.accessibilityLabel === 'Finalizar sesión'));
    press(findButton(screen.root, 'Guardar sesión'));
    const intent = mockAlert.alert.mock.calls.at(-1);
    if (intent?.[0] === 'Guardar lo realizado') act(() => { intent[2]?.find((action: { text: string; onPress?: () => void }) => action.text === 'Guardar sesión')?.onPress?.(); });
  }
  test('requires a save choice before persisting a partial workout', async () => {
    const addAttempt = vi.fn().mockResolvedValue(receipt);
    const screen = setup(addAttempt, vi.fn(async () => undefined), { ...capturedDraft, completedSets: {} });
    press(screen.root.find((node) => node.props.accessibilityLabel === 'Finalizar sesión'));
    expect(addAttempt).not.toHaveBeenCalled();
    expect(findText(screen.root, '0/1 series realizadas. Guardar conserva lo realizado; cancelar descarta este entrenamiento.')).toBeTruthy();
    press(findButton(screen.root, 'Guardar sesión'));
    await vi.waitFor(() => expect(addAttempt).toHaveBeenCalledTimes(1));
  });

  test.each(['close button', 'Android dismissal'])('closing finalization via %s leaves the workout running', (dismissal) => {
    const addAttempt = vi.fn();
    const updateActiveWorkout = vi.fn(async () => undefined);
    const screen = setup(addAttempt, updateActiveWorkout, { ...capturedDraft, completedSets: {} });
    press(screen.root.find((node) => node.props.accessibilityLabel === 'Finalizar sesión'));
    act(() => {
      if (dismissal === 'Android dismissal') screen.root.findByType('Modal' as any).props.onRequestClose();
      else screen.root.find((node) => node.props.accessibilityLabel === 'Cerrar opciones de finalización').props.onPress();
    });
    expect(screen.root.findAllByType('Modal' as any)).toHaveLength(0);
    expect(addAttempt).not.toHaveBeenCalled();
    expect(updateActiveWorkout).not.toHaveBeenCalled();
  });

  test('bounds an unresolved canonical preflight and ignores its late resolution before retry', async () => {
    vi.useFakeTimers();
    const addAttempt = vi.fn().mockResolvedValue(receipt);
    const screen = setup(addAttempt);
    await act(async () => { await Promise.resolve(); });
    let resolveLate: (value: string | null) => void = () => undefined;
    resolveJointWorkoutAttempt.mockImplementationOnce(() => new Promise((resolve) => { resolveLate = resolve; }));
    finish(screen);
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
    expect(mockAlert.alert).toHaveBeenCalledWith('No se pudo conectar', expect.any(String));
    expect(addAttempt).not.toHaveBeenCalled();
    await act(async () => { resolveLate(null); await Promise.resolve(); });
    expect(addAttempt).not.toHaveBeenCalled();
    finish(screen);
    await act(async () => { await Promise.resolve(); });
    expect(addAttempt).toHaveBeenCalledTimes(1);
  });
  test('bounds invitation presence preflight and never invites after its late resolution', async () => {
    vi.useFakeTimers();
    listActiveWorkoutInviteCandidates.mockResolvedValueOnce([{id:'bro',alias:'Bro',avatarId:'capiboy',themeId:null,relationshipKind:'bro',groupMemberCount:1}]);
    const screen=setup(vi.fn());
    await act(async () => { await Promise.resolve(); });
    listActiveWorkoutInviteCandidates.mockResolvedValueOnce([{id:'bro',alias:'Bro',avatarId:'capiboy',themeId:null,relationshipKind:'bro',groupMemberCount:1}]);
    await act(async () => { screen.root.find((node) => typeof node.props.onToggle === 'function' && Array.isArray(node.props.participants)).props.onToggle(); });
    press(screen.root.find((node) => node.props.accessibilityLabel === 'Invitar a Bro'));
    let resolveLate: () => void = () => undefined;
    publishWorkoutStartActivity.mockImplementationOnce(() => new Promise((resolve) => { resolveLate=() => resolve(undefined); }));
    press(findButton(screen.root,'Invitar a 1 persona'));
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
    expect(mockAlert.alert).toHaveBeenCalledWith('No se pudo invitar',expect.stringContaining('timed out'));
    expect(findButton(screen.root,'Invitar a 1 persona').props.disabled).toBe(false);
    await act(async () => { resolveLate(); await Promise.resolve(); });
    expect(inviteActiveWorkoutMember).not.toHaveBeenCalled();
  });
  test('does not dispatch finalization when its durable marker cannot be saved', async () => {
    const addAttempt = vi.fn();
    const screen = setup(addAttempt, vi.fn(async () => { throw new Error('offline'); }));
    finish(screen);
    await vi.waitFor(() => expect(mockAlert.alert).toHaveBeenCalled());
    expect(addAttempt).not.toHaveBeenCalled();
  });
  test.each(['network timeout', 'mesocycle CAS conflict after finalization'])('locks edits on ambiguous failure %s and retries the exact captured attempt', async (message) => {
    const addAttempt = vi.fn().mockRejectedValueOnce(new Error(message)).mockResolvedValueOnce(receipt);
    const update = vi.fn(async () => undefined);
    const screen = setup(addAttempt, update);
    finish(screen);
    await vi.waitFor(() => expect(addAttempt).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ pendingFinalization: expect.objectContaining({ attempt: expect.objectContaining({ id: draft.attemptId }) }) }));
    await vi.waitFor(() => expect(findButton(screen.root, 'Reintentar guardado')).toBeTruthy());
    expect(screen.root.findAll((node) => (node.type as any) === 'GlassInput')).toHaveLength(0);
    const captured = addAttempt.mock.calls[0][0];
    press(findButton(screen.root, 'Reintentar guardado'));
    await vi.waitFor(() => expect(addAttempt).toHaveBeenCalledTimes(2));
    expect(addAttempt.mock.calls[1][0]).toBe(captured);
  });
  test('reconciles the same attempt after a timed-out request succeeds late and clears the draft', async () => {
    vi.useFakeTimers();
    let settle: (value: typeof receipt) => void = () => undefined;
    const addAttempt = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { settle = resolve; })).mockResolvedValueOnce(receipt);
    const screen = setup(addAttempt);
    finish(screen);
    await act(async () => { await Promise.resolve(); });
    expect(addAttempt).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
    await act(async () => {
      settle(receipt);
      setMockData({ getRoutine: vi.fn(() => captureRoutine), routines: [captureRoutine], mesocycles: [], activeWorkoutDraft: null, addAttempt, updateActiveWorkout: vi.fn(async () => undefined), startActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn() });
      screen.update(React.createElement(ExecuteRoutineScreen));
    });
    expect(screen.root.findAll((node) => (node.type as any) === 'GlassButton').map((node) => node.props.title)).toContain('Reintentar guardado');
    press(findButton(screen.root, 'Reintentar guardado'));
    await act(async () => { await Promise.resolve(); });
    expect(addAttempt).toHaveBeenCalledTimes(2);
    expect(addAttempt.mock.calls[1][0]).toBe(addAttempt.mock.calls[0][0]);
  });

  test('restores a durable pending attempt as retry-only after remount', async () => {
    const { createWorkoutAttempt } = await import('../utils/workoutAttempts');
    const attempt = createWorkoutAttempt({ id: draft.attemptId, owner: 'rodaja', routine: captureRoutine, completedAt: '2026-09-08T12:00:00Z', durationSeconds: 60, restTimerSeconds: 90, results: {} });
    const addAttempt = vi.fn().mockResolvedValue(receipt);
    const screen = setup(addAttempt, vi.fn(async () => undefined), { ...capturedDraft, pendingFinalization: { attempt } });
    expect(findButton(screen.root, 'Reintentar guardado')).toBeTruthy();
    expect(screen.root.findAll((node) => (node.type as any) === 'GlassInput')).toHaveLength(0);
    press(findButton(screen.root, 'Reintentar guardado'));
    await vi.waitFor(() => expect(addAttempt).toHaveBeenCalledWith(attempt));
  });
  test('rebuilds edited results with the same ID only after definite rejection', async () => {
    const { DefinitelyRejectedFinalizationError } = await import('../services/trainingState');
    const addAttempt = vi.fn().mockRejectedValueOnce(new DefinitelyRejectedFinalizationError({ code: 'P0001', message: 'invalid training attempt input' })).mockResolvedValueOnce(receipt);
    const screen = setup(addAttempt, vi.fn(async () => undefined), { ...capturedDraft, completedSets: {} });
    finish(screen);
    await vi.waitFor(() => expect(addAttempt).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(screen.root.find((node) => node.props.accessibilityLabel === 'Finalizar sesión').props.disabled).toBe(false));
    expect(screen.root.findAll((node) => (node.type as any) === 'GlassButton' && node.props.title === 'Reintentar guardado')).toHaveLength(0);
    const inputs = screen.root.findAll((node) => (node.type as any) === 'GlassInput');
    changeText(inputs[0], '25');
    changeText(inputs[1], '12');
    const complete = screen.root.findAll((node) => typeof node.props.onPress === 'function' && node.findAll((child) => (child.type as any) === 'Text' && child.children.join('') === 'Finalizar serie').length > 0)[0];
    press(complete);
    finish(screen);
    await vi.waitFor(() => expect(addAttempt).toHaveBeenCalledTimes(2));
    expect(addAttempt.mock.calls[1][0].id).toBe(addAttempt.mock.calls[0][0].id);
    expect(addAttempt.mock.calls[1][0].exercises[0].sets[0].result.performance).toMatchObject({ load: 25, reps: 12 });
  });

  test('never thaws an ambiguous attempt after a subsequent definite rejection', async () => {
    const { DefinitelyRejectedFinalizationError } = await import('../services/trainingState');
    const addAttempt = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockRejectedValueOnce(new DefinitelyRejectedFinalizationError({ code: 'P0001', message: 'invalid training attempt input' }));
    const screen = setup(addAttempt);
    finish(screen);
    await vi.waitFor(() => expect(findButton(screen.root, 'Reintentar guardado')?.props.disabled).toBe(false));
    press(findButton(screen.root, 'Reintentar guardado'));
    await vi.waitFor(() => expect(addAttempt).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(findButton(screen.root, 'Reintentar guardado')?.props.disabled).toBe(false));
    expect(screen.root.findAll((node) => (node.type as any) === 'GlassInput')).toHaveLength(0);
    expect(addAttempt.mock.calls[1][0]).toBe(addAttempt.mock.calls[0][0]);
  });

  test('keeps unresolved finalization through expiration and missing plan cleanup', async () => {
    const { createWorkoutAttempt } = await import('../utils/workoutAttempts');
    const { reconcileActiveWorkoutTiming } = await import('../utils/activeWorkoutTiming');
    const attempt = createWorkoutAttempt({ id: draft.attemptId, owner: 'rodaja', routine: captureRoutine, completedAt: '2026-09-08T12:00:00Z', durationSeconds: 60, restTimerSeconds: 90, results: {} });
    const pending = { ...capturedDraft, pendingFinalization: { attempt } };
    expect(reconcileActiveWorkoutTiming(pending, Date.now() + 24 * 3600_000)).toMatchObject({ cleanup: 'none', elapsedSeconds: 60 });
    expect(hasActiveWorkoutReentryIntegrity(pending, [], [])).toBe(true);
  });

});


describe('planned workout continuity', () => {
  test.each([[false, false], [true, false], [false, true]])('seeds new draft with rest edit=%s and future adjustment=%s', async (editRest, adjusted) => {
    const routine: Routine = { ...routineA, exercises: [{ id: 'e', catalogExerciseId: 'catalog', name: 'Press', variant: 'bar', muscleGroups: [], loadMode: 'external-load', loadUnit: 'kg', sets: [{ id: 's', tipo: 1, weight: 20, reps: 8 }] }] };
    const entry = (id: string) => ({ id, ref: { routineId: routine.id, routineName: routine.name, source: 'local' as const }, routineSnapshot: routine, order: 1 });
    const block = { ...mesocycle, weeks: [{ id: 'w', weekNumber: 1, entries: [entry('before'), entry('target')] }] };
    if (adjusted) { block.weeks[0].entries[1].routineSnapshot = structuredClone(routine); block.weeks[0].entries[1].routineSnapshot.exercises[0].sets[0].weight = 12; }
    const attempt = createWorkoutAttempt({ id: 'previous', owner: 'rodaja', routine, completedAt: '2026-01-01', durationSeconds: 300, restTimerSeconds: 120, lineage: { ...lineage, plannedSessionId: 'before' }, results: { 'e:s': { performed: true, load: 25, reps: 10 } } });
    const startActiveWorkout = vi.fn(async (_draft: ActiveWorkoutDraft) => undefined);
    const data = { getRoutine: () => routine, routines: [routine], mesocycles: [block], attempts: [attempt], activeWorkoutDraft: null, startActiveWorkout, updateActiveWorkout: vi.fn(async () => undefined), addAttempt: vi.fn(), cancelActiveWorkout: vi.fn() };
    setMockParams({ id: routine.id, mesocycleId: block.id, weekNumber: '1', plannedSessionId: 'target' });
    setMockData(data);
    const screen = render(React.createElement(ExecuteRoutineScreen));
    if (editRest) changeText(screen.root.findByType('GlassInput' as any), '45');
    press(findButton(screen.root, 'Iniciar entrenamiento'));
    await vi.waitFor(() => expect(startActiveWorkout).toHaveBeenCalledTimes(1));
    const saved = startActiveWorkout.mock.calls[0][0] as any;
    expect(saved).toMatchObject({ completedSets: {}, restTimerSeconds: editRest ? 45 : adjusted ? 90 : 120, setValues: { 'e-s': { weight: adjusted ? '12' : '25', reps: adjusted ? '8' : '10' } } });
    expect(saved.attemptId).not.toBe(attempt.id);
    expect(saved.routineSnapshot.exercises[0].sets[0]).toMatchObject({ weight: adjusted ? 12 : 20, reps: 8 });
    expect(routine.exercises[0].sets[0].weight).toBe(20);
    setMockData({ ...data, activeWorkoutDraft: saved });
    await act(async () => { screen.update(React.createElement(ExecuteRoutineScreen)); });
    expect(findText(screen.root, editRest ? '00:45' : adjusted ? '01:30' : '02:00')).toBeTruthy();
    // A persisted draft owns its inputs, even if history changes before reentry.
    resetRuntimeHarness(); setMockParams({ id: routine.id, mesocycleId: block.id, weekNumber: '1', plannedSessionId: 'target' });
    setMockData({ ...data, activeWorkoutDraft: { ...saved, startedAtMs: Date.now(), setValues: { 'e-s': { weight: '31', reps: '11' } }, restTimerSeconds: 60 } });
    const resumed = render(React.createElement(ExecuteRoutineScreen));
    expect(resumed.root.find((node) => node.props.accessibilityLabel === 'Press, serie 1, carga en kg').props.value).toBe('31');
    act(() => resumed.update(React.createElement(ExecuteRoutineScreen)));
    expect(resumed.root.find((node) => node.props.accessibilityLabel === 'Press, serie 1, repeticiones').props.value).toBe('11');
  });
});

describe('individual series inputs', () => {
  function setup() {
    const routine: Routine = { ...routineA, exercises: [{ id: 'e', name: 'Press', variant: 'bar', muscleGroups: [], loadMode: 'external-load', loadUnit: 'kg', sets: [1, 2, 3].map((tipo) => ({ id: String(tipo), tipo, weight: 20, reps: 8 })) }] };
    const active: ActiveWorkoutDraft = { ...draft, startedAtMs: Date.now(), routineSnapshot: routine, completedSets: { 'e-1': true }, setValues: { 'e-1': { weight: '25', reps: '10' }, 'e-2': { weight: '22', reps: '8' }, 'e-3': { weight: '15', reps: '12' } } };
    const updateActiveWorkout = vi.fn(async (_draft: ActiveWorkoutDraft) => undefined);
    const data = { getRoutine: () => routine, routines: [routine], mesocycles: [], attempts: [], activeWorkoutDraft: active, updateActiveWorkout, startActiveWorkout: vi.fn(), cancelActiveWorkout: vi.fn(), addAttempt: vi.fn() };
    setMockParams({ id: routine.id }); setMockData(data);
    const screen = render(React.createElement(ExecuteRoutineScreen));
    const button = (label: string) => screen.root.find((node) => node.props.accessibilityLabel === label);
    return { routine, active, data, screen, button, updateActiveWorkout };
  }
  test('removes both copy controls and edits only the selected series', async () => {
    const f = setup();
    expect(f.screen.root.findAll((node) => /Copiar serie|Aplicar carga/.test(node.props.accessibilityLabel ?? ''))).toHaveLength(0);
    changeText(f.button('Press, serie 2, carga en kg'), '30');
    expect(f.button('Press, serie 3, carga en kg').props.value).toBe('15');
    press(f.button('Finalizar serie 2 de Press'));
    await vi.waitFor(() => expect(f.updateActiveWorkout).toHaveBeenCalled());
    const saved = f.updateActiveWorkout.mock.calls.at(-1)![0];
    expect(saved.setValues['e-2'].weight).toBe('30');
    expect(saved.setValues['e-3']).toEqual({ weight: '15', reps: '12' });
    expect(saved.completedSets['e-2']).toBe(true);
  });
});

describe('cross-device execution handoff', () => {
  test('routes to the canonical existing routine without publishing the losing start', async () => {
    const canonical: ActiveWorkoutDraft = { ...draft, routineId: routineB.id, routineSnapshot: routineB, startedAtMs: Date.now() };
    const startActiveWorkout = vi.fn(async () => canonical);
    setMockParams({ id: routineA.id });
    setMockData({ getRoutine: () => routineA, routines: [routineA], mesocycles: [], attempts: [], activeWorkoutDraft: null, startActiveWorkout, updateActiveWorkout: vi.fn(), addAttempt: vi.fn(), cancelActiveWorkout: vi.fn() });
    const screen = render(React.createElement(ExecuteRoutineScreen));
    press(findButton(screen.root, 'Iniciar entrenamiento'));
    await vi.waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/routine/execute/[id]', params: { id: routineB.id } }));
    expect(publishWorkoutStartActivity).not.toHaveBeenCalled();
  });

  test('already-open execution adopts remote inputs when canonical revision advances', async () => {
    const routine: Routine = { ...routineA, exercises: [{ id: 'e', name: 'Press', variant: 'bar', muscleGroups: [], loadMode: 'external-load', loadUnit: 'kg', sets: [{ id: 's', tipo: 1, weight: 20, reps: 8 }] }] };
    const active: ActiveWorkoutDraft = { ...draft, routineSnapshot: routine, startedAtMs: Date.now(), setValues: { 'e-s': { weight: '20', reps: '8' } } };
    const data = { getRoutine: () => routine, routines: [routine], mesocycles: [], attempts: [], activeWorkoutDraft: active, activeWorkoutRemoteRevision: 0, startActiveWorkout: vi.fn(), updateActiveWorkout: vi.fn(), addAttempt: vi.fn(), cancelActiveWorkout: vi.fn() };
    setMockParams({ id: routine.id });
    setMockData(data);
    const screen = render(React.createElement(ExecuteRoutineScreen));
    expect(screen.root.find((node) => node.props.accessibilityLabel === 'Press, serie 1, carga en kg').props.value).toBe('20');
    setMockData({ ...data, activeWorkoutRemoteRevision: 1, activeWorkoutDraft: { ...active, setValues: { 'e-s': { weight: '32', reps: '9' } } } });
    await act(async () => screen.update(React.createElement(ExecuteRoutineScreen)));
    expect(screen.root.find((node) => node.props.accessibilityLabel === 'Press, serie 1, carga en kg').props.value).toBe('32');
    expect(screen.root.find((node) => node.props.accessibilityLabel === 'Press, serie 1, repeticiones').props.value).toBe('9');
  });
});
