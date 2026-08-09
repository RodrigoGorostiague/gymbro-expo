import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CommunityBadgeCounts } from '../services/communityBadge';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const social = vi.hoisted(() => ({
  ownProfile: { uid: 'member-1', alias: 'Blocker', categories: {}, categoryVisibility: {}, autoShareCompletedWorkouts: true },
  refreshOwnProfile: vi.fn().mockResolvedValue(undefined),
  saveProfile: vi.fn(),
  discover: vi.fn().mockResolvedValue({ profiles: [], nextCursor: null }),
  search: vi.fn().mockResolvedValue({ profiles: [], nextCursor: null }),
  circle: vi.fn().mockResolvedValue({ profiles: [], nextCursor: null }),
  requests: vi.fn().mockResolvedValue({ profiles: [], nextCursor: null }),
  blockedUsers: vi.fn().mockResolvedValue({ profiles: [{ uid: 'blocked-1', alias: 'Blocked athlete', categories: { style: 'strength' } }], nextCursor: null }),
  command: vi.fn().mockResolvedValue({ targetId: 'blocked-1' }),
  getProfileInsights: vi.fn().mockResolvedValue({ muscleDistribution: [{ id: 'chest', label: 'Pecho', value: 8 }] }),
  getWorkoutRecaps: vi.fn(),
  getCommunityActivities: vi.fn().mockResolvedValue({ activities: [], nextCursor: null }),
  createWorkoutRecap: vi.fn(),
  deleteWorkoutRecap: vi.fn(),
  failedAutoRecapSessionIds: new Set<string>(),
  clearFailedAutoRecapSession: vi.fn(),
  realtimeRevision: 0,
}));
const alert = vi.hoisted(() => vi.fn());
const feedServices = vi.hoisted(() => ({
  listJointWorkoutPosts: vi.fn(async () => []),
  listWorkoutStartActivities: vi.fn(async (): Promise<any[]> => []),
  getCommunityBadgeCounts: vi.fn(async (): Promise<CommunityBadgeCounts | null> => null),
}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({ children, ...props }: { children?: React.ReactNode }) => ReactModule.createElement(name, props, children);
  return {
    Alert: { alert },
    RefreshControl: host('RefreshControl'),
    Platform: { OS: 'ios', Version: '17' },
    ScrollView: host('ScrollView'),
    StyleSheet: { create: <T,>(styles: T) => styles },
    Switch: host('Switch'),
    Text: host('Text'),
    View: host('View'),
  };
});
vi.mock('../context/SocialContext', () => ({ useSocial: () => social }));
vi.mock('../services/onboarding', () => ({ getOwnOnboarding: vi.fn(async () => ({ sex: 'male' })) }));
const workoutData = vi.hoisted(() => ({ sessions: [] as Array<Record<string, unknown>>, ensureRecapPublicationKey: vi.fn() }));
vi.mock('../context/DataContext', () => ({ useData: () => workoutData }));
vi.mock('../services/workoutRecapFeed', () => ({ recapInputFromSession: vi.fn() }));
vi.mock('../services/jointWorkouts', () => ({ listJointWorkoutPosts: feedServices.listJointWorkoutPosts }));
vi.mock('../services/workoutStartActivity', () => ({ listWorkoutStartActivities: feedServices.listWorkoutStartActivities }));
vi.mock('../services/communityBadge', () => ({ getCommunityBadgeCounts: feedServices.getCommunityBadgeCounts }));
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ theme: { text: '#111', textMuted: '#666', primary: '#00f', success: '#0a0' } }),
}));
vi.mock('../components/AppScreenHeader', () => ({ AppScreenHeader: () => null }));
vi.mock('../components/MuscleDistributionRadar', async () => {
  const ReactModule = await import('react');
  return { MuscleDistributionRadar: (props: Record<string, unknown>) => ReactModule.createElement('MuscleDistributionRadar', props) };
});
vi.mock('../components/ProfileAvatar', async () => {
  const ReactModule = await import('react');
  return { ProfileAvatar: (props: Record<string, unknown>) => ReactModule.createElement('ProfileAvatar', props) };
});
vi.mock('expo-linear-gradient', async () => {
  const ReactModule = await import('react');
  return { LinearGradient: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => ReactModule.createElement('LinearGradient', props, children) };
});
vi.mock('../components/AppNavBar', () => ({ AppNavBar: () => null }));
vi.mock('../components/HapticPressable', async () => {
  const ReactModule = await import('react');
  return { HapticPressable: ({ children, ...props }: { children: React.ReactNode }) => ReactModule.createElement('HapticPressable', props, children) };
});
vi.mock('../components/GlassCard', async () => {
  const ReactModule = await import('react');
  return {
    GlassCard: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('GlassCard', null, children),
    ThemeBackground: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('ThemeBackground', null, children),
  };
});
vi.mock('../components/UI', async () => {
  const ReactModule = await import('react');
  return {
    GlassButton: (props: { title: string; onPress: () => void }) => ReactModule.createElement('GlassButton', props),
    GlassInput: (props: Record<string, unknown>) => ReactModule.createElement('GlassInput', props),
  };
});

