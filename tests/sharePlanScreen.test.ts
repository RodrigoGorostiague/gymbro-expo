import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import * as ExpoRouter from 'expo-router';
import { Alert } from 'react-native';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const social = vi.hoisted(() => ({
  circle: vi.fn(),
  createPrivatePlanShareRequest: vi.fn(),
  listReceivedPrivatePlanShareRequests: vi.fn(),
  acceptPrivatePlanShareRequest: vi.fn(),
  rejectPrivatePlanShareRequest: vi.fn(),
}));
const setParams = (ExpoRouter as unknown as { __setParams: (params: Record<string, unknown>) => void }).__setParams;

vi.mock('../context/SocialContext', () => ({ useSocial: () => social }));
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ theme: { text: '#111', textMuted: '#666' } }),
}));
vi.mock('../context/DataContext', () => ({ useData: () => ({ retryData: vi.fn() }) }));
vi.mock('../components/AppNavBar', () => ({ AppNavBar: () => null }));
vi.mock('../components/ProfileAvatar', async () => {
  const ReactModule = await import('react');
  return { ProfileAvatar: (props: Record<string, unknown>) => ReactModule.createElement('ProfileAvatar', props) };
});
vi.mock('../components/GlassCard', async () => {
  const ReactModule = await import('react');
  return {
    GlassCard: ({ children, ...props }: { children: React.ReactNode }) => ReactModule.createElement('GlassCard', props, children),
    ThemeBackground: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('ThemeBackground', null, children),
  };
});
vi.mock('../components/UI', async () => {
  const ReactModule = await import('react');
  return { GlassButton: (props: Record<string, unknown>) => ReactModule.createElement('GlassButton', props) };
});

import SharePlanScreen from '../app/community/share-plan';
import PlanInboxScreen from '../app/community/plan-inbox';

