import { afterEach, describe, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('../services/supabase');
});

describe('background manifest loader', () => {
  test('fetches only the dedicated manifest and builds four public Banzai layer sources', async () => {
    vi.resetModules();
    vi.doMock('../services/supabase', () => ({
      supabase: {
        storage: {
          from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cosmetics.test/${path}` } }) }),
        },
      },
    }));
    const fetch = vi.fn(async (url: string) => new Response(JSON.stringify({
      version: 1,
      assets: {
        backgrounds: {
          banzai: [1, 2, 3, 4].map((layer) => ({ path: `v1/backgrounds/banzai-${layer}.webp`, width: 1440, height: 960 })),
        },
      },
    }), { status: url.endsWith('v1/backgrounds-manifest.json') ? 200 : 404 }));
    vi.stubGlobal('fetch', fetch);

    const { getBackgroundLayerSources, loadBackgroundManifest } = await import('../services/backgrounds');
    await expect(loadBackgroundManifest()).resolves.toMatchObject({ assets: { backgrounds: { banzai: expect.any(Array) } } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://cosmetics.test/v1/backgrounds-manifest.json', { headers: { Accept: 'application/json' } });
    expect(getBackgroundLayerSources('banzai')).toEqual([
      expect.objectContaining({ uri: 'https://cosmetics.test/v1/backgrounds/banzai-1.webp', cacheKey: 'https://cosmetics.test/v1/backgrounds/banzai-1.webp' }),
      expect.objectContaining({ uri: 'https://cosmetics.test/v1/backgrounds/banzai-2.webp' }),
      expect.objectContaining({ uri: 'https://cosmetics.test/v1/backgrounds/banzai-3.webp' }),
      expect.objectContaining({ uri: 'https://cosmetics.test/v1/backgrounds/banzai-4.webp' }),
    ]);
  });
});
