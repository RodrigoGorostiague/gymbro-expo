import { getShopTheme } from '../constants/shopThemes';
import { THEMES } from '../constants/theme';
import { AppTheme, LegacyAlias } from '../types';

export function resolveActiveTheme(
  profile: LegacyAlias,
  equippedThemeId: string | null,
): AppTheme {
  if (!equippedThemeId) return THEMES[profile];
  const shopTheme = getShopTheme(equippedThemeId);
  return shopTheme ?? THEMES[profile];
}

export function resolveDualThemes(
  equipped: Record<LegacyAlias, string | null>,
): Record<LegacyAlias, AppTheme> {
  return {
    rodaja: resolveActiveTheme('rodaja', equipped.rodaja),
    brisas: resolveActiveTheme('brisas', equipped.brisas),
  };
}

export function isDefaultProfileTheme(
  profile: LegacyAlias,
  equippedThemeId: string | null,
): boolean {
  return equippedThemeId === null || equippedThemeId === `profile-${profile}`;
}
