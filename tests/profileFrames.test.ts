import { describe, expect, test } from 'vitest';
import { isProfileFrameUnlocked, isProfileTitleUnlocked, orderProfileFrameIds, orderProfileTitleIds, PROFILE_FRAMES, PROFILE_TITLES, profileFrameIdOrDefault, profileTitleForId, visibleBrawlFrames } from '../constants/profileFrames';
import { profileTitleAssetForId } from '../components/profileTitleAssets';

describe('profile level frames', () => {
  test('uses the rank thresholds as frame unlock requirements', () => {
    expect(PROFILE_FRAMES.filter((frame) => frame.kind === 'level').map((frame) => frame.unlockLevel)).toEqual([1, 5, 10, 20, 35, 50, 70, 85]);
    expect(isProfileFrameUnlocked('gymrat', 34)).toBe(false);
    expect(isProfileFrameUnlocked('gymrat', 35)).toBe(true);
    expect(isProfileFrameUnlocked('sigma', 85)).toBe(true);
  });

  test('falls back to the starter frame for malformed persisted data', () => {
    expect(profileFrameIdOrDefault('g-boom')).toBe('g-boom');
    expect(profileFrameIdOrDefault('admin-only')).toBe('principiante');
    expect(profileFrameIdOrDefault(null)).toBe('principiante');
  });

  test('keeps Brawl frames unavailable and limits their picker surface to the next frame', () => {
    expect(visibleBrawlFrames('principiante').map((frame) => frame.id)).toEqual(['brawl-rookie']);
    expect(isProfileFrameUnlocked('brawl-rookie', 999)).toBe(false);
    expect(profileTitleForId('brawl-legend').title).toBe('Legend');
  });

  test('resolves title artwork for every known title and falls back for malformed values', () => {
    expect(PROFILE_TITLES.every((title) => profileTitleAssetForId(title.id) !== null)).toBe(true);
    expect(profileTitleAssetForId('malformed-title')).toBeNull();
  });

  test('keeps Alfa legacy locked until level 70 and Alfa User available for everyone', () => {
    expect(isProfileFrameUnlocked('alfa', 69)).toBe(false);
    expect(isProfileFrameUnlocked('alfa-user', 1)).toBe(true);
    expect(isProfileFrameUnlocked('alfa', 70)).toBe(true);
    expect(isProfileFrameUnlocked('alfa-user', 70)).toBe(true);
    expect(isProfileTitleUnlocked('alfa-user', 1)).toBe(true);
    expect(isProfileTitleUnlocked('alfa-user', 70)).toBe(true);
    expect(profileTitleForId('alfa-user').title).toBe('Alfa User');
  });

  test('requires a separate purchased-frame inventory entry for commercial frames', () => {
    expect(PROFILE_FRAMES.filter((frame) => frame.kind === 'shop')).toHaveLength(28);
    expect(isProfileFrameUnlocked('shop-heavy-duty', 99)).toBe(false);
    expect(isProfileFrameUnlocked('shop-heavy-duty', 1, ['shop-heavy-duty'])).toBe(true);
    expect(PROFILE_FRAMES.filter((frame) => frame.kind === 'shop').map((frame) => frame.price)).toContain(340);
    expect(PROFILE_FRAMES.filter((frame) => frame.kind === 'shop').map((frame) => frame.price)).toContain(1100);
  });

  test('orders unlocked Alfa cosmetics before locked higher-level cosmetics', () => {
    expect(orderProfileFrameIds(['sigma', 'alfa-user', 'alfa'], 1)).toEqual(['alfa-user', 'alfa', 'sigma']);
    expect(orderProfileTitleIds(['sigma', 'alfa-user', 'alfa'], 1)).toEqual(['alfa-user', 'alfa', 'sigma']);
  });

  test('keeps Alfa User in the selectable frame catalog', () => {
    expect(PROFILE_FRAMES.filter((frame) => frame.kind === 'level' || frame.kind === 'shop' || frame.kind === 'global').map((frame) => frame.id)).toContain('alfa-user');
  });
});
