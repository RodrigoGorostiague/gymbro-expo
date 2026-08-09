import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => ReactModule.createElement(name, props, children);
  return { StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }, Text: host('Text'), View: host('View') };
});
vi.mock('expo-router', () => ({ router: { push: vi.fn() }, useFocusEffect: () => undefined }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { text: '#111', textMuted: '#666', primary: '#0f0' } }) }));
vi.mock('../services/jointWorkouts', () => ({ getJointWorkoutDetail: vi.fn(), setJointParticipantReaction: vi.fn() }));
vi.mock('../components/GlassCard', async () => {
  const ReactModule = await import('react');
  return { GlassCard: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('GlassCard', null, children) };
});
vi.mock('../components/HapticPressable', async () => {
  const ReactModule = await import('react');
  return { HapticPressable: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => ReactModule.createElement('HapticPressable', props, children) };
});
vi.mock('../components/ProfileAvatar', async () => {
  const ReactModule = await import('react');
  return { ProfileAvatar: (props: Record<string, unknown>) => ReactModule.createElement('ProfileAvatar', props) };
});
vi.mock('../components/ProfileTitleBadge', async () => {
  const ReactModule = await import('react');
  return { ProfileTitleBadge: (props: Record<string, unknown>) => ReactModule.createElement('ProfileTitleBadge', props) };
});
vi.mock('../components/UI', () => ({ GlassButton: () => null }));
vi.mock('../components/JointParticipantProfileCard', () => ({ JointParticipantProfileCard: () => null }));
vi.mock('../components/WorkoutPublicationCard', () => ({ WorkoutPublicationCard: () => null }));

import { JointWorkoutFeedCard } from '../components/JointWorkoutFeedCard';

describe('JointWorkoutFeedCard', () => {
  test('keeps each compact participant frame and title visible', () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(React.createElement(JointWorkoutFeedCard, {
      workoutId: 'joint-1', publishedAt: '2026-08-09T10:00:00Z', now: Date.UTC(2026, 7, 9, 11),
      participants: [{ id: 'athlete-1', alias: 'Alex', avatarId: 'capigirl', frameId: 'alfa', titleId: 'alfa', status: 'completed' }],
    })); });

    expect(tree!.root.find((node) => String(node.type) === 'ProfileAvatar').props.frameId).toBe('alfa');
    expect(tree!.root.find((node) => String(node.type) === 'ProfileTitleBadge').props.titleId).toBe('alfa');
  });
});
