import React from 'react';
import { act } from 'react-test-renderer';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  render,
  resetRuntimeHarness,
  setMockData,
  setMockParams,
  press,
  changeText,
  findButton,
} from './helpers/runtimeHarness';
import ExecuteRoutineScreen from '../app/routine/execute/[id]';
import { WorkoutExerciseCard } from '../components/WorkoutExerciseCard';
vi.mock('../context/ShopContext', () => ({
  useShop: () => ({ retryPendingRewards: vi.fn() }),
}));
const routine = {
  id: 'r',
  name: 'Upper',
  createdAt: '',
  muscleGroups: [],
  exercises: ['Press', 'Row'].map((name, index) => ({
    id: `e${index}`,
    name,
    variant: 'Bar',
    muscleGroups: [],
    loadMode: 'external-load',
    loadUnit: 'kg',
    sets: [{ id: 's', tipo: 1, weight: 20, reps: 8 }],
  })),
};
beforeEach(() => {
  resetRuntimeHarness();
  setMockParams({ id: 'r' });
});
function setup(completedSets = {}) {
  const updateActiveWorkout = vi.fn(async (_draft: any) => undefined);
  const draft = {
    version: 1,
    owner: 'rodaja',
    attemptId: 'a',
    routineId: 'r',
    startedAtMs: Date.now(),
    restTimerSeconds: 30,
    completedSets,
    setValues: {
      'e0-s': {
        weight: '20',
        reps: '8',
        actualEffort: { kind: 'rir', value: 2 },
      },
      'e1-s': { weight: '15', reps: '10' },
    },
    routineSnapshot: routine,
  };
  setMockData({
    getRoutine: () => routine,
    routines: [routine],
    mesocycles: [],
    attempts: [],
    activeWorkoutDraft: draft,
    updateActiveWorkout,
    clearActiveWorkoutIfMatches: vi.fn(),
    refreshActiveWorkoutTiming: vi.fn(async () => undefined),
    cancelActiveWorkout: vi.fn(),
  });
  const tree = render(React.createElement(ExecuteRoutineScreen));
  const control = (label: string) =>
    tree.root.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel === label,
    );
  const expanded = () =>
    tree.root
      .findAllByType(WorkoutExerciseCard)
      .map((card) => [card.props.name, card.props.expanded]);
  return { tree, control, expanded, updateActiveWorkout };
}
test('disclosure saves focused raw input and retains actual effort without completing a series', async () => {
  const f = setup();
  expect(f.expanded()).toEqual([
    ['Press', true],
    ['Row', false],
  ]);
  changeText(f.control('Press, serie 1, carga en kg'), '22,5');
  await act(async () => press(f.control('Ocultar Press')));
  expect(f.expanded()).toEqual([
    ['Press', false],
    ['Row', false],
  ]);
  const saved = f.updateActiveWorkout.mock.calls.at(-1)![0];
  expect(saved.setValues['e0-s']).toMatchObject({
    weight: '22,5',
    actualEffort: { kind: 'rir', value: 2 },
  });
  expect(saved.completedSets).toEqual({});
  await act(async () => press(f.control('Desplegar Press')));
  expect(f.control('Press, serie 1, carga en kg').props.value).toBe('22,5');
});
test('completion follows the next exercise; a compact completed series can be reopened', async () => {
  const f = setup();
  await act(async () => press(f.control('Finalizar serie 1 de Press')));
  expect(f.expanded()).toEqual([
    ['Press', false],
    ['Row', true],
  ]);
  const completed = f.tree.root.findAllByType(WorkoutExerciseCard)[0];
  expect(completed.props.completed).toBe(1);
  await act(async () => press(f.control('Desplegar Press')));
  expect(
    f.tree.root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel === 'Press, serie 1, carga en kg',
    ),
  ).toHaveLength(0);
  await act(async () => press(f.control('Editar serie 1 de Press')));
  expect(f.control('Press, serie 1, carga en kg').props.value).toBe('20');
  expect(
    f.updateActiveWorkout.mock.calls.at(-1)![0].completedSets['e0-s'],
  ).toBe(false);
});
test('expand-all and focus can coexist without dropping values or overriding a manual disclosure', async () => {
  const f = setup();
  await act(async () => press(findButton(f.tree.root, 'Desplegar ejercicios')));
  expect(f.expanded()).toEqual([
    ['Press', true],
    ['Row', true],
  ]);
  changeText(f.control('Row, serie 1, carga en kg'), '32');
  await act(async () => press(findButton(f.tree.root, 'Enfocar serie actual')));
  expect(f.expanded()).toEqual([['Press', true]]);
  await act(async () => press(findButton(f.tree.root, 'Ver rutina completa')));
  expect(f.control('Row, serie 1, carga en kg').props.value).toBe('32');
  await act(async () => press(findButton(f.tree.root, 'Ocultar ejercicios')));
  expect(f.expanded()).toEqual([
    ['Press', false],
    ['Row', false],
  ]);
});
test('resume opens the pending exercise and counts only series in the snapshot', () => {
  const f = setup({ 'e0-s': true, 'deleted-series': true });
  expect(f.expanded()).toEqual([
    ['Press', false],
    ['Row', true],
  ]);
  const text = f.tree.root
    .findAll((node) => String(node.type) === 'Text')
    .map((node) => node.children.join(''))
    .join(' ');
  expect(text).toContain('1/2 series realizadas');
});
