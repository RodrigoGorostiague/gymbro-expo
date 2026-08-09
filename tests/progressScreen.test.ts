import React from 'react';
import { beforeEach, describe, expect, test } from 'vitest';
import { press, render, resetRuntimeHarness, setMockData } from './helpers/runtimeHarness';
import { router } from './helpers/expoRouterStub';
import ProgressScreen from '../app/(tabs)/progress';

describe('ProgressScreen history', () => {
  beforeEach(() => {
    resetRuntimeHarness();
    setMockData({
      exercises: [], routines: [], attempts: [], experienceProgress: null,
      sessions: [{ id: 'session-1', routineId: 'routine-1', routineName: 'Upper', completedAt: '2026-08-08T12:00:00Z', durationSeconds: 1800, restTimerSeconds: 0, exercises: [] }],
      quarantinedSessionCount: 0, resolveQuarantine: () => undefined,
      dataState: 'ready', dataError: null, retryData: () => undefined, catalogMuscleGroups: [],
    });
  });

  test('renders a historical session with Pressable navigation instead of HapticPressable', () => {
    const screen = render(React.createElement(ProgressScreen));
    const row = screen.root.find((node) => node.props.accessibilityLabel === 'Editar la sesión de entrenamiento Upper');

    expect(screen.root.findAll((node) => String(node.type) === 'HapticPressable'
      && node.props.accessibilityLabel === 'Editar la sesión de entrenamiento Upper')).toHaveLength(0);
    press(row);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/session/[id]', params: { id: 'session-1' } });
  });
});
