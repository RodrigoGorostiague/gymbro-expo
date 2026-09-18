import { describe, expect, test } from 'vitest';
import { BACKGROUND_PARALLAX_DEPTHS, BACKGROUND_PARALLAX_INTERVAL_MS, mapAccelerometerToParallax, mapDeviceMotionToParallax, shouldActivateBackgroundParallax } from '../utils/backgroundParallax';

describe('background parallax', () => {
  const activeConditions = {
    backgroundActive: true,
    animationActive: true,
    enabled: true,
    preferencesReady: true,
    supportedPlatform: true,
  };

  test('does not activate when animation is inactive, disabled, or the sensor platform is unavailable', () => {
    expect(shouldActivateBackgroundParallax({ ...activeConditions, enabled: false })).toBe(false);
    expect(shouldActivateBackgroundParallax({ ...activeConditions, animationActive: false })).toBe(false);
    expect(shouldActivateBackgroundParallax({ ...activeConditions, supportedPlatform: false })).toBe(false);
    expect(shouldActivateBackgroundParallax({ ...activeConditions, backgroundActive: false })).toBe(false);
    expect(shouldActivateBackgroundParallax(activeConditions)).toBe(true);
  });

  test('maps beta and gamma into clamped, smoothed tilt values with four distinct layer depths', () => {
    expect(BACKGROUND_PARALLAX_INTERVAL_MS).toBe(120);
    expect(BACKGROUND_PARALLAX_DEPTHS).toEqual([4, 10, 20, 32]);
    expect(mapDeviceMotionToParallax({ beta: 0.7, gamma: -0.7 })).toEqual({ x: -0.18, y: 0.18 });
    expect(mapDeviceMotionToParallax({ beta: 0.35, gamma: 0 }, { x: 0.5, y: -0.5 })).toMatchObject({ x: expect.closeTo(0.41), y: expect.closeTo(-0.23) });
  });

  test('uses normalized gravity tilt when rotation is absent or zeroed', () => {
    const fromGravity = mapDeviceMotionToParallax(null, { x: 0, y: 0 }, { x: 4, y: -3 });
    expect(fromGravity).toMatchObject({ x: expect.closeTo(0.18), y: expect.closeTo(-0.162) });
    expect(mapDeviceMotionToParallax({ beta: 0, gamma: 0 }, { x: 0, y: 0 }, { x: 100, y: -100 })).toEqual({ x: 0.18, y: -0.18 });
  });

  test('maps accelerometer g-force x/y values directly into clamped, smoothed tilt', () => {
    expect(mapAccelerometerToParallax({ x: 0.2, y: -0.1 })).toMatchObject({
      x: expect.closeTo(0.105),
      y: expect.closeTo(-0.053),
    });
    expect(mapAccelerometerToParallax({ x: 10, y: -10 })).toEqual({ x: 0.18, y: -0.18 });
  });
});
