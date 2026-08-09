import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const client = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  functions: { invoke: vi.fn() },
  auth: { getSession: vi.fn(), getUser: vi.fn() },
  realtime: { setAuth: vi.fn() },
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));
const authState = vi.hoisted(() => ({ user: 'member-1' as string | null }));
const workoutData = vi.hoisted(() => ({ attempts: [] }));

vi.mock('../services/supabase', () => ({
  supabase: client,
  supabaseConfigurationError: null,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}));
vi.mock('../context/DataContext', () => ({
  useData: () => workoutData,
}));

import {
  getCirclePage,
  getBlockedUsersPage,
  getDiscoveryPage,
  getPublicProfile,
  getRequestPage,
  getOwnProfile,
  getSocialProfileInsightsBatch,
  bootstrapOwnProfile,
  normalizeAliasPrefix,
  runGraphCommand,
  searchProfiles,
  saveOwnProfile,
  syncOwnPresentationTheme,
  subscribeToSocialGraphChanges,
} from '../services/socialGraph';
import { SocialProvider, useSocial } from '../context/SocialContext';

describe('social graph client boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = 'member-1';
    client.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'member-1' }, access_token: 'access-token' } },
      error: null,
    });
  });

  test('uses server-owned projections for discovery, circle, requests, blocked users, and relationship-aware alias search', async () => {
    client.rpc.mockResolvedValue({
      data: [{ id: 'member-1', alias: 'José', categories: { style: 'powerlifting' }, relationship_status: 'partner', next_cursor: 'cursor-2' }],
      error: null,
    });

    expect(normalizeAliasPrefix('  JÓSE  ')).toBe('jose');
    await expect(searchProfiles('  JÓSE  ', 'cursor-1')).resolves.toEqual({
      profiles: [{ uid: 'member-1', alias: 'José', avatarId: 'capybara-athlete', categories: { style: 'powerlifting' }, presentationThemeId: null, relationshipStatus: 'partner' }],
      nextCursor: 'cursor-2',
    });
    await getDiscoveryPage();
    await getCirclePage();
    await getRequestPage();
    await getBlockedUsersPage();

    expect(client.rpc).toHaveBeenNthCalledWith(1, 'search_aliases', {
      prefix: 'jose',
      cursor: 'cursor-1',
      page_size: 20,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'list_directory', {
      cursor: null,
      page_size: 20,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(3, 'list_circle', {
      cursor: null,
      page_size: 20,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(4, 'list_requests', {
      cursor: null,
      page_size: 20,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(5, 'list_blocked_users', {
      cursor: null,
      page_size: 20,
    });
  });

  test('maps only the safe presentation theme from public profile lookups', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'member-2', alias: 'Theme athlete', avatar_id: 'capigirl', categories: { style: 'strength' }, presentation_theme_id: 'moon' }, error: null });
    client.from.mockReturnValue({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) });

    await expect(getPublicProfile('member-2')).resolves.toEqual({ uid: 'member-2', alias: 'Theme athlete', avatarId: 'capigirl', categories: { style: 'strength' }, presentationThemeId: 'moon' });
    expect(client.from).toHaveBeenCalledWith('public_profiles');
  });

  test('loads list insights in one bounded RPC and preserves only safe aggregate fields', async () => {
    client.rpc.mockResolvedValue({ data: { 'member-2': { progress: { level: 8, rank: 'Intermedio' }, muscle_distribution: [{ id: 'GM-001', label: 'Pecho', value: 4 }] } }, error: null });
    await expect(getSocialProfileInsightsBatch(['member-2', 'member-2'])).resolves.toEqual({ 'member-2': { progress: { level: 8, rank: 'Intermedio' }, muscleDistribution: [{ id: 'GM-001', label: 'Pecho', value: 4 }] } });
    expect(client.rpc).toHaveBeenCalledWith('list_social_profile_insights', { targets: ['member-2'] });
  });

  test('uses actor-bound RPCs for private profile reads, saves, and presentation-theme updates', async () => {
    client.rpc
      .mockResolvedValueOnce({ data: { id: 'member-1', alias: 'Bro', categories: {}, category_visibility: {} }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(getOwnProfile()).resolves.toEqual({ uid: 'member-1', alias: 'Bro', avatarId: 'capybara-athlete', categories: {}, categoryVisibility: {}, autoShareCompletedWorkouts: true, shareRoutineTemplate: true, shareMesocycleTemplate: true, sharePerformedSetDetails: true, shareSocialActivity: true, shareSocialProgress: true, shareSocialConsistency: true, shareSocialStatistics: true, shareSocialMuscleDistribution: true });
    await saveOwnProfile({ alias: 'Bro', categories: {}, categoryVisibility: {}, autoShareCompletedWorkouts: false });
    await syncOwnPresentationTheme('moon');

    expect(client.rpc).toHaveBeenNthCalledWith(1, 'get_own_profile', {});
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'save_own_profile', {
      profile_input: {
        alias: 'Bro', avatar_id: 'capybara-athlete', categories: {}, category_visibility: {}, auto_share_completed_workouts: false, share_routine_template: true, share_mesocycle_template: true, share_performed_set_details: true, share_social_activity: true, share_social_progress: true, share_social_consistency: true, share_social_statistics: true, share_social_muscle_distribution: true,
      },
    });
    expect(client.rpc).toHaveBeenNthCalledWith(3, 'update_own_presentation_theme', { theme_id: 'moon' });
    expect(client.auth.getUser).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  test('bootstraps the own profile through the server-owned RPC without reading auth data or writing profiles directly', async () => {
    client.rpc.mockResolvedValue({ data: null, error: null });

    await expect(bootstrapOwnProfile()).resolves.toBeUndefined();

    expect(client.rpc).toHaveBeenCalledWith('ensure_own_profile', {});
    expect(client.auth.getUser).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  test('surfaces server-owned profile bootstrap failures', async () => {
    client.rpc.mockResolvedValue({ data: null, error: { message: 'authentication required' } });

    await expect(bootstrapOwnProfile()).rejects.toThrow('authentication required');
  });

  test('normalizes malformed profile records without coercing false preferences', async () => {
    client.rpc.mockResolvedValue({ data: {
      id: 'member-1', alias: 'Bro', categories: { legacy: 'keep', malformed: 4 },
      category_visibility: { legacy: false, malformed: 'false' }, auto_share_completed_workouts: false,
      share_routine_template: 'false', share_mesocycle_template: {}, share_performed_set_details: false,
    }, error: null });

    await expect(getOwnProfile()).resolves.toEqual({
      uid: 'member-1', alias: 'Bro', avatarId: 'capybara-athlete', categories: { legacy: 'keep' }, categoryVisibility: { legacy: false },
      autoShareCompletedWorkouts: false, shareRoutineTemplate: true, shareMesocycleTemplate: true, sharePerformedSetDetails: false, shareSocialActivity: true, shareSocialProgress: true, shareSocialConsistency: true, shareSocialStatistics: true, shareSocialMuscleDistribution: true,
    });
  });

  test('uses actor-bound RPCs for graph mutations and returns safe errors', async () => {
    client.rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { targetId: 'member-2', incomingRequest: true }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { targetId: 'member-2' }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { targetId: 'member-2' }, error: null });

    await expect(runGraphCommand({ command: 'sendRequest', targetId: 'member-2', relationshipKind: 'partner' })).resolves.toEqual({
      targetId: 'member-2',
      incomingRequest: true,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'graph_send_request', { target: 'member-2', requested_kind: 'partner' });
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'graph_summary', { target: 'member-2' });

    await runGraphCommand({ command: 'respondRequest', targetId: 'member-2', accepted: true });
    await runGraphCommand({ command: 'downgradePartner', targetId: 'member-2' });
    expect(client.rpc).toHaveBeenNthCalledWith(3, 'graph_respond_request', { requester_input: 'member-2', accepted: true });
    expect(client.rpc).toHaveBeenNthCalledWith(5, 'graph_downgrade_partner', { target: 'member-2' });

    const safeFailures = [
      ['graph_request_pending', 'Ya hay una solicitud pendiente entre ustedes.'],
      ['graph_transition_unavailable', 'Esta transición de relación no está disponible.'],
      ['graph_action_blocked', 'No podés realizar esta acción con este perfil.'],
      ['graph_command_failed', 'No se pudo completar la acción. Inténtalo de nuevo.'],
    ];
    for (const [code, message] of safeFailures) {
      const databaseMessage = code === 'graph_request_pending' ? 'request already pending'
        : code === 'graph_transition_unavailable' ? 'relationship transition unavailable'
          : code === 'graph_action_blocked' ? 'graph action blocked' : 'unexpected database failure';
      client.rpc.mockResolvedValueOnce({ data: null, error: { message: databaseMessage } });
      await expect(runGraphCommand({ command: 'block', targetId: 'member-2' })).rejects.toThrow(message);
    }
  });

  test('authorizes scoped Realtime changes, reconnects through the shared client, and removes its channel', async () => {
    const handlers: Array<() => void> = [];
    const channel = {
      on: vi.fn((_type, _filter, handler) => { handlers.push(handler); return channel; }),
      subscribe: vi.fn(() => channel),
    };
    client.channel.mockReturnValue(channel);
    const invalidate = vi.fn();

    const unsubscribe = await subscribeToSocialGraphChanges(invalidate);

    expect(client.realtime.setAuth).toHaveBeenCalledWith('access-token');
    expect(client.channel).toHaveBeenCalledWith('social-graph:member-1');
    expect(channel.on).toHaveBeenCalledTimes(7);
    handlers.forEach((handler) => handler());
    expect(invalidate).toHaveBeenCalledTimes(7);

    unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  test('updates Community consumers after an authorized relationship event without navigation reload', async () => {
    let current: ReturnType<typeof useSocial> | undefined;
    let relationshipHandler: (() => void) | undefined;
    const channel = {
      on: vi.fn((_type, filter, handler) => {
        if (filter.table === 'relationships') relationshipHandler = handler;
        return channel;
      }),
      subscribe: vi.fn(() => channel),
    };
    client.channel.mockReturnValue(channel);
    const Probe = () => { current = useSocial(); return null; };
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(SocialProvider, null, React.createElement(Probe))); });
    expect(current?.realtimeRevision).toBe(0);
    await act(async () => { relationshipHandler?.(); });
    expect(current?.realtimeRevision).toBe(1);

    await act(async () => { tree!.unmount(); });
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
