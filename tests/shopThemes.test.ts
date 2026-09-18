import { describe, expect, test } from 'vitest';
import { EXCLUSIVE_FRAME_THEME_IDS, getShopTheme, getThemesByRarity, SHOP_THEMES } from '../constants/shopThemes';
import { PROFILE_FRAMES } from '../constants/profileFrames';

describe('shop theme collection', () => {
  test('keeps unrelated legacy themes below exclusive rarity', () => {
    expect(getShopTheme('sun')?.rarity).toBe('rare');
    expect(getShopTheme('lila-neon')?.rarity).toBe('rare');
    expect(SHOP_THEMES.filter((theme) => theme.id === 'sun' || theme.id === 'lila-neon'))
      .not.toContainEqual(expect.objectContaining({ rarity: 'exclusive' }));
  });

  test('offers 28 frame-exclusive themes with clear rarity bands', () => {
    expect(getThemesByRarity('common')).toHaveLength(18);
    expect(getThemesByRarity('rare')).toHaveLength(12);
    expect(getThemesByRarity('exclusive')).toHaveLength(33);
  });

  test('keeps renamed purchased themes on their original IDs and prices', () => {
    expect(getShopTheme('boca')).toMatchObject({ name: 'La 12', price: 700, rarity: 'exclusive' });
    expect(getShopTheme('river')).toMatchObject({ name: 'Millo Monumental', price: 850, rarity: 'exclusive' });
    expect(getShopTheme('snowflake')).toMatchObject({ name: 'Winter Arc', price: 1200, rarity: 'exclusive' });
  });

  test('maps every commercial frame to a separately purchasable exclusive theme', () => {
    const commercialFrames = PROFILE_FRAMES.filter((frame) => frame.kind === 'shop');
    const frameThemeIds = Object.values(EXCLUSIVE_FRAME_THEME_IDS);

    expect(Object.keys(EXCLUSIVE_FRAME_THEME_IDS)).toHaveLength(commercialFrames.length);
    expect(new Set(frameThemeIds).size).toBe(commercialFrames.length);
    expect(commercialFrames.every((frame) => EXCLUSIVE_FRAME_THEME_IDS[frame.id])).toBe(true);
    expect(frameThemeIds.map(getShopTheme).every((theme) => theme?.rarity === 'exclusive' && theme.interaction === 'set-celebration' && theme.celebration)).toBe(true);
    expect(new Set(frameThemeIds.map((id) => JSON.stringify(getShopTheme(id)?.background))).size).toBe(commercialFrames.length);
    expect(new Set(frameThemeIds.map((id) => JSON.stringify(getShopTheme(id)?.celebration))).size).toBe(commercialFrames.length);
    expect(frameThemeIds.filter((id) => !['boca', 'river', 'snowflake', 'aurora', 'prisma', 'red', 'cyberpunk'].includes(id)).map(getShopTheme).every((theme) => theme!.price >= 1800 && theme!.price <= 3500)).toBe(true);
  });
});
