export const BACKGROUND_PARALLAX_DEPTHS = [4, 10, 20, 32] as const;
export const BACKGROUND_PARALLAX_INTERVAL_MS = 60;

const MAX_TILT_RADIANS = 0.35;
const MAX_TILT_SINE = Math.sin(MAX_TILT_RADIANS);
const STANDARD_GRAVITY = 9.80665;
const SMOOTHING = 0.18;

export type ParallaxTilt = { x: number; y: number };
type Rotation = { beta?: number | null; gamma?: number | null } | null | undefined;
type Gravity = { x?: number | null; y?: number | null } | null | undefined;
type Acceleration = { x?: number | null; y?: number | null } | null | undefined;

export function clamp(value: number, minimum = -1, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function shouldActivateBackgroundParallax({
  backgroundActive,
  appActive,
  enabled,
  preferencesReady,
  reduceMotion,
  supportedPlatform,
}: {
  backgroundActive: boolean;
  appActive: boolean;
  enabled: boolean;
  preferencesReady: boolean;
  reduceMotion: boolean;
  supportedPlatform: boolean;
}) {
  return backgroundActive && appActive && enabled && preferencesReady && !reduceMotion && supportedPlatform;
}

export function mapDeviceMotionToParallax(
  rotation: Rotation,
  previous: ParallaxTilt = { x: 0, y: 0 },
  accelerationIncludingGravity?: Gravity,
): ParallaxTilt {
  const beta = rotation?.beta ?? 0;
  const gamma = rotation?.gamma ?? 0;
  const hasRotation = Math.abs(beta) > 0.001 || Math.abs(gamma) > 0.001;
  const gravityX = accelerationIncludingGravity?.x ?? 0;
  const gravityY = accelerationIncludingGravity?.y ?? 0;
  const hasGravity = Math.abs(gravityX) > 0.001 || Math.abs(gravityY) > 0.001;

  if (!hasRotation && !hasGravity) return previous;

  // Android devices can emit zeroed rotation values. Gravity provides a stable tilt
  // vector there without integrating rotation rate and accumulating drift.
  const targetX = hasRotation
    ? clamp(gamma / MAX_TILT_RADIANS)
    : clamp(gravityX / STANDARD_GRAVITY / MAX_TILT_SINE);
  const targetY = hasRotation
    ? clamp(beta / MAX_TILT_RADIANS)
    : clamp(gravityY / STANDARD_GRAVITY / MAX_TILT_SINE);
  return {
    x: previous.x + (targetX - previous.x) * SMOOTHING,
    y: previous.y + (targetY - previous.y) * SMOOTHING,
  };
}

export function mapAccelerometerToParallax(
  acceleration: Acceleration,
  previous: ParallaxTilt = { x: 0, y: 0 },
): ParallaxTilt {
  // Expo Accelerometer measurements are already expressed in g-force.
  const targetX = clamp((acceleration?.x ?? 0) / MAX_TILT_SINE);
  const targetY = clamp((acceleration?.y ?? 0) / MAX_TILT_SINE);
  return {
    x: previous.x + (targetX - previous.x) * SMOOTHING,
    y: previous.y + (targetY - previous.y) * SMOOTHING,
  };
}
