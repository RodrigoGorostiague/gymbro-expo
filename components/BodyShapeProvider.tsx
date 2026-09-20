import React, { useEffect, useState } from 'react';
import { usePathname } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { BodyShapeContext, bodyShapeForSex, type BodyShape } from '../context/BodyShapeContext';
import { getOwnOnboarding } from '../services/onboarding';

export function BodyShapeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const onboarding = usePathname() === '/onboarding';
  const [resolved, setResolved] = useState<{ owner: string; shape: BodyShape } | null>(null);
  useEffect(() => {
    let active = true;
    setResolved(null);
    if (user) void getOwnOnboarding().then(profile => {
      if (active) setResolved({ owner: user, shape: bodyShapeForSex(profile.sex) });
    }).catch(() => { /* Older/offline accounts use the default until the profile can be loaded. */ });
    return () => { active = false; };
  }, [user, onboarding]);
  const shape = resolved?.owner === user ? resolved.shape : 'a';
  return <BodyShapeContext.Provider value={shape}>{children}</BodyShapeContext.Provider>;
}
