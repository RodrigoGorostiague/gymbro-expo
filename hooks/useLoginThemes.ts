import { useEffect, useState } from 'react';
import { subscribeToEquippedThemes } from '../services/themeSync';
import { AppTheme, LegacyAlias } from '../types';
import { loadEquippedThemes, loadShop, saveShop } from '../utils/storage';
import { resolveActiveTheme } from '../utils/theme';

export function useLoginThemes(): Record<LegacyAlias, AppTheme> {
  const [equipped, setEquipped] = useState<Record<LegacyAlias, string | null>>({
    rodaja: null,
    brisas: null,
  });

  useEffect(() => {
    loadEquippedThemes().then(setEquipped);

    const unsub = subscribeToEquippedThemes((remote) => {
      setEquipped((prev) => ({ ...prev, ...remote }));

      Object.entries(remote).forEach(async ([profile, themeId]) => {
        if (themeId === undefined) return;
        const key = profile as LegacyAlias;
        const shop = await loadShop(key);
        if (shop.equippedThemeId !== themeId) {
          await saveShop(key, { ...shop, equippedThemeId: themeId });
        }
      });
    });

    return unsub;
  }, []);

  return {
    rodaja: resolveActiveTheme('rodaja', equipped.rodaja),
    brisas: resolveActiveTheme('brisas', equipped.brisas),
  };
}
