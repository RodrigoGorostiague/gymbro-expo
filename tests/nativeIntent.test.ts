import { describe, expect, test } from 'vitest';
import { redirectSystemPath } from '../app/+native-intent';

describe('redirectSystemPath', () => {
  test('keeps the canonical recovery URL unchanged', () => {
    const path = 'gymbro:///auth/update-password#access_token=access&refresh_token=refresh';

    expect(redirectSystemPath({ path, initial: true })).toBe(path);
  });

  test('rewrites legacy recovery links and preserves their tokens', () => {
    const path = 'gymbro://auth/update-password#access_token=access&refresh_token=refresh';

    expect(redirectSystemPath({ path, initial: true })).toBe(
      `/auth/update-password?recoveryUrl=${encodeURIComponent(path)}`,
    );
  });
});
