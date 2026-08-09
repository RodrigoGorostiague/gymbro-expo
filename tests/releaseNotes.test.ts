import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CURRENT_RELEASE_NOTES, RELEASE_NOTES } from '../constants/releaseNotes';

describe('release notes', () => {
  test('exposes the current ultra alpha release with user-visible changes', () => {
    expect(CURRENT_RELEASE_NOTES.version).toBe('0.4.0');
    expect(RELEASE_NOTES).toContain(CURRENT_RELEASE_NOTES);
    expect(CURRENT_RELEASE_NOTES.changes.length).toBeGreaterThan(0);
    expect(CURRENT_RELEASE_NOTES.rewardGems).toBe(100);
  });

  test('matches the user-facing version configured for Expo and npm', () => {
    const appConfig = JSON.parse(readFileSync(resolve(import.meta.dirname, '../app.json'), 'utf8')) as { expo: { version: string } };
    const packageConfig = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8')) as { version: string };

    expect(CURRENT_RELEASE_NOTES.version).toBe(appConfig.expo.version);
    expect(CURRENT_RELEASE_NOTES.version).toBe(packageConfig.version);
  });
});
