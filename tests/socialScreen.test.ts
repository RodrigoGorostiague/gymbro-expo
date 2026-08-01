import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';

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
  getWorkoutRecaps: vi.fn(),
  createWorkoutRecap: vi.fn(),
  deleteWorkoutRecap: vi.fn(),
  failedAutoRecapSessionIds: new Set<string>(),
  clearFailedAutoRecapSession: vi.fn(),
  realtimeRevision: 0,
}));
const alert = vi.hoisted(() => vi.fn());

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({ children, ...props }: { children?: React.ReactNode }) => ReactModule.createElement(name, props, children);
  return {
    Alert: { alert },
    RefreshControl: host('RefreshControl'),
    ScrollView: host('ScrollView'),
    StyleSheet: { create: <T,>(styles: T) => styles },
    Switch: host('Switch'),
    Text: host('Text'),
    View: host('View'),
  };
});
vi.mock('../context/SocialContext', () => ({ useSocial: () => social }));
const workoutData = vi.hoisted(() => ({ sessions: [] as Array<Record<string, unknown>>, ensureRecapPublicationKey: vi.fn() }));
vi.mock('../context/DataContext', () => ({ useData: () => workoutData }));
vi.mock('../services/workoutRecapFeed', () => ({ recapInputFromSession: vi.fn() }));
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ theme: { text: '#111', textMuted: '#666', primary: '#00f', success: '#0a0' } }),
}));
vi.mock('../components/AppScreenHeader', () => ({ AppScreenHeader: () => null }));
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

describe('Community feed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    social.discover.mockResolvedValue({ profiles: [], nextCursor: null });
    social.circle.mockResolvedValue({ profiles: [], nextCursor: null });
    social.requests.mockResolvedValue({ profiles: [], nextCursor: null });
    social.blockedUsers.mockResolvedValue({ profiles: [{ uid: 'blocked-1', alias: 'Blocked athlete', categories: { style: 'strength' } }], nextCursor: null });
    social.command.mockResolvedValue({ targetId: 'blocked-1' });
    social.getWorkoutRecaps.mockResolvedValue({ recaps: [], nextCursor: null });
    Object.assign(social.ownProfile, {
      uid: 'member-1', alias: 'Blocker', categories: {}, categoryVisibility: {}, autoShareCompletedWorkouts: true,
      shareRoutineTemplate: true, shareMesocycleTemplate: true, sharePerformedSetDetails: true,
    });
    social.ownProfile.autoShareCompletedWorkouts = true;
    social.failedAutoRecapSessionIds = new Set<string>();
    workoutData.sessions = [];
  });

  test('shows manual recap controls when automatic sharing is disabled', async () => {
    social.ownProfile.autoShareCompletedWorkouts = false;
    workoutData.sessions = [{
      id: 'session-1', routineId: 'routine-1', routineName: 'Upper', completedAt: '2026-08-01T10:00:00Z',
      durationSeconds: 600, restTimerSeconds: 0, exercises: [],
    }];
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(SocialScreen)); });

    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && node.props.title === 'Compartir: Upper')).toHaveLength(1);
    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && node.props.title === 'Publicar resumen')).toHaveLength(1);
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
    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && node.props.title === 'Eliminar')).toHaveLength(1);
    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && node.props.title === 'Ver detalle')).toHaveLength(1);
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

  test('shows recovery controls only for failed automatic shares', async () => {
    workoutData.sessions = [{
      id: 'session-1', routineId: 'routine-1', routineName: 'Upper', completedAt: '2026-08-01T10:00:00Z',
      durationSeconds: 600, restTimerSeconds: 0, exercises: [],
    }];
    social.failedAutoRecapSessionIds = new Set(['session-1']);
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(SocialScreen)); });

    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && node.props.title === 'Compartir: Upper')).toHaveLength(1);
    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && node.props.title === 'Publicar resumen')).toHaveLength(1);
  });

  test('keeps self identity and blocked-user access in Profile, outside the feed', async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(ProfileScreen)); });

    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && node.props.title === 'Usuarios bloqueados')).toHaveLength(1);
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).not.toContain('Entrenamientos compartidos');
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
    expect(switches).toHaveLength(6);
    expect(switches.map((node) => node.props.value)).toEqual([true, true, true, true, true, true]);
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
    expect(switches.map((node) => node.props.value)).toEqual([true, false, true, true, true, false]);
  });

  test('renders loading and malformed profiles with valid Switch props when focus refresh throws synchronously', async () => {
    social.ownProfile = null as never;
    social.refreshOwnProfile.mockImplementation(() => { throw new Error('Offline'); });
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(ProfileScreen)); });

    expect(tree!.root.findAll((node) => String(node.type) === 'Switch')).toHaveLength(6);
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

    expect(tree!.root.findAll((node) => String(node.type) === 'Switch')).toHaveLength(6);
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
      categories: {},
      categoryVisibility: {},
      autoShareCompletedWorkouts: true,
      shareRoutineTemplate: false,
      shareMesocycleTemplate: true,
      sharePerformedSetDetails: true,
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
