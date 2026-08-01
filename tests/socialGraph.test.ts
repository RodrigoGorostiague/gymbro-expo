import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { FunctionsHttpError } from '@supabase/supabase-js';

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
  getRequestPage,
  getOwnProfile,
  normalizeAliasPrefix,
  runGraphCommand,
  searchProfiles,
  saveOwnProfile,
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
      profiles: [{ uid: 'member-1', alias: 'José', categories: { style: 'powerlifting' }, relationshipStatus: 'partner' }],
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

  test('persists the default-enabled completed-workout sharing preference with the private profile', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'member-1', alias: 'Bro', categories: {}, category_visibility: {} }, error: null });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    client.from.mockImplementation((table: string) => table === 'profiles'
      ? { select: vi.fn(() => ({ maybeSingle })), upsert }
      : undefined);
    client.auth.getUser.mockResolvedValue({ data: { user: { id: 'member-1' } }, error: null });

    await expect(getOwnProfile()).resolves.toEqual({ uid: 'member-1', alias: 'Bro', categories: {}, categoryVisibility: {}, autoShareCompletedWorkouts: true });
    await saveOwnProfile({ alias: 'Bro', categories: {}, categoryVisibility: {}, autoShareCompletedWorkouts: false });
    expect(upsert).toHaveBeenCalledWith({
      id: 'member-1', alias: 'Bro', categories: {}, category_visibility: {}, auto_share_completed_workouts: false,
    });
  });

  test('uses the trusted Edge Function for graph mutations and returns safe errors', async () => {
    client.functions.invoke.mockResolvedValue({ data: { summary: { targetId: 'member-2', incomingRequest: true } }, error: null });

    await expect(runGraphCommand({ command: 'sendRequest', targetId: 'member-2', relationshipKind: 'partner' })).resolves.toEqual({
      targetId: 'member-2',
      incomingRequest: true,
    });
    expect(client.functions.invoke).toHaveBeenCalledWith('social-graph', {
      body: { command: 'sendRequest', targetId: 'member-2', relationshipKind: 'partner' },
    });

    await runGraphCommand({ command: 'respondRequest', targetId: 'member-2', accepted: true });
    await runGraphCommand({ command: 'downgradePartner', targetId: 'member-2' });
    expect(client.functions.invoke).toHaveBeenNthCalledWith(2, 'social-graph', { body: { command: 'respondRequest', targetId: 'member-2', accepted: true } });
    expect(client.functions.invoke).toHaveBeenNthCalledWith(3, 'social-graph', { body: { command: 'downgradePartner', targetId: 'member-2' } });

    const safeFailures = [
      ['graph_request_pending', 'Ya hay una solicitud pendiente entre ustedes.'],
      ['graph_transition_unavailable', 'Esta transición de relación no está disponible.'],
      ['graph_action_blocked', 'No podés realizar esta acción con este perfil.'],
      ['graph_command_failed', 'No se pudo completar la acción. Inténtalo de nuevo.'],
    ];
    for (const [code, message] of safeFailures) {
      client.functions.invoke.mockResolvedValue({
        data: null,
        error: new FunctionsHttpError({ json: vi.fn().mockResolvedValue({ code, message }) }),
      });
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
