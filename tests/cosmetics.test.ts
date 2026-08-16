import { afterEach, describe, expect, test, vi } from 'vitest';
import { loadCosmeticManifest } from '../services/cosmetics';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('@react-native-async-storage/async-storage');
  vi.doUnmock('../services/supabase');
});

describe('cosmetic manifest', () => {
  test('does not require remote configuration when Supabase is unavailable', async () => {
    await expect(loadCosmeticManifest()).resolves.toBeNull();
  });

  test('loads background layers when the legacy cosmetics manifest is unavailable', async () => {
    vi.resetModules();
    vi.doMock('../services/supabase', () => ({
      supabase: {
        storage: {
          from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cosmetics.test/${path}` } }) }),
        },
      },
    }));
    vi.doMock('@react-native-async-storage/async-storage', () => ({
      default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) },
    }));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('backgrounds-manifest.json')) {
        return new Response(JSON.stringify({
          version: 1,
          assets: { backgrounds: { banzai: [{ path: 'v1/backgrounds/banzai.webp', width: 1440, height: 960 }] } },
        }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    }));

    const { loadCosmeticManifest: loadConfiguredManifest } = await import('../services/cosmetics');
    await expect(loadConfiguredManifest()).resolves.toMatchObject({
      assets: { backgrounds: { banzai: [expect.objectContaining({ path: 'v1/backgrounds/banzai.webp' })] } },
    });
  });
});
