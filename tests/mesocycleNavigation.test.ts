import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  findButton,
  findButtons,
  findText,
  findTextsContaining,
  mockRouter,
  press,
  render,
  resetRuntimeHarness,
  setMockData,
  setMockParams,
} from './helpers/runtimeHarness';
import MesocyclesScreen from '../app/(tabs)/mesocycles';
import MesocycleDetailScreen from '../app/mesocycle/[id]';
import MesocycleSummaryScreen from '../app/mesocycle/summary/[id]';

const buildMesocycle = () => ({
  id: 'mesocycle-1',
  name: 'Hypertrophy Block',
  goal: 'Build work capacity',
  status: 'draft' as const,
  durationWeeks: 2,
  startDate: '2026-07-28',
  createdAt: '2026-07-26T10:00:00.000Z',
  weeks: [
    {
      id: 'week-1',
      weekNumber: 1,
      sessions: [
        {
          id: 'session-1',
          ref: { routineId: 'routine-1', routineName: 'Upper A', source: 'local' as const },
          order: 1,
          dayLabel: 'Monday',
          progressionNote: 'Add one rep',
          note: 'RPE 8',
        },
      ],
    },
    {
      id: 'week-2',
      weekNumber: 2,
      sessions: [],
    },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  resetRuntimeHarness();
});

describe('mesocycle navigation contract', () => {
  test('opens the summary-first flow from empty and populated mesocycle entry points', () => {
    setMockData({ mesocycles: [], deleteMesocycle: vi.fn() });

    const emptyScreen = render(React.createElement(MesocyclesScreen));
    press(findButton(emptyScreen.root, 'Crear mi primer mesociclo'));
    expect(mockRouter.push).toHaveBeenCalledWith('/mesocycle/create');

    const mesocycle = buildMesocycle();
    setMockData({ mesocycles: [mesocycle], deleteMesocycle: vi.fn() });
    const listScreen = render(React.createElement(MesocyclesScreen));
    press(findButton(listScreen.root, 'Abrir'));

    expect(mockRouter.push).toHaveBeenCalledWith('/mesocycle/summary/mesocycle-1');
  });

  test('renders the summary screen overview and hands off explicitly to the editor', () => {
    const mesocycle = buildMesocycle();
    setMockParams({ id: 'mesocycle-1' });
    setMockData({
      getMesocycle: vi.fn(() => mesocycle),
      resolvePlannedRoutine: vi.fn(() => ({ id: 'routine-1' })),
    });

    const screen = render(React.createElement(MesocycleSummaryScreen));

    expect(findText(screen.root, 'Hypertrophy Block')).toBeTruthy();
    expect(findText(screen.root, 'Resumen del mesociclo')).toBeTruthy();
    expect(findText(screen.root, 'Vista general')).toBeTruthy();
    expect(findTextsContaining(screen.root, 'Objetivo: Build work capacity')).toHaveLength(1);
    expect(findTextsContaining(screen.root, 'Semana 1')).toHaveLength(1);
    expect(findTextsContaining(screen.root, 'Semana 2')).toHaveLength(1);
    expect(findTextsContaining(screen.root, 'Upper A')).toHaveLength(1);

    press(findButton(screen.root, 'Ejecutar rutina'));
    expect(mockRouter.push).toHaveBeenCalledWith('/routine/execute/routine-1');

    press(findButton(screen.root, 'Editar mesociclo'));
    expect(mockRouter.push).toHaveBeenCalledWith('/mesocycle/mesocycle-1');
  });

  test('keeps unresolved summary routines blocked with Spanish recovery copy', () => {
    const mesocycle = buildMesocycle();
    setMockParams({ id: 'mesocycle-1' });
    setMockData({
      getMesocycle: vi.fn(() => mesocycle),
      resolvePlannedRoutine: vi.fn(() => undefined),
    });

    const screen = render(React.createElement(MesocycleSummaryScreen));

    expect(findTextsContaining(screen.root, 'Rutina no disponible')).toHaveLength(1);
    expect(findTextsContaining(screen.root, 'Esta rutina ya no está disponible para ejecutar desde este resumen.')).toHaveLength(1);
    expect(findButtons(screen.root, 'Ejecutar rutina')[0].props.disabled).toBe(true);
  });

  test('keeps invalid-id fallbacks recoverable on the summary screen', () => {
    setMockParams({ id: 'missing' });
    setMockData({
      getMesocycle: vi.fn(() => undefined),
      resolvePlannedRoutine: vi.fn(),
    });

    const screen = render(React.createElement(MesocycleSummaryScreen));

    expect(findText(screen.root, 'No encontramos este mesociclo')).toBeTruthy();
    press(findButton(screen.root, 'Volver a mesociclos'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/mesocycles');
  });

  test('blocks previous-week copy without source sessions and keeps unresolved sessions visible', () => {
    const detailMesocycle = {
      ...buildMesocycle(),
      weeks: [
        { id: 'week-1', weekNumber: 1, sessions: [] },
        {
          id: 'week-2',
          weekNumber: 2,
          sessions: [
            {
              id: 'session-2',
              ref: { routineId: 'routine-missing', routineName: 'Missing Routine', source: 'local' as const },
              order: 1,
            },
          ],
        },
      ],
    };

    setMockParams({ id: 'mesocycle-1' });
    setMockData({
      getMesocycle: vi.fn(() => detailMesocycle),
      resolvePlannedRoutine: vi.fn(() => undefined),
      routines: [],
      updateMesocycle: vi.fn(),
    });

    const screen = render(React.createElement(MesocycleDetailScreen));

    expect(findTextsContaining(screen.root, 'No hay sesiones en la semana anterior para copiar todavía.')).toHaveLength(1);
    expect(findButtons(screen.root, 'Copiar semana anterior')[0].props.disabled).toBe(true);
    expect(findTextsContaining(screen.root, 'Rutina no disponible')).toHaveLength(1);
    expect(findTextsContaining(screen.root, 'Esta referencia sigue visible para que puedas reasignarla sin perder la planificación.')).toHaveLength(1);
    expect(findButtons(screen.root, 'Ejecutar rutina')[0].props.disabled).toBe(true);
  });

  test('copies the previous week through the runtime detail flow and saves fresh session ids', async () => {
    const updateMesocycle = vi.fn(async () => undefined);
    const mesocycle = buildMesocycle();

    setMockParams({ id: 'mesocycle-1' });
    setMockData({
      getMesocycle: vi.fn(() => mesocycle),
      resolvePlannedRoutine: vi.fn(() => ({ id: 'routine-1', isShared: false })),
      routines: [{ id: 'routine-1', name: 'Upper A', exercises: [] }],
      updateMesocycle,
    });

    const screen = render(React.createElement(MesocycleDetailScreen));

    press(findButton(screen.root, 'Copiar semana anterior'));
    expect(findTextsContaining(screen.root, 'Upper A')).toHaveLength(2);

    await Promise.resolve(findButton(screen.root, 'Guardar planificación').props.onPress());

    expect(updateMesocycle).toHaveBeenCalledWith(
      expect.objectContaining({
        weeks: expect.arrayContaining([
          expect.objectContaining({
            weekNumber: 2,
            sessions: [expect.objectContaining({
              id: expect.not.stringMatching(/^session-1$/),
              order: 1,
              dayLabel: 'Monday',
              progressionNote: 'Add one rep',
              note: 'RPE 8',
              ref: expect.objectContaining({ routineId: 'routine-1', routineName: 'Upper A', source: 'local' }),
            })],
          }),
        ]),
      }),
    );
    screen.unmount();
  });

  test('keeps invalid editor ids recoverable', () => {
    setMockParams({ id: 'missing' });
    setMockData({
      getMesocycle: vi.fn(() => undefined),
      resolvePlannedRoutine: vi.fn(),
      routines: [],
      updateMesocycle: vi.fn(),
    });

    const screen = render(React.createElement(MesocycleDetailScreen));
    expect(findText(screen.root, 'No encontramos este mesociclo')).toBeTruthy();
    press(findButton(screen.root, 'Volver a mesociclos'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/mesocycles');
  });
});
