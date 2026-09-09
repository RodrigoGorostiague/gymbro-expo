import React from 'react';
import { act } from 'react-test-renderer';
import { FlatList } from 'react-native';
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
    const row = screen.root.find((node) => node.props.accessibilityLabel === 'Ver el entrenamiento Upper');

    expect(screen.root.findAll((node) => String(node.type) === 'HapticPressable'
      && node.props.accessibilityLabel === 'Ver el entrenamiento Upper')).toHaveLength(0);
    press(row);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/session/recap/[id]', params: { id: 'session-1' } });
  });
});

test('history filters the virtualized list without removing its analytics header', () => {
  resetRuntimeHarness();
  const session = { routineId: 'r', durationSeconds: 600, restTimerSeconds: 0, exercises: [] };
  setMockData({ exercises: [], routines: [], attempts: [], experienceProgress: null, sessions: [
    { ...session, id: 'upper', routineName: 'Upper', completedAt: '2026-08-08T12:00:00Z' },
    { ...session, id: 'lower', routineName: 'Lower', completedAt: '2026-08-09T12:00:00Z' },
  ], catalogMuscleGroups: [], quarantinedSessionCount: 0, dataState: 'ready' });
  const screen = render(React.createElement(ProgressScreen));
  const list = () => screen.root.findByType(FlatList);
  expect(list().props.data.map((item: any) => item.id)).toEqual(['lower', 'upper']);
  const input = screen.root.find((node) => String(node.type) === 'GlassInput' && node.props.accessibilityLabel === 'Buscar en el historial');
  act(() => input.props.onChangeText('upper'));
  expect(list().props.data.map((item: any) => item.id)).toEqual(['upper']);
  expect(list().props.ListHeaderComponent).toBeTruthy();
  act(() => input.props.onChangeText('missing'));
  expect(list().props.data).toEqual([]);
});
