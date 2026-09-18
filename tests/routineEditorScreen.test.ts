import React from 'react';
import { act } from 'react-test-renderer';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  render,
  resetRuntimeHarness,
  setMockData,
  setMockParams,
  findInputs,
  findButton,
  changeText,
  press,
} from './helpers/runtimeHarness';
import EditRoutineScreen from '../app/routine/[id]';
import { RoutineExercisePicker } from '../components/RoutineExercisePicker';
import { EffortTargetControl } from '../components/EffortTargetControl';
const storage = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: async (key: string) => {
      values.delete(key);
    },
  };
});
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: storage,
}));
const routine = {
  id: 'r',
  name: 'Upper',
  createdAt: '',
  muscleGroups: ['chest'],
  exercises: [
    {
      id: 'e',
      name: 'Press',
      variant: 'Bar',
      muscleGroups: ['chest'],
      sets: [1, 2, 3].map((tipo) => ({
        id: `s${tipo}`,
        tipo,
        weight: tipo * 10,
        reps: 8,
      })),
    },
  ],
};
const catalog = [
  {
    id: 'c1',
    name: 'Ab wheel',
    variant: 'Wheel',
    muscleGroups: ['abs'],
    defaultSets: [],
  },
  {
    id: 'c2',
    name: 'Plank',
    variant: 'Floor',
    muscleGroups: ['abs'],
    defaultSets: [],
  },
];
const tick = async () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
beforeEach(() => {
  resetRuntimeHarness();
  storage.values.clear();
  setMockParams({ id: 'r' });
});

test('keeps effort control and renumbers C conversions, deletion and undo without losing raw weights', async () => {
  const saveRoutineDraft = vi.fn(async (value) => value);
  setMockData({
    dataState: 'ready',
    exercises: catalog,
    definitions: [],
    getRoutine: () => routine,
    saveRoutineDraft,
  });
  const tree = render(React.createElement(EditRoutineScreen));
  await tick();
  const weights = findInputs(
    tree.root,
    (node) => node.props.keyboardType === 'decimal-pad',
  );
  changeText(weights[1], '22,5');
  const warmup = tree.root.findAll(
    (node) =>
      String(node.type) === 'HapticPressable' &&
      node.props.accessibilityLabel === 'Calentamiento',
  );
  press(warmup[0]);
  expect(tree.root.findAllByType(EffortTargetControl)).toHaveLength(3);
  press(
    tree.root.findAll(
      (node) =>
        String(node.type) === 'HapticPressable' &&
        node.props.accessibilityLabel === 'Eliminar serie',
    )[0],
  );
  press(
    tree.root.find(
      (node) =>
        String(node.type) === 'HapticPressable' &&
        node.props.accessibilityLabel === 'Deshacer',
    ),
  );
  await tick();
  press(findButton(tree.root, 'Guardar rutina'));
  await tick();
  const saved = saveRoutineDraft.mock.calls[0][0];
  expect(saved.exercises[0].sets.map((set: any) => set.tipo)).toEqual([
    'C',
    1,
    2,
  ]);
  expect(saved.exercises[0].sets[1]).toMatchObject({ id: 's2', weight: 22.5 });
});

test('multi-add initializes all inputs and a double save makes one request', async () => {
  let release!: (value: unknown) => void;
  const saveRoutineDraft = vi.fn(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  setMockData({
    dataState: 'ready',
    exercises: catalog,
    definitions: [],
    getRoutine: () => routine,
    saveRoutineDraft,
  });
  const tree = render(React.createElement(EditRoutineScreen));
  await tick();
  press(findButton(tree.root, '+ Ejercicios'));
  await act(async () =>
    tree.root.findByType(RoutineExercisePicker).props.onSelect(catalog),
  );
  const save = findButton(tree.root, 'Guardar rutina');
  press(save);
  press(save);
  await tick();
  expect(saveRoutineDraft).toHaveBeenCalledTimes(1);
  const saved = (saveRoutineDraft.mock.calls[0] as unknown[])[0] as any;
  expect(saved.exercises.map((exercise: any) => exercise.name)).toEqual([
    'Press',
    'Ab wheel',
    'Plank',
  ]);
  expect(saved.exercises[1].sets[0]).toMatchObject({ weight: 0, reps: 8 });
  await act(async () => release(saved));
  await tick();
});

test('the picker retains selection across searches and returns click order', async () => {
  const onSelect = vi.fn();
  setMockData({ catalogMuscleGroups: [] });
  const tree = render(
    React.createElement(RoutineExercisePicker, {
      exercises: catalog,
      onClose: vi.fn(),
      onSelect,
    }),
  );
  press(
    tree.root.find(
      (node) =>
        String(node.type) === 'HapticPressable' &&
        node.props.accessibilityLabel === 'Plank',
    ),
  );
  changeText(
    findInputs(
      tree.root,
      (node) => node.props.accessibilityLabel === 'Buscar ejercicios',
    )[0],
    'ab',
  );
  press(
    tree.root.find(
      (node) =>
        String(node.type) === 'HapticPressable' &&
        node.props.accessibilityLabel === 'Ab wheel',
    ),
  );
  press(findButton(tree.root, 'Agregar 2 ejercicios'));
  expect(onSelect.mock.calls[0][0].map((exercise: any) => exercise.id)).toEqual(
    ['c2', 'c1'],
  );
});

test('converting an existing series to a drop preserves its identity and visible input', async () => {
  const saveRoutineDraft = vi.fn(async (value) => value);
  setMockData({ dataState: 'ready', exercises: catalog, definitions: [], getRoutine: () => routine, saveRoutineDraft });
  const tree = render(React.createElement(EditRoutineScreen)); await tick();
  changeText(findInputs(tree.root, (node) => node.props.keyboardType === 'decimal-pad')[0], '12,5');
  press(tree.root.findAll((node) => String(node.type) === 'HapticPressable' && node.props.accessibilityLabel === 'Drop set')[0]);
  await tick(); press(findButton(tree.root, 'Guardar rutina')); await tick();
  const sets = saveRoutineDraft.mock.calls[0][0].exercises[0].sets;
  expect(sets).toHaveLength(4);
  expect(sets[0]).toMatchObject({ id: 's1', weight: 12.5 });
  expect(sets[1].weight).toBe(12.5);
  expect(sets[1].dropGroupId).toBe(sets[0].dropGroupId);
  expect(sets.slice(2).map((set: any) => set.tipo)).toEqual([1, 2]);
});
