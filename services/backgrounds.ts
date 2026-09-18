import { useEffect, useState } from 'react';
import { supabase } from './supabase';

const BUCKET = 'cosmetics';
const BACKGROUND_MANIFEST_PATH = 'v1/backgrounds-manifest.json';

export type BackgroundLayerSource = {
  uri: string;
  width: number;
  height: number;
  cacheKey: string;
};

type BackgroundLayer = {
  path: string;
  width: number;
  height: number;
};

export type BackgroundManifest = {
  version: 1;
  assets: {
    backgrounds: Record<string, BackgroundLayer[]>;
  };
};

export type BackgroundLoadError = {
  backgroundId: string;
  message: string;
  cause?: unknown;
};

let currentManifest: BackgroundManifest | null = null;
let loadPromise: Promise<BackgroundManifest | null> | null = null;

function publicUrl(path: string): string | null {
  if (!supabase) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function isLayer(value: unknown): value is BackgroundLayer {
  if (!value || typeof value !== 'object') return false;
  const layer = value as Partial<BackgroundLayer>;
  return typeof layer.path === 'string'
    && layer.path.length > 0
    && typeof layer.width === 'number'
    && layer.width > 0
    && typeof layer.height === 'number'
    && layer.height > 0;
}

function isBackgroundManifest(value: unknown): value is BackgroundManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<BackgroundManifest>;
  if (manifest.version !== 1 || !manifest.assets || typeof manifest.assets !== 'object') return false;
  const backgrounds = manifest.assets.backgrounds;
  return !!backgrounds
    && typeof backgrounds === 'object'
    && Object.values(backgrounds).every((layers) => Array.isArray(layers) && layers.every(isLayer));
}

function sourcesFor(backgroundId: string, manifest = currentManifest): BackgroundLayerSource[] {
  const layers = manifest?.assets.backgrounds[backgroundId];
  if (!layers?.length) return [];
  return layers.flatMap(({ path, width, height }) => {
    const uri = publicUrl(path);
    return uri ? [{ uri, width, height, cacheKey: uri }] : [];
  });
}

export async function loadBackgroundManifest(): Promise<BackgroundManifest | null> {
  if (currentManifest) return currentManifest;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const url = publicUrl(BACKGROUND_MANIFEST_PATH);
    if (!url) return null;

    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;

    const manifest: unknown = await response.json();
    if (!isBackgroundManifest(manifest)) return null;
    currentManifest = manifest;
    return manifest;
  })().finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

export function getBackgroundLayerSources(backgroundId: string): BackgroundLayerSource[] {
  return sourcesFor(backgroundId);
}

export function useBackgroundLayers(backgroundId: string | null | undefined) {
  const [layers, setLayers] = useState<BackgroundLayerSource[]>(() => backgroundId ? sourcesFor(backgroundId) : []);
  const [error, setError] = useState<BackgroundLoadError | null>(null);

  useEffect(() => {
    let mounted = true;
    setLayers(backgroundId ? sourcesFor(backgroundId) : []);
    setError(null);

    if (!backgroundId) return () => { mounted = false; };

    void loadBackgroundManifest()
      .then((manifest) => {
        if (!mounted) return;
        if (!manifest) {
          setError({ backgroundId, message: 'Background manifest was unavailable or invalid.' });
          return;
        }
        const nextLayers = sourcesFor(backgroundId, manifest);
        if (!nextLayers.length) {
          setError({ backgroundId, message: 'Background layers were missing from the manifest.' });
          return;
        }
        setLayers(nextLayers);
      })
      .catch((cause: unknown) => {
        if (mounted) setError({ backgroundId, message: 'Background manifest request failed.', cause });
      });

    return () => { mounted = false; };
  }, [backgroundId]);

  return { layers, error };
}
