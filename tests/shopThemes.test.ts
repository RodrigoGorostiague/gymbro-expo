import { describe, expect, test } from 'vitest';
import { getShopTheme, getThemesByRarity, SHOP_THEMES } from '../constants/shopThemes';

describe('shop theme collection', () => {
  test('keeps the existing collection below exclusive rarity', () => {
    expect(getShopTheme('red')?.rarity).toBe('common');
    expect(getShopTheme('sun')?.rarity).toBe('rare');
    expect(getShopTheme('lila-neon')?.rarity).toBe('rare');
    expect(SHOP_THEMES.filter((theme) => theme.id === 'red' || theme.id === 'sun' || theme.id === 'lila-neon'))
      .not.toContainEqual(expect.objectContaining({ rarity: 'exclusive' }));
  });

  test('offers 27 new themes with clear rarity bands', () => {
    expect(getThemesByRarity('common')).toHaveLength(19);
    expect(getThemesByRarity('rare')).toHaveLength(18);
    expect(getThemesByRarity('exclusive')).toHaveLength(5);
  });

  test('offers rare football themes at their intended prices', () => {
    expect(getShopTheme('boca')).toMatchObject({ name: 'Boca Juniors', price: 700, rarity: 'rare', category: 'special' });
    expect(getShopTheme('river')).toMatchObject({ name: 'River Plate', price: 850, rarity: 'rare', category: 'special' });
    expect(getShopTheme('seleccion-argentina')).toMatchObject({ name: 'Selección Argentina', price: 1000, rarity: 'rare', category: 'special' });
  });

  test('reserves animated set celebrations for exclusive themes', () => {
    const exclusives = getThemesByRarity('exclusive');

    expect(exclusives).toHaveLength(5);
    expect(exclusives.every((theme) => theme.interaction === 'set-celebration')).toBe(true);
    expect(getThemesByRarity('rare').some((theme) => theme.interaction)).toBe(false);
    expect(getThemesByRarity('common').some((theme) => theme.interaction)).toBe(false);
  });
});
