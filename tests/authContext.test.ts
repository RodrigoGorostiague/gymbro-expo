import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  setSession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));
const storage = vi.hoisted(() => ({
  loadLegacyAlias: vi.fn(),
  migrateLegacyAliasToUid: vi.fn(),
}));

vi.mock('../services/supabase', () => ({
  supabaseConfigurationError: null,
  supabase: { auth },
  subscribeToSupabaseAppState: () => () => undefined,
}));
vi.mock('../utils/storage', () => storage);

import { AuthProvider, useAuth } from '../context/AuthContext';

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.loadLegacyAlias.mockResolvedValue('rodaja');
    storage.migrateLegacyAliasToUid.mockResolvedValue(undefined);
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1', email: 'member@example.com' } } }, error: null });
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    auth.signInWithPassword.mockResolvedValue({ error: null });
    auth.signUp.mockResolvedValue({ data: { session: { user: { id: 'uid-2' } } }, error: null });
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    auth.setSession.mockResolvedValue({ error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValue({ error: null });
  });

  test('hydrates a Supabase UID only after the legacy copy completes and signs out through Supabase', async () => {
    let current: ReturnType<typeof useAuth> | undefined;
    const Probe = () => { current = useAuth(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(AuthProvider, null, React.createElement(Probe))); });

    expect(storage.migrateLegacyAliasToUid).toHaveBeenCalledWith('rodaja', 'uid-1');
    expect(current?.user).toBe('uid-1');
    expect(current?.userEmail).toBe('member@example.com');
    await expect(current!.login('member@example.com', 'password')).resolves.toBeNull();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'member@example.com', password: 'password' });
    await act(async () => { await current!.logout(); });
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(current?.user).toBeNull();
    expect(current?.userEmail).toBeNull();
  });

  test('returns an email-confirmation state when registration has no session', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    let current: ReturnType<typeof useAuth> | undefined;
    const Probe = () => { current = useAuth(); return null; };
    await act(async () => { TestRenderer.create(React.createElement(AuthProvider, null, React.createElement(Probe))); });

    await expect(current!.register('member@example.com', 'password')).resolves.toEqual({ error: null, emailConfirmationRequired: true });
  });

  test('sends password recovery links to the native update-password route', async () => {
    let current: ReturnType<typeof useAuth> | undefined;
    const Probe = () => { current = useAuth(); return null; };
    await act(async () => { TestRenderer.create(React.createElement(AuthProvider, null, React.createElement(Probe))); });

    await expect(current!.sendPasswordReset(' member@example.com ')).resolves.toBeNull();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('member@example.com', {
      redirectTo: 'gymbro:///auth/update-password',
    });
  });

  test('establishes a recovery session from the deep-link tokens before updating the password', async () => {
    let current: ReturnType<typeof useAuth> | undefined;
    const Probe = () => { current = useAuth(); return null; };
    await act(async () => { TestRenderer.create(React.createElement(AuthProvider, null, React.createElement(Probe))); });

    await expect(current!.establishRecoverySession('gymbro://auth/update-password#access_token=access&refresh_token=refresh')).resolves.toBeNull();
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: 'access', refresh_token: 'refresh' });
    await expect(current!.updatePassword('Stronger1')).resolves.toBeNull();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'Stronger1' });
  });
});
