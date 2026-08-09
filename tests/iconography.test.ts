import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { AVATARS, DEFAULT_AVATAR_ID, avatarIdOrDefault } from '../constants/avatars';
import { LOGIN_THEMES } from '../constants/loginBrand';

describe('GymBro iconography', () => {
  test('normalizes persisted avatar ids to the bundled catalog', () => {
    expect(avatarIdOrDefault('capybara-athlete')).toBe(DEFAULT_AVATAR_ID);
    expect(avatarIdOrDefault('capigirl')).toBe('capigirl');
    expect(avatarIdOrDefault('retired-avatar')).toBe(DEFAULT_AVATAR_ID);
    expect(avatarIdOrDefault(null)).toBe(DEFAULT_AVATAR_ID);
    expect(AVATARS[DEFAULT_AVATAR_ID].label).toBe('Capibara atleta');
    expect(AVATARS.capigirl.label).toBe('Capigirl atleta');
    expect(Object.keys(AVATARS)).toEqual([
      'capybara-athlete',
      'capybara-mark',
      'capigirl',
      'capigirl-ponytail',
      'capigirl-braid',
      'capigirl-bob',
      'capigirl-bun',
      'capybro-spiky',
      'capybro-quiff',
      'capybro-topknot',
      'capybro-cropped',
      'capybro-river-tattoo',
      'capybro-beanie-headphones',
      'capybro-cap-headphones',
      'capybro-cap-tank',
      'capybro-beanie-tank',
      'capybro-red-visor',
      'capybro-argentina-beanie',
      'capybro-argentina-visor',
      'capybro-boca',
      'capybro-river',
      'capybro-argentina',
      'capigirl-pink-squat',
      'capigirl-purple-deadlift',
      'capigirl-blue-squat',
      'capigirl-black-pink-deadlift',
      'capigirl-pink-jacket-deadlift',
      'capigirl-black-dumbbell',
      'capigirl-pink-dumbbell',
      'capigirl-purple-tee',
      'capigirl-purple-sport',
    ]);
    expect(avatarIdOrDefault('capigirl-braid')).toBe('capigirl-braid');
    expect(avatarIdOrDefault('capybro-topknot')).toBe('capybro-topknot');
    expect(avatarIdOrDefault('capybro-boca')).toBe('capybro-boca');
    expect(avatarIdOrDefault('capybro-argentina')).toBe('capybro-argentina');
    expect(avatarIdOrDefault('capigirl-purple-sport')).toBe('capigirl-purple-sport');
  });

  test('configures the native launcher and Android notification assets', () => {
    const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')) as {
      expo: { icon: string; android: { icon: string }; plugins: unknown[] };
    };
    const notifications = config.expo.plugins.find((plugin): plugin is [string, { icon: string; color: string }] => Array.isArray(plugin) && plugin[0] === 'expo-notifications');

    expect(config.expo.icon).toBe('./assets/gymbro-icon.png');
    expect(config.expo.android.icon).toBe('./assets/gymbro-icon.png');
    expect(notifications?.[1]).toMatchObject({ icon: './assets/notification-icon.png', color: '#FF9700' });
    expect(existsSync(new URL('../assets/gymbro-icon.png', import.meta.url))).toBe(true);
  });

  test('uses the launcher palette for the unauthenticated experience', () => {
    expect(LOGIN_THEMES.rodaja.primary).toBe('#FF9700');
    expect(LOGIN_THEMES.brisas.primary).toBe('#E8DDD0');
    expect(LOGIN_THEMES.rodaja.background).toEqual(['#090909', '#15110B', '#090909']);
  });

  test('bundles every new selectable Capigirl variant', () => {
    for (const asset of [
      'capigirl-pink-squat.jpeg',
      'capigirl-purple-deadlift.jpeg',
      'capigirl-blue-squat.jpeg',
      'capigirl-black-pink-deadlift.jpeg',
      'capigirl-pink-jacket-deadlift.jpeg',
      'capigirl-black-dumbbell.jpeg',
      'capigirl-pink-dumbbell.jpeg',
      'capigirl-purple-tee.jpeg',
      'capigirl-purple-sport.jpeg',
    ]) {
      expect(existsSync(new URL(`../assets/${asset}`, import.meta.url))).toBe(true);
    }
  });
});
