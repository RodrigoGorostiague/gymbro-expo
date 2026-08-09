import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';
import { WorkoutPublicationCard } from '../components/WorkoutPublicationCard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { text: '#111', textMuted: '#666' } }) }));
vi.mock('../context/DataContext', () => ({ useData: () => ({ catalogMuscleGroups: [] }) }));
vi.mock('../components/GlassCard', async () => {
  const ReactModule = await import('react');
  return { GlassCard: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('GlassCard', null, children) };
});
vi.mock('../components/ProfileAvatar', () => ({ ProfileAvatar: () => null }));
vi.mock('../components/MiniMuscleDistributionRadar', async () => {
  const ReactModule = await import('react');
  return { MiniMuscleDistributionRadar: (props: Record<string, unknown>) => ReactModule.createElement('MiniMuscleDistributionRadar', props) };
});

describe('WorkoutPublicationCard', () => {
  test('renders the compact muscle radar from the safe feed distribution', () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(React.createElement(WorkoutPublicationCard, { now: Date.UTC(2026, 7, 8), recap: { id: 'recap-1', authorAlias: 'Alex', authorAvatarId: 'capigirl', authorThemeId: 'sakura', routineName: 'Upper', completedAt: '2026-08-08T10:00:00Z', durationSeconds: 3600, exerciseCount: 3, muscleGroupIds: ['pecho', 'tríceps'], muscleDistribution: [{ id: 'pecho', value: 3 }, { id: 'tríceps', value: 1 }], metrics: {}, caption: null, createdAt: '2026-08-08T10:00:00Z', templateAvailable: false, mesocycleAvailable: false, isAuthor: false } })); });

    expect(tree!.root.find((node) => String(node.type) === 'MiniMuscleDistributionRadar').props.data).toEqual([{ id: 'pecho', label: 'pecho', value: 3 }, { id: 'tríceps', label: 'tríceps', value: 1 }]);
  });

  test('uses a separate star action without changing the summary navigation surface', () => {
    const onToggleReaction = vi.fn();
    let tree: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(React.createElement(WorkoutPublicationCard, { recap: { id: 'recap-1', authorAlias: 'Alex', authorAvatarId: 'capigirl', authorThemeId: null, routineName: 'Upper', completedAt: '2026-08-08T10:00:00Z', durationSeconds: 3600, exerciseCount: 1, muscleGroupIds: [], metrics: {}, caption: null, createdAt: '2026-08-08T10:00:00Z', templateAvailable: false, mesocycleAvailable: false, isAuthor: false, reactionCount: 2, viewerHasReacted: false }, onToggleReaction })); });
    const star = tree!.root.find((node) => node.props.accessibilityLabel === 'Dar estrella');
    act(() => { star.props.onPress(); });
    expect(onToggleReaction).toHaveBeenCalledOnce();
  });

  test('shows the comment counter alongside reactions in the feed summary', () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(React.createElement(WorkoutPublicationCard, { recap: { id: 'recap-1', authorAlias: 'Alex', authorAvatarId: 'capigirl', authorThemeId: null, routineName: 'Upper', completedAt: '2026-08-08T10:00:00Z', durationSeconds: 3600, exerciseCount: 1, muscleGroupIds: [], metrics: {}, caption: null, createdAt: '2026-08-08T10:00:00Z', templateAvailable: false, mesocycleAvailable: false, isAuthor: false, reactionCount: 2, commentCount: 4, viewerHasReacted: false } })); });

    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toEqual(expect.arrayContaining(['💬 4', '★ 2']));
  });
});
