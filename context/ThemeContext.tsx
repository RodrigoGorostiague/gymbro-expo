import React, { createContext, useContext, useMemo } from 'react';
import { AppTheme, LegacyAlias } from '../types';
import { getShopTheme } from '../constants/shopThemes';
import { resolveActiveTheme, resolveDualThemes } from '../utils/theme';
import { useAuth } from './AuthContext';
import { useShop } from './ShopContext';

export interface DualThemes {
  rodaja: AppTheme;
  brisas: AppTheme;
}

interface ThemeContextValue {
  theme: AppTheme;
  dualThemes: DualThemes | null;
  isCombined: boolean;
  isShopTheme: boolean;
  isPreview: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const {
    equippedThemeId,
    previewThemeId,
    combineWithPartner,
    partnerEquippedThemeId,
    selfEquippedThemeId,
  } = useShop();

  const profile: LegacyAlias = user === 'brisas' ? 'brisas' : 'rodaja';
  const activeId = previewThemeId ?? equippedThemeId;
  const theme = resolveActiveTheme(profile, activeId);

  const dualThemes = useMemo((): DualThemes | null => {
    if (!combineWithPartner || previewThemeId) return null;
    return resolveDualThemes({
      rodaja: profile === 'rodaja' ? selfEquippedThemeId : partnerEquippedThemeId,
      brisas: profile === 'brisas' ? selfEquippedThemeId : partnerEquippedThemeId,
    });
  }, [
    combineWithPartner,
    previewThemeId,
    profile,
    selfEquippedThemeId,
    partnerEquippedThemeId,
  ]);

  const isCombined = dualThemes !== null;

  const isShopTheme =
    !!equippedThemeId &&
    !previewThemeId &&
    !!getShopTheme(equippedThemeId) &&
    !equippedThemeId.startsWith('profile-');

  return (
    <ThemeContext.Provider
      value={{ theme, dualThemes, isCombined, isShopTheme, isPreview: !!previewThemeId }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
