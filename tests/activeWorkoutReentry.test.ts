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

vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: 'rodaja', welcomeMessage: null, setWelcomeMessage: vi.fn() }) }));
vi.mock('../context/ShopContext', () => ({ useShop: () => ({ retryPendingRewards: vi.fn() }) }));
vi.mock('../components/LogoutButton', () => ({ LogoutButton: () => null }));

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
       expect(lists[0].props.contentContainerStyle).toEqual(expect.objectContaining({ paddingBottom: 120 }));
       expect(lists[0].props.stickyHeaderIndices).toBeUndefined();
       expect(lists[0].props.stickyHeaderHiddenOnScroll).toBeUndefined();
       expect(lists[0].props.StickyHeaderComponent).toBeUndefined();
       expect(findText(screen.root, 'Tiempo')).toBeTruthy();
       expect(findText(screen.root, 'Descanso')).toBeTruthy();
       expect(findText(screen.root, 'Series: 0/1')).toBeTruthy();
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

    test('releases the pause control when persistence times out so the athlete can retry without remounting', async () => {
      vi.useFakeTimers();
      const routineWithSet = {
        ...routineA,
        exercises: [{ id: 'exercise-1', name: 'Press', muscleGroups: ['pecho'], variant: 'bar', sets: [{ id: 'set-1', tipo: 1 as const, weight: 10, reps: 8 }] }],
      };
      const updateActiveWorkout = vi.fn(() => new Promise<void>(() => undefined));
      setMockParams({ id: routineWithSet.id });
      setMockData({
        getRoutine: vi.fn(() => routineWithSet), mesocycles: [], exercises: [], definitions: [],
        activeWorkoutDraft: { ...draft, routineId: routineWithSet.id }, addAttempt: vi.fn(), startActiveWorkout: vi.fn(),
        updateActiveWorkout, cancelActiveWorkout: vi.fn(), refreshActiveWorkoutTiming: vi.fn(),
      });

      const screen = render(React.createElement(ExecuteRoutineScreen));
      const pause = () => screen.root.find((node) => node.props.accessibilityLabel === 'Pausar entrenamiento');
      press(pause());
      await act(async () => { vi.advanceTimersByTime(12_000); });
      expect(mockAlert.alert).toHaveBeenCalledWith('No se pudo pausar', expect.stringContaining('timed out'));

      const callsBeforeRetry = updateActiveWorkout.mock.calls.length;
      press(pause());
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

    test('reopens a completed set so its values and intensity can be corrected and reconfirmed', () => {
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
      expect(updateActiveWorkout).toHaveBeenLastCalledWith(expect.objectContaining({
        setValues: { 'exercise-1-set-1': { weight: '12.5', reps: '7' } },
      }));
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
      const warmupButtons = screen.root.findAll((node) => (node.type as any) === 'HapticPressable' && node.props.accessibilityLabel === 'Calentamiento');
      expect(warmupButtons).toHaveLength(1);
      press(warmupButtons[0]);
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
