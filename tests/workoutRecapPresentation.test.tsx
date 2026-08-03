import React from 'react';
import TestRenderer from 'react-test-renderer';
import { expect, test, vi } from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react'); const host = (name: string) => ({ children, ...props }: { children?: React.ReactNode }) => ReactModule.createElement(name, props, children);
  return { StyleSheet: { create: <T,>(styles: T) => styles }, Text: host('Text'), View: host('View') };
});
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { text: '#111', textMuted: '#666', primary: '#00f', glassBorder: '#ddd' } }) }));
vi.mock('../context/DataContext', () => ({ useData: () => ({ catalogMuscleGroups: [] }) }));
vi.mock('../components/GlassCard', async () => { const ReactModule = await import('react'); return { GlassCard: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('GlassCard', null, children) }; });
vi.mock('../components/UI', async () => { const ReactModule = await import('react'); return { GlassButton: (props: Record<string, unknown>) => ReactModule.createElement('GlassButton', props) }; });

import { WorkoutRecapPresentation } from '../components/WorkoutRecapPresentation';

test('renders the full shared recap body and copy actions from a sanitized payload', () => {
  const tree = TestRenderer.create(<WorkoutRecapPresentation recap={{ routineName: 'Upper', durationSeconds: 3600, exerciseCount: 1, metrics: { volume: 800 }, exercises: [{ name: 'Row', muscleGroupIds: ['back'], sets: [{ weight: 80, reps: 10, completed: true }] }], sharePayload: { version: 1, routine: { name: 'Upper', muscleGroups: ['back'], exercises: [{ name: 'Row', muscleGroups: ['back'], loadMode: 'external-load', loadUnit: 'kg', variant: 'barbell', sets: [{ tipo: 1, weight: 80, reps: 10 }] }] } } }} onCopyRoutine={() => undefined} />);
  const text = JSON.stringify(tree.toJSON());
  expect(text).toContain('volumen total');
  expect(text).toContain('Entrenamiento realizado');
  expect(text).toContain('Rutina base');
  expect(tree.root.findByProps({ title: 'Guardar rutina' })).toBeDefined();
});

test('offers the shared mesocycle detail when a caller provides navigation', () => {
  const onViewMesocycle = vi.fn();
  const routine = { name: 'Upper', muscleGroups: ['back'], exercises: [{ name: 'Row', muscleGroups: ['back'], loadMode: 'external-load' as const, loadUnit: 'kg' as const, variant: 'barbell', sets: [{ tipo: 1, weight: 80, reps: 10 }] }] };
  const tree = TestRenderer.create(<WorkoutRecapPresentation recap={{
    routineName: 'Upper', durationSeconds: 3600, exerciseCount: 1, metrics: {}, exercises: [],
    sharePayload: { version: 1, routine, mesocycle: { name: 'Block', goal: '', durationWeeks: 1, weeks: [[{ routineIndex: 0 }]], routines: [routine] } },
  }} onViewMesocycle={onViewMesocycle} />);
  tree.root.findByProps({ title: 'Ver mesociclo' }).props.onPress();
  expect(onViewMesocycle).toHaveBeenCalledOnce();
});
