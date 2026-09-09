import React from 'react';
import { act } from 'react-test-renderer';
import { expect, test, vi } from 'vitest';
import { findButton, press, render, resetRuntimeHarness, setMockData, mockRouter } from './helpers/runtimeHarness';
import CreateMesocycleScreen from '../app/mesocycle/create';

test('the guided week persists selected routine and explicit rest for each week', async () => {
  resetRuntimeHarness();
  const addMesocycle = vi.fn(async (_candidate: unknown) => ({ id: 'created' }));
  setMockData({ routines: [{ id: 'r', name: 'Upper', exercises: [], muscleGroups: [], createdAt: '' }], mesocycles: [], addMesocycle });
  const tree = render(React.createElement(CreateMesocycleScreen));
  const name = tree.root.find((node) => String(node.type) === 'GlassInput' && node.props.placeholder === 'Ej.: Bloque de hipertrofia');
  act(() => name.props.onChangeText('My block'));
  press(findButton(tree.root, 'Upper'));
  press(tree.root.find((node) => String(node.type) === 'HapticPressable' && node.props.accessibilityLabel === 'Día 2, Sin asignar'));
  press(findButton(tree.root, 'Descanso'));
  await act(async () => { findButton(tree.root, 'Crear mesociclo').props.onPress(); });
  const saved = addMesocycle.mock.calls[0]?.[0] as any;
  expect(saved.name).toBe('My block');
  expect(saved.weeks).toHaveLength(4);
  expect(saved.weeks[0].entries[0].routineSnapshot.name).toBe('Upper');
  expect(saved.weeks.every((week: any) => week.entries[1].kind === 'rest')).toBe(true);
  expect(mockRouter.replace).toHaveBeenCalledWith('/mesocycle/summary/created');
});
