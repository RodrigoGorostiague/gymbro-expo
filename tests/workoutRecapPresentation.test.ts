import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { expect, test, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', async () => {
  const ReactModule = await import('react'); const host = (name: string) => ({ children, ...props }: { children?: React.ReactNode }) => ReactModule.createElement(name, props, children);
  return { StyleSheet: { create: <T,>(styles: T) => styles }, Text: host('Text'), View: host('View') };
});
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { text: '#111', textMuted: '#666', primary: '#00f', glassBorder: '#ddd' } }) }));
vi.mock('../context/DataContext', () => ({ useData: () => ({ catalogMuscleGroups: [] }) }));
vi.mock('../components/GlassCard', async () => { const ReactModule = await import('react'); return { GlassCard: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('GlassCard', null, children) }; });
vi.mock('../components/UI', async () => { const ReactModule = await import('react'); return { GlassButton: (props: Record<string, unknown>) => ReactModule.createElement('GlassButton', props) }; });

import { WorkoutRecapPresentation } from '../components/WorkoutRecapPresentation';

test('renders completed exercise sets with their recorded weight, repetitions, and state', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(React.createElement(WorkoutRecapPresentation, { recap: { routineName: 'Upper', durationSeconds: 3600, exerciseCount: 1, metrics: { volume: 800 }, exercises: [{ name: 'Row', muscleGroupIds: ['back'], sets: [{ weight: 80, reps: 10, completed: true }] }], sharePayload: { version: 1, routine: { name: 'Upper', muscleGroups: ['back'], exercises: [{ name: 'Row', muscleGroups: ['back'], loadMode: 'external-load', loadUnit: 'kg', variant: 'barbell', sets: [{ tipo: 1, weight: 80, reps: 10 }] }] } } }, onCopyRoutine: () => undefined })); });
  const text = tree.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''));
  expect(text).toContain('Estructura de la rutina');
  expect(text).toContain('1');
  expect(text).toContain('ejercicio');
  expect(text).toContain('800 kg');
  expect(text).toContain('Resultados reales');
  expect(text).toContain('S1');
  expect(text).toContain('80 kg × 10');
  expect(text).toContain('Hecha');
  expect(text).toContain('Rutina base');
  expect(tree.root.findByProps({ title: 'Guardar rutina' })).toBeDefined();
});

test('offers the shared mesocycle detail when a caller provides navigation', () => {
  const onViewMesocycle = vi.fn();
  const routine = { name: 'Upper', muscleGroups: ['back'], exercises: [{ name: 'Row', muscleGroups: ['back'], loadMode: 'external-load' as const, loadUnit: 'kg' as const, variant: 'barbell', sets: [{ tipo: 1, weight: 80, reps: 10 }] }] };
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(React.createElement(WorkoutRecapPresentation, { recap: {
    routineName: 'Upper', durationSeconds: 3600, exerciseCount: 1, metrics: {}, exercises: [],
    sharePayload: { version: 1, routine, mesocycle: { name: 'Block', goal: '', durationWeeks: 1, weeks: [[{ routineIndex: 0 }]], routines: [routine] } },
  }, onViewMesocycle })); });
  tree.root.findByProps({ title: 'Ver mesociclo' }).props.onPress();
  expect(onViewMesocycle).toHaveBeenCalledOnce();
});
