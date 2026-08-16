import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform } from 'react-native';
import { getShopBackground, SHOP_BACKGROUNDS } from '../constants/backgrounds';

vi.mock('expo-sensors', () => ({
  Accelerometer: {
    isAvailableAsync: vi.fn(async () => false),
    setUpdateInterval: vi.fn(),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
  },
  DeviceMotion: {
    isAvailableAsync: vi.fn(async () => false),
    getPermissionsAsync: vi.fn(async () => ({ granted: false, canAskAgain: false })),
    requestPermissionsAsync: vi.fn(async () => ({ granted: false })),
    setUpdateInterval: vi.fn(),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

vi.mock('../services/backgrounds', () => ({
  useBackgroundLayers: () => ({
    layers: [1, 2, 3, 4].map((layer) => ({
      uri: `https://cosmetics.test/v1/backgrounds/banzai-${layer}.webp`,
      width: 1440,
      height: 960,
      cacheKey: `banzai-${layer}`,
    })),
    error: null,
  }),
}));

vi.mock('../context/BackgroundParallaxContext', () => ({
  useBackgroundParallaxPreference: () => ({ enabled: true, isReady: true, setEnabled: vi.fn() }),
}));

import { BackgroundEngine } from '../components/BackgroundEngine';

describe('background cosmetics', () => {
  test('ships Banzai and Sakura as independently purchasable exclusive backgrounds', () => {
    expect(SHOP_BACKGROUNDS).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'banzai', price: 1, rarity: 'exclusive', renderer: 'layered-image', layerCount: 4 }),
      expect.objectContaining({ id: 'sakura', price: 1, rarity: 'exclusive', renderer: 'layered-image', layerCount: 4 }),
    ]));
  });

  test('mounts four cached Expo Image layers from stable remote sources', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(React.createElement(BackgroundEngine, { backgroundId: 'banzai' })); });
    expect(renderer.root.findAllByType(LinearGradient)).toHaveLength(1);
    const layers = renderer.root.findAll((node) => node.type === ('ExpoImage' as any));
    expect(layers).toHaveLength(4);
    expect(layers.map((layer) => layer.props.source.uri)).toEqual([
      'https://cosmetics.test/v1/backgrounds/banzai-1.webp',
      'https://cosmetics.test/v1/backgrounds/banzai-2.webp',
      'https://cosmetics.test/v1/backgrounds/banzai-3.webp',
      'https://cosmetics.test/v1/backgrounds/banzai-4.webp',
    ]);
    expect(layers.every((layer) => layer.props.cachePolicy === 'memory-disk')).toBe(true);
    expect(getShopBackground('missing')).toBeUndefined();
  });

  test('reports an individual remote layer failure through the error callback', async () => {
    const onError = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(React.createElement(BackgroundEngine, { backgroundId: 'banzai', onError })); });
    const [firstLayer] = renderer.root.findAll((node) => node.type === ('ExpoImage' as any));
    await act(async () => { firstLayer.props.onError({ error: 'network request failed' }); });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      backgroundId: 'banzai',
      message: 'Background layer failed to load: network request failed',
    }));
  });

  test('subscribes to the accelerometer on Android without using device motion permissions', async () => {
    const { Accelerometer, DeviceMotion } = await import('expo-sensors');
    const accelerometer = Accelerometer as unknown as {
      isAvailableAsync: ReturnType<typeof vi.fn>;
      setUpdateInterval: ReturnType<typeof vi.fn>;
      addListener: ReturnType<typeof vi.fn>;
    };
    const motion = DeviceMotion as unknown as {
      isAvailableAsync: ReturnType<typeof vi.fn>;
      getPermissionsAsync: ReturnType<typeof vi.fn>;
      requestPermissionsAsync: ReturnType<typeof vi.fn>;
      addListener: ReturnType<typeof vi.fn>;
    };
    const remove = vi.fn();
    vi.clearAllMocks();
    Platform.OS = 'android';
    accelerometer.isAvailableAsync.mockResolvedValue(true);
    accelerometer.addListener.mockReturnValue({ remove });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(BackgroundEngine, { backgroundId: 'banzai' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(accelerometer.addListener).toHaveBeenCalledOnce();
    expect(motion.addListener).not.toHaveBeenCalled();
    expect(motion.isAvailableAsync).not.toHaveBeenCalled();
    expect(motion.getPermissionsAsync).not.toHaveBeenCalled();
    expect(motion.requestPermissionsAsync).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
    expect(remove).toHaveBeenCalledOnce();
    Platform.OS = 'ios';
  });
});
