import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const BACKGROUND_PARALLAX_ENABLED_KEY = '@gymbro/background-parallax-enabled/v1';

type BackgroundParallaxContextValue = {
  enabled: boolean;
  isReady: boolean;
  setEnabled: (enabled: boolean) => void;
};

const BackgroundParallaxContext = createContext<BackgroundParallaxContextValue>({
  enabled: true,
  isReady: false,
  setEnabled: () => undefined,
});

export function BackgroundParallaxProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(true);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(BACKGROUND_PARALLAX_ENABLED_KEY)
      .then((value) => {
        if (mounted && value !== null) setEnabledState(value !== 'false');
      })
      .catch(() => undefined)
      .finally(() => { if (mounted) setIsReady(true); });
    return () => { mounted = false; };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    void AsyncStorage.setItem(BACKGROUND_PARALLAX_ENABLED_KEY, String(next)).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ enabled, isReady, setEnabled }), [enabled, isReady, setEnabled]);
  return <BackgroundParallaxContext.Provider value={value}>{children}</BackgroundParallaxContext.Provider>;
}

export function useBackgroundParallaxPreference() {
  return useContext(BackgroundParallaxContext);
}
