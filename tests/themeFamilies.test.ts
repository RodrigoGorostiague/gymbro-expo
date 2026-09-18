import { expect, test } from 'vitest';
import { THEME_FAMILIES, familyForThemeId } from '../constants/themeFamilies';
import { SHOP_THEMES, PROFILE_THEMES, getShopTheme } from '../constants/shopThemes';
test('curates exactly eight structural families without removing any legacy lookup', () => {
  expect(THEME_FAMILIES).toHaveLength(8);
  const ids = THEME_FAMILIES.flatMap((family) => family.variants);
  expect(new Set(ids).size).toBe(ids.length);
  expect([...ids].sort()).toEqual([...SHOP_THEMES, ...PROFILE_THEMES].map((theme) => theme.id).sort());
  expect(new Set(THEME_FAMILIES.map((family) => family.texture)).size).toBe(8);
  for (const theme of [...SHOP_THEMES, ...PROFILE_THEMES]) {
    expect(getShopTheme(theme.id)).toBe(theme);
    expect(familyForThemeId(theme.id)?.variants).toContain(theme.id);
  }
  for (const family of THEME_FAMILIES) expect(family.variants).toContain(family.representative);
});
