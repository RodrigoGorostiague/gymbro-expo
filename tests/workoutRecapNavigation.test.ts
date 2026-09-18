import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { expect, test, vi } from 'vitest';
import { WorkoutPublicationCard } from '../components/WorkoutPublicationCard';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { text: '#111', textMuted: '#666' } }) }));
vi.mock('../context/DataContext', () => ({ useData: () => ({ catalogMuscleGroups: [] }) }));
vi.mock('../components/ProfileAvatar', () => ({ ProfileAvatar: () => null }));
vi.mock('../components/GlassCard', () => ({ GlassCard: ({ children }: any) => React.createElement('Card', null, children) }));
test('workout hero and author are independent navigation targets', async () => {
  const onPress = vi.fn();
  const onProfilePress = vi.fn();
  let tree: TestRenderer.ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(React.createElement(WorkoutPublicationCard, { onPress, onProfilePress, recap: { id: '1', authorAlias: 'Alex', authorAvatarId: 'capigirl', authorThemeId: null, routineName: 'Upper', completedAt: '2026-09-11', durationSeconds: 120, exerciseCount: 0, muscleGroupIds: [], metrics: {}, caption: null, createdAt: '2026-09-11', templateAvailable: false, mesocycleAvailable: false, isAuthor: false } })); });
  await act(async () => { tree!.root.findAllByProps({ accessibilityLabel: 'Abrir ejecución de Upper' })[0].props.onPress(); });
  expect(onPress).toHaveBeenCalledOnce();
  expect(onProfilePress).not.toHaveBeenCalled();
  await act(async () => { tree!.root.findAllByProps({ accessibilityLabel: 'Ver perfil de Alex' })[0].props.onPress(); });
  expect(onProfilePress).toHaveBeenCalledOnce();
  expect(onPress).toHaveBeenCalledOnce();
  await act(async () => tree!.unmount());
});


test.each([
  [{ actualRirMin: 0, actualRirMax: 3, actualRirCount: 2, actualRpeMin: 9, actualRpeMax: 9, actualRpeCount: 1 }, ['RIR 0–3', 'RPE 9', '2 series registradas', '1 serie registrada']],
  [{}, ['Sin esfuerzo registrado']],
] as const)('feed card visibly renders actual effort without mixing scales', async (metrics, expected) => {
 let tree: TestRenderer.ReactTestRenderer;
 await act(async () => { tree = TestRenderer.create(React.createElement(WorkoutPublicationCard, { recap: { id: '1', authorAlias: 'Alex', authorAvatarId: 'capigirl', authorThemeId: null, routineName: 'Upper', completedAt: '2026-09-11', durationSeconds: 120, exerciseCount: 0, muscleGroupIds: [], metrics, caption: null, createdAt: '2026-09-11', templateAvailable: false, mesocycleAvailable: false, isAuthor: false } })); });
 const text = tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''));
 expect(text).toEqual(expect.arrayContaining([...expected]));
 await act(async () => tree!.unmount());
});