import SocialScreen from '../app/social/index';
import ProfileScreen from '../app/profile/index';
import RequestsScreen from '../app/community/requests';
import CommunityFeedScreen from '../app/community/feed';

describe('Community feed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    social.discover.mockResolvedValue({ profiles: [], nextCursor: null });
    social.circle.mockResolvedValue({ profiles: [], nextCursor: null });
    social.requests.mockResolvedValue({ profiles: [], nextCursor: null });
    social.blockedUsers.mockResolvedValue({ profiles: [{ uid: 'blocked-1', alias: 'Blocked athlete', categories: { style: 'strength' } }], nextCursor: null });
    social.command.mockResolvedValue({ targetId: 'blocked-1' });
    social.getProfileInsights.mockResolvedValue({ muscleDistribution: [{ id: 'chest', label: 'Pecho', value: 8 }] });
    social.getWorkoutRecaps.mockResolvedValue({ recaps: [], nextCursor: null });
    social.getCommunityActivities.mockResolvedValue({ activities: [], nextCursor: null });
    Object.assign(social.ownProfile, {
      uid: 'member-1', alias: 'Blocker', categories: {}, categoryVisibility: {}, autoShareCompletedWorkouts: true,
      shareRoutineTemplate: true, shareMesocycleTemplate: true, sharePerformedSetDetails: true,
    });
    social.ownProfile.autoShareCompletedWorkouts = true;
    social.failedAutoRecapSessionIds = new Set<string>();
    workoutData.sessions = [];
    feedServices.listJointWorkoutPosts.mockResolvedValue([]);
    feedServices.listWorkoutStartActivities.mockResolvedValue([]);
    feedServices.getCommunityBadgeCounts.mockResolvedValue(null);
  });

  afterEach(() => { vi.useRealTimers(); });

  test('does not expose manual publishing when automatic sharing is disabled', async () => {
    social.ownProfile.autoShareCompletedWorkouts = false;
    workoutData.sessions = [{
      id: 'session-1', routineId: 'routine-1', routineName: 'Upper', completedAt: '2026-08-01T10:00:00Z',
      durationSeconds: 600, restTimerSeconds: 0, exercises: [],
    }];
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(SocialScreen)); });

    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && String(node.props.title).includes('Compartir:'))).toHaveLength(0);
    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && node.props.title === 'Publicar resumen')).toHaveLength(0);
  });

  test('renders own recaps without a feature flag or accepted connections', async () => {
    social.getWorkoutRecaps.mockResolvedValue({
      recaps: [{
        id: 'recap-1', authorAlias: 'Blocker', routineName: 'Upper', completedAt: '2026-08-01T10:00:00Z',
        durationSeconds: 600, exerciseCount: 3, muscleGroupIds: ['pecho'], metrics: { volume: 1200 }, caption: null, createdAt: '2026-08-01T10:00:00Z', templateAvailable: false, mesocycleAvailable: false, isAuthor: true,
      }],
      nextCursor: null,
    });
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(SocialScreen)); });

    expect(social.getWorkoutRecaps).toHaveBeenCalled();
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toEqual(expect.arrayContaining(['Feed', 'Upper']));
    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && node.props.title === 'Eliminar publicación')).toHaveLength(1);
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toContain('Ver entrenamiento completo');
  });

  test('renders author avatar and the author theme mix on each recap', async () => {
    social.getWorkoutRecaps.mockResolvedValue({
      recaps: [{
        id: 'recap-presentation', authorAlias: 'Brisas', authorAvatarId: 'capybara-mark', authorThemeId: 'profile-brisas', routineName: 'Upper', completedAt: '2026-08-01T10:00:00Z',
        durationSeconds: 600, exerciseCount: 3, muscleGroupIds: [], metrics: {}, caption: null, createdAt: '2026-08-01T10:00:00Z', templateAvailable: false, mesocycleAvailable: false, isAuthor: false,
      }],
      nextCursor: null,
    });
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(CommunityFeedScreen)); });

    expect(tree!.root.find((node) => String(node.type) === 'ProfileAvatar').props.avatarId).toBe('capybara-mark');
    expect(tree!.root.find((node) => String(node.type) === 'LinearGradient').props.colors).toEqual(['#D63384', '#FF85C0', '#9B59B6']);
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toContain('Brisas');
  });

  test('keeps joint invitations on the single training entry, outside pending inboxes', async () => {
    feedServices.getCommunityBadgeCounts.mockResolvedValue({ incomingRequests: 2, unreadNotifications: 1, jointInvitations: 3, planShareRequests: 4, total: 10 });
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(CommunityFeedScreen)); });

    const actions = tree!.root.findAll((node) => String(node.type) === 'HapticPressable');
    expect(actions.filter((node) => node.props.accessibilityLabel === 'Abrir Entrenar juntos, 3 pendientes')).toHaveLength(1);
    expect(actions.filter((node) => node.props.accessibilityLabel?.startsWith('Juntos'))).toHaveLength(0);
    expect(actions.filter((node) => node.props.accessibilityLabel?.startsWith('Solicitudes'))).toHaveLength(1);
    expect(actions.filter((node) => node.props.accessibilityLabel?.startsWith('Planes'))).toHaveLength(1);
    expect(actions.filter((node) => node.props.accessibilityLabel?.startsWith('Notificaciones'))).toHaveLength(1);
  });

  test('merges publication types from newest to oldest with subtle date sections', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T12:00:00Z'));
    social.getWorkoutRecaps.mockResolvedValue({
      recaps: [{
        id: 'recap-old', authorAlias: 'Alex', authorAvatarId: 'capybara-athlete', authorThemeId: null, routineName: 'Recap anterior', completedAt: '2026-08-06T10:00:00Z',
        durationSeconds: 600, exerciseCount: 3, muscleGroupIds: [], metrics: {}, caption: null, createdAt: '2026-08-06T10:00:00Z', templateAvailable: false, mesocycleAvailable: false, isAuthor: false,
      }], nextCursor: null,
    });
    social.getCommunityActivities.mockResolvedValue({ activities: [{ id: 'rank-mid', kind: 'rank_up', authorAlias: 'Brisas', authorAvatarId: 'capybara-athlete', authorThemeId: null, level: 4, rank: 'GymBro', createdAt: '2026-08-07T10:00:00Z' }], nextCursor: null });
    feedServices.listWorkoutStartActivities.mockResolvedValue([{ id: 'start-new', authorAlias: 'Cami', authorAvatarId: 'capybara-athlete', authorThemeId: null, routineName: 'Piernas', jointWorkoutId: null, startedAt: '2026-08-08T11:45:00Z', expiresAt: '2026-08-08T13:45:00Z', isAuthor: false }]);
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(CommunityFeedScreen)); });

    const text = tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''));
    expect(text.indexOf('Cami comenzó un entrenamiento')).toBeLessThan(text.indexOf('Nivel 4 · GymBro'));
    expect(text.indexOf('Nivel 4 · GymBro')).toBeLessThan(text.indexOf('Recap anterior'));
    expect(text).toEqual(expect.arrayContaining(['HOY', 'AYER', '6 DE AGOSTO', 'hace 15 min', 'hace 2 días']));
  });

  test('renders a foreign athlete milestone with their presentation theme', async () => {
    social.getCommunityActivities.mockResolvedValue({ activities: [{
      id: 'personal-record', kind: 'personal_record', authorAlias: 'Brisas', authorAvatarId: 'capybara-mark', authorThemeId: 'profile-brisas',
      payload: { exercise_name: 'Press banca', best_score: 960, score_unit: 'kg-reps' }, createdAt: '2026-08-08T11:00:00Z',
    }], nextCursor: null });
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(CommunityFeedScreen)); });

    const text = tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''));
    expect(text).toEqual(expect.arrayContaining(['Brisas', 'Superó su mejor marca', 'Press banca · 960 kg-reps']));
    expect(tree!.root.find((node) => String(node.type) === 'LinearGradient').props.colors).toEqual(['#D63384', '#FF85C0', '#9B59B6']);
  });

  test('hides manual recap controls while automatic sharing succeeds', async () => {
    workoutData.sessions = [{
      id: 'session-1', routineId: 'routine-1', routineName: 'Upper', completedAt: '2026-08-01T10:00:00Z',
      durationSeconds: 600, restTimerSeconds: 0, exercises: [],
    }];
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(SocialScreen)); });

    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && node.props.title === 'Compartir: Upper')).toHaveLength(0);
    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && node.props.title === 'Publicar resumen')).toHaveLength(0);
  });

  test('does not expose recovery controls for failed automatic shares', async () => {
    workoutData.sessions = [{
      id: 'session-1', routineId: 'routine-1', routineName: 'Upper', completedAt: '2026-08-01T10:00:00Z',
      durationSeconds: 600, restTimerSeconds: 0, exercises: [],
    }];
    social.failedAutoRecapSessionIds = new Set(['session-1']);
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(SocialScreen)); });

    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && String(node.props.title).includes('Compartir:'))).toHaveLength(0);
    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && node.props.title === 'Publicar resumen')).toHaveLength(0);
  });

  test('keeps self identity and blocked-user access in Profile, outside the feed', async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(ProfileScreen)); });

    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && node.props.title === 'Usuarios bloqueados')).toHaveLength(1);
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).not.toContain('Entrenamientos compartidos');
  });

  test('derives the private profile distribution without requesting restricted social insights', async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(ProfileScreen)); });

    expect(social.getProfileInsights).not.toHaveBeenCalled();
    expect(tree!.root.find((node) => String(node.type) === 'MuscleDistributionRadar').props.data).toEqual([]);
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toContain('Así se ve tu distribución en tu círculo.');
  });

  test('selects an available profile avatar for the athlete sex', async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(ProfileScreen)); });
    await act(async () => { tree!.root.find((node) => String(node.type) === 'HapticPressable' && node.props.accessibilityLabel === 'Editar avatar').props.onPress(); });
    await act(async () => { tree!.root.find((node) => String(node.type) === 'HapticPressable' && node.props.accessibilityLabel === 'Capybro cabello puntiagudo').props.onPress(); });
    await act(async () => { tree!.root.find((node) => String(node.type) === 'GlassButton' && node.props.title === 'Guardar perfil').props.onPress(); });

    expect(social.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ avatarId: 'capybro-spiky' }));
  });

  test('renders every profile switch with safe defaults for a legacy profile missing sharing fields', async () => {
    const legacyProfile = social.ownProfile as Record<string, unknown>;
    delete legacyProfile.categories;
    delete legacyProfile.categoryVisibility;
    delete legacyProfile.autoShareCompletedWorkouts;
    delete legacyProfile.shareRoutineTemplate;
    delete legacyProfile.shareMesocycleTemplate;
    delete legacyProfile.sharePerformedSetDetails;
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(ProfileScreen)); });

    const switches = tree!.root.findAll((node) => String(node.type) === 'Switch');
    expect(switches).toHaveLength(11);
    expect(switches.map((node) => node.props.value)).toEqual(Array(11).fill(true));
  });

  test('normalizes malformed profile fields while preserving valid false switch values', async () => {
    Object.assign(social.ownProfile as Record<string, unknown>, {
      categories: { trainingStyle: 7, about: { text: 'invalid' }, legacy: 'preserved' },
      categoryVisibility: { trainingStyle: 'false', about: false, legacy: 0 },
      autoShareCompletedWorkouts: 'false', shareRoutineTemplate: 0,
      shareMesocycleTemplate: {}, sharePerformedSetDetails: false,
    });
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(ProfileScreen)); });

    const switches = tree!.root.findAll((node) => String(node.type) === 'Switch');
    expect(switches.map((node) => node.props.value)).toEqual([true, false, true, true, true, false, true, true, true, true, true]);
  });

  test('renders loading and malformed profiles with valid Switch props when focus refresh throws synchronously', async () => {
    social.ownProfile = null as never;
    social.refreshOwnProfile.mockImplementation(() => { throw new Error('Offline'); });
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(ProfileScreen)); });

    expect(tree!.root.findAll((node) => String(node.type) === 'Switch')).toHaveLength(11);
    expect(tree!.root.find((node) => String(node.type) === 'GlassButton' && node.props.title === 'Crear perfil')).toBeDefined();
    expect(alert).toHaveBeenCalledWith('Perfil no disponible', 'Offline');

    social.ownProfile = {
      uid: 7,
      alias: { invalid: true },
      categories: [],
      categoryVisibility: null,
      autoShareCompletedWorkouts: 'false',
      shareRoutineTemplate: 0,
      shareMesocycleTemplate: {},
      sharePerformedSetDetails: false,
    } as never;
    social.refreshOwnProfile.mockResolvedValue(undefined);
    await act(async () => { tree!.update(React.createElement(ProfileScreen)); });

    const switches = tree!.root.findAll((node) => String(node.type) === 'Switch');
    expect(switches.every((node) => typeof node.props.value === 'boolean' && typeof node.props.onValueChange === 'function')).toBe(true);
    expect(tree!.root.findAll((node) => String(node.type) === 'GlassInput').every((node) => typeof node.props.value === 'string')).toBe(true);
  });

  test('alerts when focus refresh rejects asynchronously', async () => {
    social.refreshOwnProfile.mockRejectedValue(new Error('Async offline'));
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(ProfileScreen)); });

    expect(tree!.root.findAll((node) => String(node.type) === 'Switch')).toHaveLength(11);
    expect(alert).toHaveBeenCalledWith('Perfil no disponible', 'Async offline');
  });

  test('saves the changed sharing toggle as a boolean while preserving profile fields', async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(ProfileScreen)); });

    const routineTemplateToggle = tree!.root.find((node) => String(node.type) === 'Switch' && node.props.accessibilityLabel === 'Incluir plantilla de rutina');
    await act(async () => { routineTemplateToggle.props.onValueChange(false); });
    await act(async () => {
      tree!.root.find((node) => String(node.type) === 'GlassButton' && node.props.title === 'Guardar perfil').props.onPress();
    });

    expect(social.saveProfile).toHaveBeenCalledWith({
      alias: 'Blocker',
      avatarId: 'capybara-athlete',
      categories: {},
      categoryVisibility: {},
      autoShareCompletedWorkouts: true,
      shareRoutineTemplate: false,
      shareMesocycleTemplate: true,
      sharePerformedSetDetails: true,
      shareSocialActivity: true,
      shareSocialProgress: true,
      shareSocialConsistency: true,
      shareSocialStatistics: true,
      shareSocialMuscleDistribution: true,
    });
  });

  test('preserves unrelated categories and removes only blank editable categories when saving', async () => {
    Object.assign(social.ownProfile as Record<string, unknown>, {
      categories: { trainingStyle: 'Strength', about: 'Old bio', legacy: 'keep', future: 'keep too' },
    });
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(ProfileScreen)); });
    const inputs = tree!.root.findAll((node) => String(node.type) === 'GlassInput');

    await act(async () => {
      inputs.find((node) => node.props.placeholder === 'Estilo de entrenamiento')!.props.onChangeText('');
      inputs.find((node) => node.props.placeholder === 'Sobre ti')!.props.onChangeText('Updated bio');
    });
    await act(async () => { tree!.root.find((node) => String(node.type) === 'GlassButton' && node.props.title === 'Guardar perfil').props.onPress(); });

    expect(social.saveProfile).toHaveBeenCalledWith(expect.objectContaining({
      categories: { about: 'Updated bio', legacy: 'keep', future: 'keep too' },
    }));
  });

  test('loads additional pending requests without treating the first page as the complete list', async () => {
    social.requests
      .mockResolvedValueOnce({ profiles: [{ uid: 'request-1', alias: 'First', categories: {} }], nextCursor: 'next-page' })
      .mockResolvedValueOnce({ profiles: [{ uid: 'request-2', alias: 'Second', categories: {} }], nextCursor: null });
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(RequestsScreen)); });

    const loadMore = tree!.root.find((node) => String(node.type) === 'GlassButton' && node.props.title === 'Ver más');
    await act(async () => { loadMore.props.onPress(); });

    expect(social.requests).toHaveBeenNthCalledWith(1, null);
    expect(social.requests).toHaveBeenNthCalledWith(2, 'next-page');
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toEqual(expect.arrayContaining(['First', 'Second']));
  });
});
