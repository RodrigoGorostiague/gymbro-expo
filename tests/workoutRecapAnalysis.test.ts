import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => ReactModule.createElement(name, props, children);
  return { StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }, Text: host('Text'), View: host('View') };
});
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { text: '#111', textMuted: '#666', primary: '#00f', success: '#0a0', glassBorder: '#ddd' } }) }));
vi.mock('../context/DataContext', () => ({ useData: () => ({ catalogMuscleGroups: [] }) }));
vi.mock('../components/HapticPressable', async () => { const ReactModule = await import('react'); return { HapticPressable: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => ReactModule.createElement('HapticPressable', props, children) }; });

import { WorkoutRecapAnalysis } from '../components/WorkoutRecapAnalysis';

describe('WorkoutRecapAnalysis', () => {
  test('prioritizes aggregate performance and expands the first exercise series', async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => { tree = TestRenderer.create(React.createElement(WorkoutRecapAnalysis, { recap: { id: 'recap-1', authorAlias: 'Alex', authorAvatarId: 'capigirl', authorThemeId: null, routineName: 'Upper', completedAt: '2026-08-08T10:00:00Z', durationSeconds: 3600, exerciseCount: 1, muscleGroupIds: [], metrics: { volume: 800 }, caption: null, createdAt: '2026-08-08T10:00:00Z', templateAvailable: false, mesocycleAvailable: false, isAuthor: false, reactionCount: 0, viewerHasReacted: false, comments: [], sharePayload: null, previousComparable: { id: 'recap-0', completedAt: '2026-08-01T10:00:00Z', durationSeconds: 3000, exerciseCount: 1, metrics: { volume: 700 } }, exercises: [{ name: 'Row', muscleGroupIds: ['back'], sets: [{ weight: 80, reps: 10, completed: true }, { weight: 80, reps: 8, completed: false }] }] } })); });
    const text = tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''));
    expect(text).toEqual(expect.arrayContaining(['60 min', '1/2', '800 kg', 'Vs. último entrenamiento igual', '50 min · 1 ejercicios · +100 kg de volumen', 'Análisis por ejercicio', '80 kg × 10', 'Hecha', 'No realizada']));
    const exercise = tree!.root.find((node) => String(node.type) === 'HapticPressable');
    await act(async () => { exercise.props.onPress(); });
    expect(exercise.props.accessibilityState.expanded).toBe(false);
  });
});
