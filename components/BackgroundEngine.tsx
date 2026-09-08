import React, { useCallback, useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Accelerometer, DeviceMotion } from 'expo-sensors';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BackgroundRendererKind, getShopBackground } from '../constants/backgrounds';
import { BackgroundLayerSource, BackgroundLoadError, useBackgroundLayers } from '../services/backgrounds';
import { useBackgroundParallaxPreference } from '../context/BackgroundParallaxContext';
import { BACKGROUND_PARALLAX_DEPTHS, BACKGROUND_PARALLAX_INTERVAL_MS, mapAccelerometerToParallax, mapDeviceMotionToParallax, shouldActivateBackgroundParallax } from '../utils/backgroundParallax';
import { useAnimationActivity } from '../hooks/useAnimationActivity';

type LayerSource = BackgroundLayerSource;

interface BackgroundRendererProps {
  backgroundId: string;
  layers: readonly LayerSource[];
  fallback: readonly [string, string, string];
  animate: boolean;
  parallaxX: { value: number };
  parallaxY: { value: number };
  onError: (error: BackgroundLoadError) => void;
}

type BackgroundRenderer = (props: BackgroundRendererProps) => React.ReactNode;

function MotionLayer({ backgroundId, source, index, animate, parallaxX, parallaxY, onError }: { backgroundId: string; source: LayerSource; index: number; animate: boolean; parallaxX: { value: number }; parallaxY: { value: number }; onError: (error: BackgroundLoadError) => void }) {
  const progress = useSharedValue(0);
  const depth = BACKGROUND_PARALLAX_DEPTHS[index] ?? BACKGROUND_PARALLAX_DEPTHS[BACKGROUND_PARALLAX_DEPTHS.length - 1];
  const style = useAnimatedStyle(() => ({
    opacity: 1,
    transform: [
      { translateX: (index % 2 === 0 ? 1 : -1) * progress.value * (14 + index * 5) + parallaxX.value * depth },
      { translateY: (index % 2 === 0 ? -1 : 1) * progress.value * (10 + index * 4) + parallaxY.value * depth },
      { scale: 1.06 + progress.value * 0.03 },
    ],
  }));

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = animate
      ? withRepeat(withTiming(1, { duration: 8500 + index * 1200, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }), -1, true)
      : 0;
    return () => cancelAnimation(progress);
  }, [animate, index, progress]);

  return <Animated.View pointerEvents="none" style={[styles.layer, style]}>
    <Image
      cachePolicy="memory-disk"
      contentFit="cover"
      onError={(event) => onError({ backgroundId, message: `Background layer failed to load: ${event.error}` })}
      source={source}
      style={styles.image}
      transition={180}
    />
  </Animated.View>;
}

const layeredImageRenderer: BackgroundRenderer = ({ backgroundId, layers, fallback, animate, parallaxX, parallaxY, onError }) => <View pointerEvents="none" style={StyleSheet.absoluteFill}>
  <LinearGradient colors={fallback} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
  {layers.map((source, index) => <MotionLayer key={source.cacheKey} backgroundId={backgroundId} source={source} index={index} animate={animate} parallaxX={parallaxX} parallaxY={parallaxY} onError={onError} />)}
</View>;

const renderers: Record<BackgroundRendererKind, BackgroundRenderer> = {
  'layered-image': layeredImageRenderer,
};

export function BackgroundEngine({ backgroundId, onError, parallax = true, animate = true }: { backgroundId: string | null; onError?: (error: BackgroundLoadError) => void; parallax?: boolean; animate?: boolean }) {
  const background = getShopBackground(backgroundId);
  const { layers: sources, error } = useBackgroundLayers(background?.id);
  const animationActive = useAnimationActivity(animate);
  const { enabled, isReady } = useBackgroundParallaxPreference();
  const parallaxX = useSharedValue(0);
  const parallaxY = useSharedValue(0);

  const motionEnabled = shouldActivateBackgroundParallax({
    backgroundActive: Boolean(background) && parallax,
    animationActive,
    enabled,
    preferencesReady: isReady,
    supportedPlatform: Platform.OS === 'ios' || Platform.OS === 'android',
  });

  useEffect(() => {
    if (!motionEnabled) return undefined;
    let mounted = true;
    let subscription: { remove: () => void } | undefined;
    let warnedAboutMeasurement = false;
    void (async () => {
      const useAccelerometer = Platform.OS === 'android';
      const sensorName = useAccelerometer ? 'Accelerometer' : 'Device motion';
      const available = useAccelerometer
        ? await Accelerometer.isAvailableAsync()
        : await DeviceMotion.isAvailableAsync();
      if (!available || !mounted) {
        if (mounted && typeof __DEV__ !== 'undefined' && __DEV__) console.warn(`[BackgroundEngine] ${sensorName} sensor is unavailable.`);
        return;
      }
      if (Platform.OS === 'ios') {
        const permission = await DeviceMotion.getPermissionsAsync();
        const granted = permission.granted
          ? true
          : permission.canAskAgain ? (await DeviceMotion.requestPermissionsAsync()).granted : false;
        if (!granted || !mounted) {
          if (mounted && typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[BackgroundEngine] Device motion permission was denied.');
          return;
        }
      }
      if (!mounted) return;
      if (useAccelerometer) {
        Accelerometer.setUpdateInterval(BACKGROUND_PARALLAX_INTERVAL_MS);
        subscription = Accelerometer.addListener((measurement) => {
          const previous = { x: parallaxX.value, y: parallaxY.value };
          const next = mapAccelerometerToParallax(measurement, previous);
          parallaxX.value = next.x;
          parallaxY.value = next.y;
        });
        return;
      }
      DeviceMotion.setUpdateInterval(BACKGROUND_PARALLAX_INTERVAL_MS);
      subscription = DeviceMotion.addListener((measurement) => {
        const previous = { x: parallaxX.value, y: parallaxY.value };
        const next = mapDeviceMotionToParallax(measurement.rotation, previous, measurement.accelerationIncludingGravity);
        if (!warnedAboutMeasurement && next.x === previous.x && next.y === previous.y) {
          warnedAboutMeasurement = true;
          if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[BackgroundEngine] Device motion measurement contained no usable rotation or gravity tilt.');
        }
        parallaxX.value = next.x;
        parallaxY.value = next.y;
      });
    })().catch((cause: unknown) => {
      const sensorName = Platform.OS === 'android' ? 'Accelerometer' : 'Device motion';
      if (mounted && typeof __DEV__ !== 'undefined' && __DEV__) console.warn(`[BackgroundEngine] ${sensorName} subscription failed.`, cause);
    });
    return () => {
      mounted = false;
      subscription?.remove();
      cancelAnimation(parallaxX);
      cancelAnimation(parallaxY);
      parallaxX.value = 0;
      parallaxY.value = 0;
    };
  }, [motionEnabled, parallaxX, parallaxY]);

  const renderer = background ? renderers[background.renderer] : null;
  const layers = useMemo(() => sources.length === background?.layerCount ? sources : [], [background?.layerCount, sources]);
  const reportError = useCallback((nextError: BackgroundLoadError) => {
    onError?.(nextError);
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(`[BackgroundEngine] ${nextError.message}`, nextError.cause ?? nextError.backgroundId);
  }, [onError]);

  useEffect(() => {
    if (!error) return;
    reportError(error);
  }, [error, reportError]);

  if (!background || !renderer) return null;
  return <>{renderer({ backgroundId: background.id, layers, fallback: background.fallback, animate: animationActive, parallaxX, parallaxY, onError: reportError })}</>;
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  image: { ...StyleSheet.absoluteFill, height: '100%', width: '100%' },
});
