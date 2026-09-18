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

test('weekly summary is integrated, labels partial comparison and hides unavailable data during loading', () => {
  resetRuntimeHarness();
  const data = { exercises: [], routines: [], attempts: [], mesocycles: [], experienceProgress: null, sessions: [], catalogMuscleGroups: [], quarantinedSessionCount: 0, dataState: 'ready' };
  setMockData(data);
  const screen = render(React.createElement(ProgressScreen));
  const text = () => screen.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.filter((child) => typeof child === 'string').join('')).join(' ');
  expect(text()).toContain('Resumen semanal');
  expect(text()).toContain('Densidad semanal');
  expect(text()).toContain('Esfuerzo registrado');
  expect(screen.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel?.includes('densidad no disponible'))).toHaveLength(2);
  expect(text()).toContain('Semana actual en curso');
  expect(text()).toContain('Semana anterior completa');
  expect(text()).toContain('Planificación no disponible');
  expect(text()).toContain('Sin datos musculares registrados');
  setMockData({ ...data, dataState: 'loading' });
  act(() => screen.update(React.createElement(ProgressScreen)));
  expect(text()).not.toContain('Resumen semanal');
  setMockData({ ...data, dataState: 'error' });
  act(() => screen.update(React.createElement(ProgressScreen)));
  expect(text()).not.toContain('Resumen semanal');
});

test('weekly card renders recorded metrics without changing rolling-period controls', () => {
  resetRuntimeHarness();
  const at = new Date().toISOString();
  setMockData({ exercises: [], routines: [], mesocycles: [], experienceProgress: null, sessions: [], catalogMuscleGroups: [], quarantinedSessionCount: 0, dataState: 'ready', attempts: [{
    id: 'weekly', owner: 'rodaja', completedAt: at, recordedRoutineName: 'Upper', durationSeconds: 60,
    completion: { status: 'completed', validSets: 1, plannedSets: 1, adherence: 1 }, rewardApplication: { state: 'applied' },
    exercises: [{ exerciseId: 'press', recordedName: 'Press', attribution: { primary: 'pecho', secondary: [] }, sets: [{ plan: { id: 'set', type: 1 }, result: { setId: 'set', performed: true, performance: { mode: 'external-load', unit: 'kg', load: 20, reps: 10 }, actualEffort: { kind: 'rir', value: 0 } } }] }],
  }] });
  const screen = render(React.createElement(ProgressScreen));
  const text = () => screen.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.filter((child) => typeof child === 'string').join('')).join(' ');
  expect(text()).toContain('Sesiones completadas: 1 · Series efectivas: 1 · Frecuencia: 1 días');
  expect(screen.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'Actual · en curso: RIR 0. 1 de 1 series efectivas con RIR')).toHaveLength(1);
  expect(text()).toContain('200.0 kg·rep / sin carga comparable');
  expect(screen.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'Actual · en curso: 60 series efectivas por hora registrada')).toHaveLength(1);
  press(screen.root.find((node) => String(node.type) === 'HapticPressable' && node.props.accessibilityLabel === 'Período 30 días'));
  expect(text()).toContain('Semana actual en curso');
  expect(text()).toContain('200.0 kg·rep / sin carga comparable');
  expect(screen.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'Actual · en curso: 60 series efectivas por hora registrada')).toHaveLength(1);
});

test('weekly duration and omissions render from snapshots, not current routines or rolling controls', () => {
  resetRuntimeHarness();
  const date = new Date();
  const data = { exercises: [], routines: [], mesocycles: [], experienceProgress: null, sessions: [], catalogMuscleGroups: [], quarantinedSessionCount: 0, dataState: 'ready', attempts: [{
    id: 'weekly-omission', owner: 'rodaja', completedAt: date.toISOString(), durationSeconds: 120,
    completion: { status: 'partial', validSets: 0, plannedSets: 1, adherence: 0 }, rewardApplication: { state: 'applied' },
    exercises: [{ exerciseId: 'removed', recordedName: 'Historical exercise', attribution: null, sets: [
      { plan: { id: 'set', type: 1 }, result: { setId: 'set', performed: false, performance: null } },
    ] }],
  }] };
  setMockData(data);
  const screen = render(React.createElement(ProgressScreen));
  const text = () => screen.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.filter((child) => typeof child === 'string').join('')).join(' ');
  expect(text()).toContain('Duración registrada: 2 min');
  expect(text()).toContain('Ejercicios omitidos: 1');
  expect(text()).toContain('Duración registrada: no disponible');
  expect(text()).toContain('Ejercicios omitidos: no disponible');
  expect(text()).toContain('incluido el calentamiento; un ejercicio parcial no es omitido');
  press(screen.root.find((node) => String(node.type) === 'HapticPressable' && node.props.accessibilityLabel === 'Período 30 días'));
  expect(text()).toContain('Duración registrada: 2 min');
  expect(text()).toContain('Ejercicios omitidos: 1');
  setMockData({ ...data, attempts: [{ ...data.attempts[0], durationSeconds: undefined, exercises: [] }] });
  act(() => screen.update(React.createElement(ProgressScreen)));
  expect(text()).not.toContain('Duración registrada: 2 min');
  expect(text()).not.toContain('Ejercicios omitidos: 1');
  expect(text()).toContain('Semana actual en curso');
  expect(text()).toContain('Semana anterior completa');
});