describe('plan share recipients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setParams({ kind: 'routine', id: 'routine-1', name: 'Upper' });
    social.listReceivedPrivatePlanShareRequests.mockResolvedValue([]);
  });

  test('renders an accepted recipient with its public theme, avatar, relationship, categories, and contained send action', async () => {
    social.circle.mockResolvedValue({ profiles: [{ uid: 'member-2', alias: 'Theme athlete', avatarId: 'capigirl', categories: { style: 'Strength', goal: 'Hypertrophy' }, presentationThemeId: 'moon', relationshipStatus: 'partner' }], nextCursor: null });
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(SharePlanScreen)); });

    expect(tree!.root.find((node) => String(node.type) === 'LinearGradient').props.colors).toEqual(['#9FA8DA', '#C5CAE9', '#5C6BC0']);
    expect(tree!.root.find((node) => String(node.type) === 'ProfileAvatar').props.avatarId).toBe('capigirl');
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toEqual(expect.arrayContaining(['Theme athlete', 'GymCrush', 'Strength', 'Hypertrophy']));
    expect(tree!.root.find((node) => String(node.type) === 'GlassButton' && node.props.title === 'Enviar a 0 personas').props.disabled).toBe(true);
  });

  test('uses the known profile theme fallback when public presentation metadata is absent or unknown', async () => {
    social.circle.mockResolvedValue({ profiles: [
      { uid: 'member-2', alias: 'Legacy', avatarId: 'capybara-athlete', categories: {}, presentationThemeId: null, relationshipStatus: 'bro' },
      { uid: 'member-3', alias: 'Unknown', avatarId: 'capybara-athlete', categories: {}, presentationThemeId: 'not-a-theme', relationshipStatus: 'bro' },
    ], nextCursor: null });
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(SharePlanScreen)); });

    expect(tree!.root.findAll((node) => String(node.type) === 'LinearGradient').map((node) => node.props.colors)).toEqual([
      ['#E85D04', '#F48C06', '#DC2F02'],
      ['#E85D04', '#F48C06', '#DC2F02'],
    ]);
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toContain('Bro');
  });

  test('toggles multiple recipients with an accessible selected state', async () => {
    social.circle.mockResolvedValue({ profiles: [
      { uid: 'member-2', alias: 'First', avatarId: 'capybara-athlete', categories: {}, relationshipStatus: 'bro' },
      { uid: 'member-3', alias: 'Second', avatarId: 'capybara-athlete', categories: {}, relationshipStatus: 'partner' },
    ], nextCursor: null });
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(SharePlanScreen)); });
    const recipients = () => tree!.root.findAll((node) => (node.type as unknown) === 'Pressable' && node.props.accessibilityRole === 'checkbox');
    expect(recipients().map((node) => node.props.accessibilityState.selected)).toEqual([false, false]);

    await act(async () => { recipients()[0].props.onPress(); recipients()[1].props.onPress(); });

    expect(recipients().map((node) => node.props.accessibilityState.selected)).toEqual([true, true]);
    expect(tree!.root.find((node) => String(node.type) === 'GlassButton' && node.props.title === 'Enviar a 2 personas').props.disabled).toBe(false);

    await act(async () => { recipients()[0].props.onPress(); });
    expect(recipients().map((node) => node.props.accessibilityState.selected)).toEqual([false, true]);
    expect(tree!.root.find((node) => String(node.type) === 'GlassButton' && node.props.title === 'Enviar a 1 persona').props.disabled).toBe(false);
  });

  test('sends every selected recipient and reports the full success count', async () => {
    social.circle.mockResolvedValue({ profiles: [
      { uid: 'member-2', alias: 'First', avatarId: 'capybara-athlete', categories: {}, relationshipStatus: 'bro' },
      { uid: 'member-3', alias: 'Second', avatarId: 'capybara-athlete', categories: {}, relationshipStatus: 'partner' },
    ], nextCursor: null });
    social.createPrivatePlanShareRequest.mockResolvedValue('share-1');
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(SharePlanScreen)); });
    const recipients = () => tree!.root.findAll((node) => (node.type as unknown) === 'Pressable' && node.props.accessibilityRole === 'checkbox');
    await act(async () => { recipients()[0].props.onPress(); recipients()[1].props.onPress(); });
    await act(async () => { tree!.root.find((node) => String(node.type) === 'GlassButton' && node.props.title === 'Enviar a 2 personas').props.onPress(); });

    expect(social.createPrivatePlanShareRequest).toHaveBeenNthCalledWith(1, 'member-2', 'routine', 'routine-1');
    expect(social.createPrivatePlanShareRequest).toHaveBeenNthCalledWith(2, 'member-3', 'routine', 'routine-1');
    expect(Alert.alert).toHaveBeenCalledWith('Planes enviados', 'Upper llegará a 2 personas para que puedan revisarlo.');
    expect(tree!.root.find((node) => String(node.type) === 'GlassButton' && node.props.title === 'Enviar a 0 personas').props.disabled).toBe(true);
  });

  test('retains failed recipients for retry and reports a partial send', async () => {
    social.circle.mockResolvedValue({ profiles: [
      { uid: 'member-2', alias: 'First', avatarId: 'capybara-athlete', categories: {}, relationshipStatus: 'bro' },
      { uid: 'member-3', alias: 'Second', avatarId: 'capybara-athlete', categories: {}, relationshipStatus: 'partner' },
    ], nextCursor: null });
    social.createPrivatePlanShareRequest.mockImplementation((profileId: string) => profileId === 'member-2' ? Promise.resolve('share-1') : Promise.reject(new Error('blocked')));
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(SharePlanScreen)); });
    const recipients = () => tree!.root.findAll((node) => (node.type as unknown) === 'Pressable' && node.props.accessibilityRole === 'checkbox');
    await act(async () => { recipients()[0].props.onPress(); recipients()[1].props.onPress(); });
    await act(async () => { tree!.root.find((node) => String(node.type) === 'GlassButton' && node.props.title === 'Enviar a 2 personas').props.onPress(); });

    expect(Alert.alert).toHaveBeenCalledWith('Envío parcial', 'Se enviaron 1 de 2 solicitudes. 1 persona sigue seleccionada para reintentar.');
    expect(recipients().map((node) => node.props.accessibilityState.selected)).toEqual([false, true]);
    expect(tree!.root.find((node) => String(node.type) === 'GlassButton' && node.props.title === 'Enviar a 1 persona').props.disabled).toBe(false);

    social.createPrivatePlanShareRequest.mockResolvedValue('share-2');
    await act(async () => { tree!.root.find((node) => String(node.type) === 'GlassButton' && node.props.title === 'Enviar a 1 persona').props.onPress(); });
    expect(social.createPrivatePlanShareRequest).toHaveBeenLastCalledWith('member-3', 'routine', 'routine-1');
  });

  test('renders received plan sender identity with the supplied theme, avatar, and content kind', async () => {
    social.listReceivedPrivatePlanShareRequests.mockResolvedValue([{ id: 'share-1', senderAlias: 'Theme athlete', senderAvatarId: 'capigirl', senderThemeId: 'moon', contentKind: 'mesocycle', createdAt: '2026-08-02T00:00:00.000Z', snapshot: { routines: [], mesocycles: [], mesocycle: { id: 'mesocycle-1', name: 'Strength block', durationWeeks: 4, weeks: [{ id: 'week-1', weekNumber: 1, entries: [{ id: 'session-1', ref: { routineId: 'routine-1', routineName: 'Upper', source: 'local' }, order: 1 }, { id: 'rest-1', kind: 'rest' }] }], status: 'draft', goal: 'Fuerza máxima', createdAt: '2026-08-02T00:00:00.000Z' } } }]);
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(PlanInboxScreen)); });

    expect(tree!.root.find((node) => String(node.type) === 'LinearGradient').props.colors).toEqual(['#9FA8DA', '#C5CAE9', '#5C6BC0']);
    expect(tree!.root.find((node) => String(node.type) === 'ProfileAvatar').props.avatarId).toBe('capigirl');
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toEqual(expect.arrayContaining(['Theme athlete', 'MESOCICLO', 'Strength block', 'Estructura del mesociclo', 'Objetivo: Fuerza máxima', 'Semana 1: Upper · Descanso']));
  });
});
