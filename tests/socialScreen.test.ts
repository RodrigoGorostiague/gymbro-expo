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

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({ children, ...props }: { children?: React.ReactNode }) => ReactModule.createElement(name, props, children);
  return {
    Alert: { alert: vi.fn() },
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

describe('Community blocked-users section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    social.discover.mockResolvedValue({ profiles: [], nextCursor: null });
    social.circle.mockResolvedValue({ profiles: [], nextCursor: null });
    social.requests.mockResolvedValue({ profiles: [], nextCursor: null });
    social.blockedUsers.mockResolvedValue({ profiles: [{ uid: 'blocked-1', alias: 'Blocked athlete', categories: { style: 'strength' } }], nextCursor: null });
    social.command.mockResolvedValue({ targetId: 'blocked-1' });
    social.getWorkoutRecaps.mockResolvedValue({ recaps: [], nextCursor: null });
    social.ownProfile.autoShareCompletedWorkouts = true;
    social.failedAutoRecapSessionIds = new Set<string>();
    workoutData.sessions = [];
  });

  test('renders only the owner projection and unblocks through the trusted command boundary', async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SocialScreen)); });

    expect(social.blockedUsers).toHaveBeenCalled();
    const unblockButton = tree!.root.findAll((node) => String(node.type) === 'GlassButton' && node.props.title === 'Desbloquear')[0];
    expect(unblockButton).toBeDefined();

    await act(async () => { unblockButton!.props.onPress(); });

    expect(social.command).toHaveBeenCalledWith({ command: 'unblock', targetId: 'blocked-1' });
    expect(social.blockedUsers).toHaveBeenCalledTimes(2);
    expect(tree!.root.findAll((node) => String(node.type) === 'GlassButton' && node.props.title === 'Ver')).toHaveLength(0);
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
        durationSeconds: 600, exerciseCount: 3, muscleGroupIds: ['pecho'], metrics: { volume: 1200 }, caption: null, createdAt: '2026-08-01T10:00:00Z',
      }],
      nextCursor: null,
    });
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(SocialScreen)); });

    expect(social.getWorkoutRecaps).toHaveBeenCalled();
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toEqual(expect.arrayContaining(['Entrenamientos compartidos', 'Upper']));
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
});
