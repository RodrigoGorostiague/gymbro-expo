import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

const BUCKET = 'cosmetics';
const MANIFEST_PATH = 'v1/manifest.json';
const BACKGROUND_MANIFEST_PATH = 'v1/backgrounds-manifest.json';
const CACHE_KEY = '@gymbro/cosmetics-manifest';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type CosmeticKind = 'avatars' | 'frames' | 'titles' | 'backgrounds';

type CosmeticVariant = {
  path: string;
  width: number;
  height: number;
};

export type CosmeticManifest = {
  version: 1;
  assets: Record<CosmeticKind, Record<string, CosmeticVariant[]>>;
};

type CachedManifest = {
  fetchedAt: number;
  manifest: CosmeticManifest;
};

let currentManifest: CosmeticManifest | null = null;
let loadPromise: Promise<CosmeticManifest | null> | null = null;

function emptyManifest(): CosmeticManifest {
  return { version: 1, assets: { avatars: {}, frames: {}, titles: {}, backgrounds: {} } };
}

function hasAssets(manifest: CosmeticManifest): boolean {
  return Object.values(manifest.assets).some((assets) => Object.keys(assets).length > 0);
}

function publicUrl(path: string): string | null {
  if (!supabase) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function isManifest(value: unknown): value is CosmeticManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<CosmeticManifest>;
  return manifest.version === 1 && !!manifest.assets
    && typeof manifest.assets === 'object'
    && ['avatars', 'frames', 'titles'].every((kind) => typeof manifest.assets?.[kind as CosmeticKind] === 'object');
}

function sourceFor(kind: CosmeticKind, id: string, manifest = currentManifest) {
  if (!manifest) return null;
  const variants = manifest.assets[kind]?.[id];
  if (!variants?.length) return null;
  return variants.map(({ path, width, height }) => {
    const uri = publicUrl(path);
    return uri ? { uri, width, height } : null;
  }).filter((source): source is { uri: string; width: number; height: number } => source !== null);
}

async function mergePublishedBackgrounds(manifest: CosmeticManifest): Promise<CosmeticManifest> {
  const url = publicUrl(BACKGROUND_MANIFEST_PATH);
  if (!url) return manifest;
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const value: unknown = response.ok ? await response.json() : null;
    if (!value || typeof value !== 'object') return manifest;
    const assets = (value as { assets?: Partial<CosmeticManifest['assets']> }).assets;
    if (!assets || typeof assets.backgrounds !== 'object' || assets.backgrounds === null) return manifest;
    return { ...manifest, assets: { ...manifest.assets, backgrounds: assets.backgrounds } };
  } catch {
    return manifest;
  }
}

async function cachedManifest(): Promise<CachedManifest | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: unknown = JSON.parse(raw);
    if (!cached || typeof cached !== 'object') return null;
    const value = cached as Partial<CachedManifest>;
    return typeof value.fetchedAt === 'number' && isManifest(value.manifest)
      ? { fetchedAt: value.fetchedAt, manifest: value.manifest }
      : null;
  } catch {
    return null;
  }
}

export async function loadCosmeticManifest(): Promise<CosmeticManifest | null> {
  if (currentManifest) return currentManifest;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const cached = await cachedManifest();
    if (cached) currentManifest = cached.manifest;
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      currentManifest = await mergePublishedBackgrounds(cached.manifest);
      return currentManifest;
    }

    const url = publicUrl(MANIFEST_PATH);
    if (!url) return cached?.manifest ?? null;
    let manifest = cached?.manifest ?? emptyManifest();
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      const remoteManifest: unknown = response.ok ? await response.json() : null;
      if (isManifest(remoteManifest)) manifest = remoteManifest;
    } catch {
      // The separately published backgrounds manifest can still be available.
    }

    currentManifest = await mergePublishedBackgrounds(manifest);
    if (!hasAssets(currentManifest)) return cached?.manifest ?? null;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), manifest: currentManifest }));
    return currentManifest;
  })().finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

export function useCosmeticAsset(kind: CosmeticKind, id: string) {
  const [source, setSource] = useState(() => sourceFor(kind, id));

  useEffect(() => {
    setSource(sourceFor(kind, id));
    void loadCosmeticManifest().then(() => setSource(sourceFor(kind, id)));
  }, [id, kind]);

  return source;
}
