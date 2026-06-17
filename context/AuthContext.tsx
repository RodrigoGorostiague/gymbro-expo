import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile } from '../types';
import { clearUser, loadUser, saveUser } from '../utils/storage';

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  welcomeMessage: string | null;
  login: (username: string, password: string) => boolean;
  logout: () => Promise<void>;
  setWelcomeMessage: (message: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const CREDENTIALS: Record<string, { password: string; profile: UserProfile }> = {
  rodaja: { password: '1234', profile: 'rodaja' },
  brisas: { password: 'sonrisas', profile: 'brisas' },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);

  useEffect(() => {
    loadUser().then((profile) => {
      setUser(profile);
      setIsLoading(false);
    });
  }, []);

  const login = (username: string, password: string): boolean => {
    const key = username.trim().toLowerCase();
    const cred = CREDENTIALS[key];
    if (!cred || cred.password !== password) return false;

    setUser(cred.profile);
    saveUser(cred.profile);
    return true;
  };

  const logout = async () => {
    await clearUser();
    setUser(null);
    setWelcomeMessage(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, welcomeMessage, login, logout, setWelcomeMessage }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
