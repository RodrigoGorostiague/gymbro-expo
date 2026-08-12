import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { findTextsContaining, render } from './helpers/runtimeHarness';

const inbox = vi.hoisted(() => ({ listNotificationInbox: vi.fn(), subscribeToNotificationInboxChanges: vi.fn() }));
const sendJointSocialMessage = vi.hoisted(() => vi.fn());
vi.mock('../services/notificationInbox', () => inbox);
vi.mock('../services/jointSocialMessages', () => ({ sendJointSocialMessage }));
import { JointWorkoutLiveRoster } from '../components/JointWorkoutLiveRoster';

describe('JointWorkoutLiveRoster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inbox.listNotificationInbox.mockResolvedValue([]);
    inbox.subscribeToNotificationInboxChanges.mockResolvedValue(() => undefined);
  });

  test('shows participant state and aggregate progress only when expanded', () => {
    const roster = render(React.createElement(JointWorkoutLiveRoster, { workoutId: 'workout-1', expanded: true, onToggle: () => undefined, participants: [{ id: 'bro-1', alias: 'Cami', avatarId: 'capigirl', status: 'active', relationshipKind: 'bro', liveProgress: { state: 'resting', completedExercises: 2, totalExercises: 5, completedSets: 6, totalSets: 15, restEndsAt: new Date(Date.now() + 60_000).toISOString(), updatedAt: new Date().toISOString() } }] }));
    expect(findTextsContaining(roster.root, 'Cami')).toHaveLength(1);
    expect(findTextsContaining(roster.root, 'Ejercicios 2/5 · Series 6/15')).toHaveLength(1);
    expect(findTextsContaining(roster.root, 'Descanso')).toHaveLength(1);
  });

  test('uses the community icon to toggle the live workout hub', () => {
    const roster = render(React.createElement(JointWorkoutLiveRoster, { workoutId: 'workout-1', expanded: false, onToggle: () => undefined, participants: [] }));

    expect(roster.root.findByProps({ accessibilityLabel: 'Mostrar entrenamiento conjunto' }).props.accessibilityState).toEqual({ expanded: false });
    expect(roster.root.findByProps({ name: 'people-outline' })).toBeTruthy();
  });

  test('shows the received message as a participant bubble', async () => {
    inbox.listNotificationInbox.mockResolvedValue([{ id: 'message-1', kind: 'joint_social_message', title: 'Cami te envió un mensaje', body: '¡Una más, puedes hacerlo! 💪', data: { workout_id: 'workout-1', actor_id: 'bro-1' }, readAt: null, createdAt: new Date().toISOString() }]);
    const roster = render(React.createElement(JointWorkoutLiveRoster, { workoutId: 'workout-1', expanded: true, onToggle: () => undefined, participants: [{ id: 'bro-1', alias: 'Cami', avatarId: 'capigirl', status: 'active', relationshipKind: 'bro' }] }));
    await vi.waitFor(() => expect(findTextsContaining(roster.root, '¡Una más, puedes hacerlo! 💪')).toHaveLength(1));
  });

  test('shows available athletes separately and keeps completed athletes out of the compact roster', () => {
    const roster = render(React.createElement(JointWorkoutLiveRoster, {
      workoutId: 'workout-1', expanded: false, onToggle: () => undefined,
      participants: [{ id: 'finished-1', alias: 'Cami', avatarId: 'capigirl', status: 'completed', relationshipKind: 'bro' }],
      availableCandidates: [{ id: 'available-1', alias: 'Sol', avatarId: 'capybro-spiky', themeId: null, relationshipKind: 'bro', groupMemberCount: 1 }],
    }));

    expect(roster.root.findAll((node) => node.props.accessibilityLabel === 'Sol está entrenando y disponible para invitar').length).toBeGreaterThan(0);
    expect(roster.root.findAll((node) => node.props.accessibilityLabel === 'Cami: Completó')).toHaveLength(0);
  });

  test('marks completed participants without the active green status', () => {
    const roster = render(React.createElement(JointWorkoutLiveRoster, {
      workoutId: 'workout-1', expanded: true, onToggle: () => undefined,
      participants: [{ id: 'finished-1', alias: 'Cami', avatarId: 'capigirl', status: 'completed', relationshipKind: 'bro' }],
    }));

    const completed = roster.root.find((node) => String(node.type) === 'Text' && node.children.join('') === 'Completó');
    expect(completed.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#94A3B8' })]));
  });
});
