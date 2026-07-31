import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { changeText, findButton, findText, mockRouter, press, render, resetRuntimeHarness, setMockData, setMockParams } from './helpers/runtimeHarness';
import CreateMesocycleScreen from '../app/mesocycle/create';
import MesocycleDetailScreen from '../app/mesocycle/[id]';
import MesocycleSummaryScreen from '../app/mesocycle/summary/[id]';
import { deriveFirstEntryStartDate } from '../utils/mesocycles';
const subject = { id: 'mesocycle-1', name: 'Block', goal: '', status: 'active' as const, durationWeeks: 1, startDate: '2026-07-26', createdAt: '', weeks: [{ id: 'week-1', weekNumber: 1, entries: [{ id: 'entry-1', ref: { routineId: 'routine-1', routineName: 'Upper', source: 'local' as const }, order: 1 }, { id: 'rest-1', kind: 'rest' as const }] }] };
const routine = { id: 'routine-1', name: 'Upper', muscleGroups: ['Pecho', 'Espalda'], exercises: [{ id: 'exercise-1', name: 'Press', sets: [] }, { id: 'exercise-2', name: 'Remo', sets: [] }], createdAt: '' };
beforeEach(() => { vi.clearAllMocks(); vi.setSystemTime(new Date(2026, 6, 26, 12)); resetRuntimeHarness(); setMockParams({ id: 'mesocycle-1' }); });
describe('mesocycle entry navigation', () => {
  test('passes entry lineage to routine execution', () => { setMockData({ getMesocycle: vi.fn(() => subject), routines: [routine], attempts: [], resolvePlannedRoutine: vi.fn(() => ({ id: 'routine-1' })) }); const screen = render(React.createElement(MesocycleSummaryScreen)); const [play] = screen.root.findAll((node) => node.props.accessibilityLabel === 'Ejecutar Upper'); press(play); expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/routine/execute/[id]', params: { id: 'routine-1', mesocycleId: 'mesocycle-1', weekNumber: '1', plannedSessionId: 'entry-1' } }); });
  test('renders rest without an execute CTA', () => { setMockData({ getMesocycle: vi.fn(() => subject), routines: [routine], attempts: [], resolvePlannedRoutine: vi.fn(() => ({ id: 'routine-1' })) }); const screen = render(React.createElement(MesocycleSummaryScreen)); expect(findText(screen.root, 'Día de descanso')).toBeTruthy(); });
});

describe('mesocycle first-entry start date', () => {
  const today = new Date(2026, 6, 28, 9);

  test('derives a local-civil date for routine or rest and omits it when empty', () => {
    expect(deriveFirstEntryStartDate([subject.weeks[0].entries[0]], today)).toBe('2026-07-28');
    expect(deriveFirstEntryStartDate([{ id: 'rest-1', kind: 'rest' }], today)).toBe('2026-07-28');
    expect(deriveFirstEntryStartDate([], today)).toBeUndefined();
  });
});

describe('mesocycle creation schedule selection', () => {
  test('creates a first-week routine or rest entry with its derived start date', async () => {
    const addMesocycle = vi.fn(async (value) => ({ ...value, id: 'created' }));
    setMockData({ routines: [routine], addMesocycle });
    const screen = render(React.createElement(CreateMesocycleScreen));

    changeText(screen.root.findAll((node) => (node.type as any) === 'GlassInput')[0], 'New block');
    press(screen.root.find((node) => node.props.accessibilityLabel === 'Programar Upper'));
    press(findButton(screen.root, 'Crear mesociclo'));

    await vi.waitFor(() => expect(addMesocycle).toHaveBeenCalled());
    expect(addMesocycle.mock.calls[0][0].startDate).toBe('2026-07-26');
    expect(addMesocycle.mock.calls[0][0].weeks[0].entries[0]).toMatchObject({
      ref: { routineId: 'routine-1', routineName: 'Upper', source: 'local' },
    });

    resetRuntimeHarness();
    const addRestMesocycle = vi.fn(async (value) => ({ ...value, id: 'rest-created' }));
    setMockData({ routines: [routine], addMesocycle: addRestMesocycle });
    const restScreen = render(React.createElement(CreateMesocycleScreen));
    changeText(restScreen.root.findAll((node) => (node.type as any) === 'GlassInput')[0], 'Rest block');
    press(restScreen.root.find((node) => node.props.accessibilityLabel === 'Programar descanso'));
    press(findButton(restScreen.root, 'Crear mesociclo'));
    await vi.waitFor(() => expect(addRestMesocycle).toHaveBeenCalled());
    expect(addRestMesocycle.mock.calls[0][0].weeks[0].entries[0]).toMatchObject({ kind: 'rest' });
    expect(addRestMesocycle.mock.calls[0][0].startDate).toBe('2026-07-26');
  });
});

describe('mesocycle edit schedule selection', () => {
  test('persists a selected routine with a derived first-entry date', async () => {
    const updateMesocycle = vi.fn(async (_value: any) => undefined);
    const empty = { ...subject, startDate: undefined, weeks: [{ ...subject.weeks[0], entries: [] }] };
    setMockData({ getMesocycle: vi.fn(() => empty), routines: [routine], attempts: [], updateMesocycle });
    const screen = render(React.createElement(MesocycleDetailScreen));

    press(findButton(screen.root, 'Agregar rutina'));
    const choice = screen.root.find((node) => node.props.accessibilityLabel === 'Programar Upper');
    expect(choice.props.accessibilityState).toEqual({ selected: false });
    press(choice);
    press(findButton(screen.root, 'Guardar planificación'));

    await vi.waitFor(() => expect(updateMesocycle).toHaveBeenCalled());
    const saved = updateMesocycle.mock.calls[0]![0];
    expect(saved).toMatchObject({ startDate: '2026-07-26' });
    expect(saved.weeks[0].entries[0]).toMatchObject({ ref: { routineId: 'routine-1' } });
  });
});

describe('mesocycle schedule presentation', () => {
  test('shows dated routine context and an accessible compact remove action in the editor', () => {
    const updateMesocycle = vi.fn();
    setMockData({ getMesocycle: vi.fn(() => subject), routines: [routine], attempts: [], updateMesocycle, resolvePlannedRoutine: vi.fn(() => routine) });
    const screen = render(React.createElement(MesocycleDetailScreen));
    expect(findText(screen.root, 'domingo · 26 de julio')).toBeTruthy();
    expect(findText(screen.root, 'Pecho · Espalda · 2 ejercicios')).toBeTruthy();
    const remove = screen.root.find((node) => node.props.accessibilityLabel === 'Quitar Upper del plan');
    expect(remove.props.accessibilityHint).toBe('Elimina esta entrada sin cambiar el orden de las demás.');
    press(remove);
    expect(findText(screen.root, 'Upper')).toBeUndefined();
  });

  test('keeps an unavailable routine visible in the editor', () => {
    setMockData({ getMesocycle: vi.fn(() => subject), routines: [], attempts: [], updateMesocycle: vi.fn(), resolvePlannedRoutine: vi.fn(() => undefined) });
    const screen = render(React.createElement(MesocycleDetailScreen));
    expect(findText(screen.root, 'Rutina no disponible')).toBeTruthy();
  });

  test('uses the shared sparse-week projection label in the editor', () => {
    const sparseWeekTwo = {
      ...subject,
      durationWeeks: 2,
      weeks: [
        { id: 'week-1', weekNumber: 1, entries: [] },
        { id: 'week-2', weekNumber: 2, entries: [subject.weeks[0].entries[0]] },
      ],
    };
    setMockData({ getMesocycle: vi.fn(() => sparseWeekTwo), routines: [routine], attempts: [], updateMesocycle: vi.fn() });

    const screen = render(React.createElement(MesocycleDetailScreen));

    expect(findText(screen.root, 'domingo · 2 de agosto')).toBeTruthy();
  });

  test('renders routine progress and an accessible play action for a 70% partial attempt', () => {
    const attempt = { id: 'attempt-1', owner: 'rodaja', routineId: 'routine-1', recordedRoutineName: 'Upper', completedAt: '2026-07-26T10:00:00.000Z', durationSeconds: 0, restTimerSeconds: 0, version: 1 as const, lineage: { mesocycleId: 'mesocycle-1', weekNumber: 1, plannedSessionId: 'entry-1' }, exercises: [{ sets: [{ result: { performed: true, performance: { mode: 'bodyweight', reps: 10, bodyweight: 70, unit: 'kg' } } }] }, { sets: [{ result: { performed: false } }] }], completion: { status: 'completed' as const, displayPercent: 70 }, reward: { earnedXp: 0, earnedCoins: 0 }, rewardApplication: { status: 'not-applied' as const } };
    setMockData({ getMesocycle: vi.fn(() => subject), routines: [routine], attempts: [attempt], resolvePlannedRoutine: vi.fn(() => routine) });
    const screen = render(React.createElement(MesocycleSummaryScreen));
    expect(findText(screen.root, 'Ejercicios: 1/2')).toBeTruthy();
    expect(findText(screen.root, 'Series válidas: 1/2')).toBeTruthy();
    const [play] = screen.root.findAll((node) => node.props.accessibilityLabel === 'Ejecutar Upper');
    expect(play.props.accessibilityHint).toBe('Abre la rutina programada para esta sesión.');
    press(play);
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/routine/execute/[id]', params: { id: 'routine-1', mesocycleId: 'mesocycle-1', weekNumber: '1', plannedSessionId: 'entry-1' } });
  });

  test('styles rest guidance and suppresses play only for a fully completed routine', () => {
    const attempt = { id: 'attempt-1', owner: 'rodaja', routineId: 'routine-1', recordedRoutineName: 'Upper', completedAt: '2026-07-26T10:00:00.000Z', durationSeconds: 0, restTimerSeconds: 0, version: 1 as const, lineage: { mesocycleId: 'mesocycle-1', weekNumber: 1, plannedSessionId: 'entry-1' }, exercises: [], completion: { status: 'fully-completed' as const, displayPercent: 100 }, reward: { earnedXp: 0, earnedCoins: 0 }, rewardApplication: { status: 'not-applied' as const } };
    setMockData({ getMesocycle: vi.fn(() => subject), routines: [routine], attempts: [attempt], resolvePlannedRoutine: vi.fn(() => routine) });
    const screen = render(React.createElement(MesocycleSummaryScreen));
    expect(findText(screen.root, 'Día de descanso')).toBeTruthy();
    expect(screen.root.findAll((node) => node.props.accessibilityLabel === 'Ejecutar Upper')).toHaveLength(0);
  });

  test('keeps unavailable routine cards visible without a play action', () => {
    setMockData({ getMesocycle: vi.fn(() => subject), routines: [], attempts: [], resolvePlannedRoutine: vi.fn(() => undefined) });

    const screen = render(React.createElement(MesocycleSummaryScreen));

    expect(findText(screen.root, 'Rutina no disponible')).toBeTruthy();
    expect(screen.root.findAll((node) => node.props.accessibilityLabel === 'Ejecutar Upper')).toHaveLength(0);
  });

  test('renders dated temporal recovery guidance without routine actions on rest entries', () => {
    const restToday = {
      ...subject,
      weeks: [{
        ...subject.weeks[0],
        entries: [{ id: 'rest-today', kind: 'rest' as const }],
      }],
    };
    setMockData({ getMesocycle: vi.fn(() => restToday), routines: [], attempts: [], resolvePlannedRoutine: vi.fn() });

    const screen = render(React.createElement(MesocycleSummaryScreen));

    expect(findText(screen.root, 'domingo · 26 de julio')).toBeTruthy();
    expect(findText(screen.root, 'Hoy es un día de recuperación.')).toBeTruthy();
    expect(screen.root.findAll((node) => node.props.accessibilityRole === 'button')).toHaveLength(0);
  });
});
