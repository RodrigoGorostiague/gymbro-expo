import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { AVATARS, DEFAULT_AVATAR_ID, avatarIdOrDefault } from '../constants/avatars';

describe('GymBro iconography', () => {
  test('normalizes persisted avatar ids to the bundled catalog', () => {
    expect(avatarIdOrDefault('capybara-athlete')).toBe(DEFAULT_AVATAR_ID);
    expect(avatarIdOrDefault('capigirl')).toBe('capigirl');
    expect(avatarIdOrDefault('retired-avatar')).toBe(DEFAULT_AVATAR_ID);
    expect(avatarIdOrDefault(null)).toBe(DEFAULT_AVATAR_ID);
    expect(AVATARS[DEFAULT_AVATAR_ID].label).toBe('Capibara atleta');
    expect(AVATARS.capigirl.label).toBe('Capigirl atleta');
  });

  test('configures the native launcher and Android notification assets', () => {
    const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')) as {
      expo: { icon: string; android: { adaptiveIcon: Record<string, string> }; plugins: unknown[] };
    };
    const notifications = config.expo.plugins.find((plugin): plugin is [string, { icon: string; color: string }] => Array.isArray(plugin) && plugin[0] === 'expo-notifications');

    expect(config.expo.icon).toBe('./assets/icon.png');
    expect(config.expo.android.adaptiveIcon).toMatchObject({
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    });
    expect(notifications?.[1]).toMatchObject({ icon: './assets/notification-icon.png', color: '#FF69B4' });
  });
});
