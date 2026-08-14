import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CURRENT_RELEASE } from '../constants/release';

describe('release notes', () => {
  test('declares the current app release boundary', () => {
    expect(CURRENT_RELEASE).toEqual({ version: '0.6.0', sequence: 8 });
  });

  test('matches the user-facing version configured for Expo and npm', () => {
    const appConfig = JSON.parse(readFileSync(resolve(import.meta.dirname, '../app.json'), 'utf8')) as { expo: { version: string } };
    const packageConfig = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8')) as { version: string };

    expect(CURRENT_RELEASE.version).toBe(appConfig.expo.version);
    expect(CURRENT_RELEASE.version).toBe(packageConfig.version);
  });
});
