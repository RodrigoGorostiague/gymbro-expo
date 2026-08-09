import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const inbox = vi.hoisted(() => ({ listNotificationInbox: vi.fn(), markNotificationRead: vi.fn(), subscribeToNotificationInboxChanges: vi.fn() }));
const joint = vi.hoisted(() => ({ respondToJointInvite: vi.fn(), inviteActiveWorkoutMember: vi.fn() }));
const updateActiveWorkout = vi.hoisted(() => vi.fn());

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: 'member-1' }) }));
vi.mock('../context/DataContext', () => ({ useData: () => ({ activeWorkoutDraft: { routineId: 'routine-1', routineSnapshot: { id: 'routine-1', name: 'Upper', muscleGroups: ['back'], exercises: [], createdAt: '2026-08-08T00:00:00Z' } }, updateActiveWorkout }) }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { tabBarBackground: '#111', primary: '#0f0', text: '#fff', textMuted: '#aaa', onPrimary: '#000' } }) }));
vi.mock('../services/notificationInbox', () => inbox);
vi.mock('../services/jointWorkouts', () => joint);
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('../utils/socialNotificationSound', () => ({ playSocialNotificationSound: vi.fn() }));
vi.mock('../components/ProfileAvatar', () => ({ ProfileAvatar: () => null }));
vi.mock('../components/HapticPressable', () => ({ HapticPressable: ({ children, onPress, accessibilityLabel }: any) => React.createElement('button', { onClick: onPress, 'aria-label': accessibilityLabel }, children) }));

import { InAppNotificationBadges } from '../components/InAppNotificationBadges';

describe('InAppNotificationBadges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inbox.listNotificationInbox.mockResolvedValue([{ id: 'notice-1', kind: 'joint_workout_invite', title: 'Invitación', body: 'Bro te invitó.', data: { workout_id: 'workout-1', actor_avatar_id: 'capiboy' }, readAt: null, createdAt: '2026-08-08T00:00:00Z' }]);
    inbox.subscribeToNotificationInboxChanges.mockResolvedValue(() => undefined);
    inbox.markNotificationRead.mockResolvedValue(undefined);
    joint.respondToJointInvite.mockResolvedValue(undefined);
    joint.inviteActiveWorkoutMember.mockResolvedValue('workout-2');
    updateActiveWorkout.mockResolvedValue(undefined);
  });

  test('accepts a live workout invitation without a routine selector and dismisses the badge', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(React.createElement(InAppNotificationBadges)); await Promise.resolve(); await Promise.resolve(); });
    const accept = renderer!.root.findByProps({ 'aria-label': 'Aceptar invitación' });
    await act(async () => { accept.props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    expect(joint.respondToJointInvite).toHaveBeenCalledWith('workout-1', true);
    expect(updateActiveWorkout).toHaveBeenCalledWith({ routineId: 'routine-1', routineSnapshot: { id: 'routine-1', name: 'Upper', muscleGroups: ['back'], exercises: [], createdAt: '2026-08-08T00:00:00Z' }, jointWorkoutId: 'workout-1' });
    expect(inbox.markNotificationRead).toHaveBeenCalledWith('notice-1');
    expect(() => renderer!.root.findByProps({ 'aria-label': 'Aceptar invitación' })).toThrow();
  });

  test('silently removes a stale workout invitation instead of rejecting the badge action', async () => {
    joint.respondToJointInvite.mockRejectedValue(new Error('joint workout unavailable'));
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(React.createElement(InAppNotificationBadges)); await Promise.resolve(); await Promise.resolve(); });
    const accept = renderer!.root.findByProps({ 'aria-label': 'Aceptar invitación' });

    await act(async () => { accept.props.onClick(); await Promise.resolve(); await Promise.resolve(); });

    await vi.waitFor(() => expect(inbox.markNotificationRead).toHaveBeenCalledWith('notice-1'));
    expect(() => renderer!.root.findByProps({ 'aria-label': 'Aceptar invitación' })).toThrow();
  });

  test('invites a Circle member from a workout-start notification with the active routine snapshot', async () => {
    inbox.listNotificationInbox.mockResolvedValue([{ id: 'notice-2', kind: 'circle_workout_started', title: 'Bro empezó', body: 'Upper', data: { actor_id: 'member-2', actor_avatar_id: 'capiboy', activity_id: 'activity-1', expires_at: new Date(Date.now() + 60_000).toISOString() }, readAt: null, createdAt: '2026-08-08T00:00:00Z' }]);
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(React.createElement(InAppNotificationBadges)); await Promise.resolve(); await Promise.resolve(); });
    const invite = renderer!.root.findByProps({ 'aria-label': 'Invitar a entrenar' });
    await act(async () => { invite.props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    expect(joint.inviteActiveWorkoutMember).toHaveBeenCalledWith('member-2', { id: 'routine-1', name: 'Upper', muscleGroups: ['back'], exercises: [], createdAt: '2026-08-08T00:00:00Z' });
    expect(updateActiveWorkout).toHaveBeenCalledWith({ routineId: 'routine-1', routineSnapshot: { id: 'routine-1', name: 'Upper', muscleGroups: ['back'], exercises: [], createdAt: '2026-08-08T00:00:00Z' }, jointWorkoutId: 'workout-2' });
    expect(inbox.markNotificationRead).toHaveBeenCalledWith('notice-2');
  });

  test('uses only intentional horizontal swipes for dismissal', async () => {
    const { shouldDismissNotificationBadge } = await import('../components/InAppNotificationBadges');
    expect(shouldDismissNotificationBadge(95, 0)).toBe(false);
    expect(shouldDismissNotificationBadge(96, 0)).toBe(true);
    expect(shouldDismissNotificationBadge(0, -650)).toBe(true);
  });
});
