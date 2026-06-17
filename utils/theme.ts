import { getShopTheme } from '../constants/shopThemes';
import { THEMES } from '../constants/theme';
import { AppTheme, UserProfile } from '../types';

export function resolveActiveTheme(
  profile: UserProfile,
  equippedThemeId: string | null,
): AppTheme {
  if (!equippedThemeId) return THEMES[profile];
  const shopTheme = getShopTheme(equippedThemeId);
  return shopTheme ?? THEMES[profile];
}

export function resolveDualThemes(
  equipped: Record<UserProfile, string | null>,
): Record<UserProfile, AppTheme> {
  return {
    rodaja: resolveActiveTheme('rodaja', equipped.rodaja),
    brisas: resolveActiveTheme('brisas', equipped.brisas),
  };
}

export function isDefaultProfileTheme(
  profile: UserProfile,
  equippedThemeId: string | null,
): boolean {
  return equippedThemeId === null || equippedThemeId === `profile-${profile}`;
}
