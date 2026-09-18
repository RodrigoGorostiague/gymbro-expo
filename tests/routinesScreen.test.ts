import React from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import { beforeEach, describe, expect, test } from 'vitest';
import { mockRouter, press, render, resetRuntimeHarness, setMockData } from './helpers/runtimeHarness';
import RoutinesScreen from '../app/(tabs)/routines';

const routine = {
  id: 'routine-1',
  name: 'Upper',
  muscleGroups: ['back'],
  exercises: [],
  createdAt: '2026-08-15T12:00:00.000Z',
};

const sharedRoutine = {
  ...routine,
  id: 'routine-shared',
  name: 'Partner upper',
  sharedFrom: {
    requestId: 'request-1',
    senderId: 'brisas',
    acceptedAt: '2026-08-15T13:00:00.000Z',
  },
};

function expectNoPressableAncestor(control: ReactTestInstance) {
  let ancestor = control.parent;
  while (ancestor) {
    expect(ancestor.type).not.toBe('HapticPressable');
    ancestor = ancestor.parent;
  }
}

describe('RoutinesScreen', () => {
  beforeEach(() => {
    resetRuntimeHarness();
    setMockData({
      routines: [routine],
      deleteRoutine: async () => undefined,
      activeWorkoutDraft: null,
      catalogMuscleGroups: [],
    });
  });

  test('renders independent routine card controls', () => {
    const screen = render(React.createElement(RoutinesScreen));
    const detail = screen.root.find((node) => node.props.accessibilityLabel === 'Ver rutina Upper');
    const train = screen.root.find((node) => node.props.accessibilityLabel === 'Entrenar Upper');
    const remove = screen.root.find((node) => node.props.accessibilityLabel === 'Eliminar Upper');

    expectNoPressableAncestor(train);
    expectNoPressableAncestor(remove);

    press(detail);
    expect(mockRouter.push).toHaveBeenCalledWith('/routine/routine-1');

    press(train);
    expect(mockRouter.push).toHaveBeenCalledWith('/routine/execute/routine-1');
  });

  test('renders shared routines only after expanding their section', () => {
    setMockData({
      routines: [routine, sharedRoutine],
      deleteRoutine: async () => undefined,
      activeWorkoutDraft: null,
      catalogMuscleGroups: [],
    });

    const screen = render(React.createElement(RoutinesScreen));

    expect(screen.root.findAll((node) => node.props.accessibilityLabel === 'Ver rutina Partner upper')).toHaveLength(0);

    press(screen.root.find((node) => node.props.accessibilityLabel === 'Mostrar Compartidas conmigo'));

    const detail = screen.root.find((node) => node.props.accessibilityLabel === 'Ver rutina Partner upper');
    press(detail);

    expect(mockRouter.push).toHaveBeenCalledWith('/routine/routine-shared');
  });
});
