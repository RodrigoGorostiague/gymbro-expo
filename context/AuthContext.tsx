import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserId } from '../types';
import { supabase, supabaseConfigurationError, subscribeToSupabaseAppState } from '../services/supabase';
import { loadLegacyAlias, migrateLegacyAliasToUid } from '../utils/storage';

interface AuthContextValue {
  user: UserId | null;
  userEmail: string | null;
  isLoading: boolean;
  authError: string | null;
  welcomeMessage: string | null;
  login: (email: string, password: string) => Promise<string | null>;
  register: (email: string, password: string) => Promise<{ error: string | null; emailConfirmationRequired: boolean }>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  establishRecoverySession: (url: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  setWelcomeMessage: (message: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserId | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(supabaseConfigurationError);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let legacyAlias: Awaited<ReturnType<typeof loadLegacyAlias>> = null;
    const client = supabase;
    if (!client) {
      setIsLoading(false);
      return () => { active = false; };
    }

    const applySession = async (session: { user: { id: string; email?: string | null } } | null) => {
      if (!session) {
        if (active) { setUser(null); setUserEmail(null); }
        return;
      }
      await migrateLegacyAliasToUid(legacyAlias, session.user.id);
      if (active) { setUser(session.user.id); setUserEmail(session.user.email ?? null); }
    };

    const initialize = async () => {
      try {
        legacyAlias = await loadLegacyAlias();
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        await applySession(data.session);
        if (active) setAuthError(null);
      } catch (error) {
        if (active) setAuthError(error instanceof Error ? error.message : 'No se pudo restaurar la sesión.');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void initialize();
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      void applySession(session);
    });
    const unsubscribeAppState = subscribeToSupabaseAppState();
    return () => {
      active = false;
      subscription.unsubscribe();
      unsubscribeAppState();
    };
  }, []);

  const login = async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return supabaseConfigurationError;
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error?.message ?? null;
  };

  const register = async (email: string, password: string) => {
    if (!supabase) return { error: supabaseConfigurationError, emailConfirmationRequired: false };
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { error: error.message, emailConfirmationRequired: false };
    return { error: null, emailConfirmationRequired: !data.session };
  };

  const sendPasswordReset = async (email: string): Promise<string | null> => {
    if (!supabase) return supabaseConfigurationError;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'gymbro:///auth/update-password',
    });
    return error?.message ?? null;
  };

  const establishRecoverySession = async (url: string): Promise<string | null> => {
    if (!supabase) return supabaseConfigurationError;
    const fragment = url.split('#')[1] ?? url.split('?')[1] ?? '';
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) return 'El enlace de recuperación no es válido o ya venció.';
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    return error?.message ?? null;
  };

  const updatePassword = async (password: string): Promise<string | null> => {
    if (!supabase) return supabaseConfigurationError;
    const { error } = await supabase.auth.updateUser({ password });
    return error?.message ?? null;
  };

  const logout = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setUserEmail(null);
  };

  return <AuthContext.Provider value={{ user, userEmail, isLoading, authError, welcomeMessage, login, register, sendPasswordReset, establishRecoverySession, updatePassword, logout, setWelcomeMessage }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
