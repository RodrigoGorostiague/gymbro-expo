import React, { act } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { findTextsContaining, render } from './helpers/runtimeHarness';

const chat = vi.hoisted(() => ({ listJointWorkoutChatMessages: vi.fn(), sendJointWorkoutChatMessage: vi.fn(), subscribeToJointWorkoutChatChanges: vi.fn() }));
vi.mock('../services/jointWorkoutChat', () => chat);
import { JointWorkoutLiveRoster } from '../components/JointWorkoutLiveRoster';

describe('JointWorkoutLiveRoster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chat.listJointWorkoutChatMessages.mockResolvedValue([]);
    chat.subscribeToJointWorkoutChatChanges.mockResolvedValue(() => undefined);
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

  test('shows an unread chat indicator while collapsed and clears it when opened', async () => {
    let notifyChatChange: (() => void) | undefined;
    chat.subscribeToJointWorkoutChatChanges.mockImplementation(async (_workoutId: string, onChange: () => void) => {
      notifyChatChange = onChange;
      return () => undefined;
    });
    const collapsed = React.createElement(JointWorkoutLiveRoster, { workoutId: 'workout-1', expanded: false, onToggle: () => undefined, participants: [] });
    const roster = render(collapsed);
    await vi.waitFor(() => expect(notifyChatChange).toBeTypeOf('function'));
    await act(async () => { notifyChatChange?.(); });
    expect(roster.root.findByProps({ testID: 'joint-workout-chat-unread' })).toBeTruthy();
    await act(async () => { roster.update(React.createElement(JointWorkoutLiveRoster, { workoutId: 'workout-1', expanded: true, onToggle: () => undefined, participants: [] })); });
    expect(() => roster.root.findByProps({ testID: 'joint-workout-chat-unread' })).toThrow();
  });

  test('shows only server-authorized private chat messages', async () => {
    chat.listJointWorkoutChatMessages.mockResolvedValue([{ id: 'message-1', senderId: 'bro-1', senderAlias: 'Cami', senderAvatarId: 'capigirl', body: '¡Una más, puedes hacerlo! 💪', mentionedParticipantIds: ['self'], createdAt: new Date().toISOString() }]);
    const roster = render(React.createElement(JointWorkoutLiveRoster, { workoutId: 'workout-1', expanded: true, onToggle: () => undefined, participants: [{ id: 'bro-1', alias: 'Cami', avatarId: 'capigirl', status: 'active', relationshipKind: 'bro' }] }));
    await vi.waitFor(() => expect(findTextsContaining(roster.root, '¡Una más, puedes hacerlo! 💪')).toHaveLength(1));
  });

  test('autocompletes an @ mention before sending a private chat message', async () => {
    chat.sendJointWorkoutChatMessage.mockResolvedValue(undefined);
    const roster = render(React.createElement(JointWorkoutLiveRoster, { workoutId: 'workout-1', expanded: true, onToggle: () => undefined, participants: [{ id: 'bro-1', alias: 'Cami', avatarId: 'capigirl', status: 'active', relationshipKind: 'bro' }] }));
    await act(async () => { roster.root.findByProps({ placeholder: 'Mensaje para todos. Escribí @ para hacerlo privado' }).props.onChangeText('Vamos @ca'); });
    await act(async () => { roster.root.findByProps({ accessibilityLabel: 'Agregar mención para Cami' }).props.onPress(); });
    await act(async () => { roster.root.findByProps({ accessibilityLabel: 'Enviar mensaje del entrenamiento' }).props.onPress(); });
    expect(chat.sendJointWorkoutChatMessage).toHaveBeenCalledWith('workout-1', 'Vamos @Cami', ['bro-1']);
  });

  test('sends a public workout chat message without an @ mention', async () => {
    chat.sendJointWorkoutChatMessage.mockResolvedValue(undefined);
    const roster = render(React.createElement(JointWorkoutLiveRoster, { workoutId: 'workout-1', expanded: true, onToggle: () => undefined, participants: [] }));
    await act(async () => { roster.root.findByProps({ placeholder: 'Mensaje para todos. Escribí @ para hacerlo privado' }).props.onChangeText('Buen trabajo equipo'); });
    await act(async () => { roster.root.findByProps({ accessibilityLabel: 'Enviar mensaje del entrenamiento' }).props.onPress(); });
    expect(chat.sendJointWorkoutChatMessage).toHaveBeenCalledWith('workout-1', 'Buen trabajo equipo', []);
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
