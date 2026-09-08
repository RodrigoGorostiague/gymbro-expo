import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface AnimatedOrbProps {
  active?: boolean;
  color: string;
  size: number;
  left: number;
  top: number;
  delay?: number;
}

export function AnimatedOrb({ active = true, color, size, left, top, delay = 0 }: AnimatedOrbProps) {
  const drift = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(drift);
    if (!active) {
      drift.value = 0;
      return;
    }
    drift.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 3200 + delay, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 3200 + delay, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(drift);
  }, [active, delay, drift]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [0, 18]) },
      { translateY: interpolate(drift.value, [0, 1], [0, -24]) },
      { scale: interpolate(drift.value, [0, 0.5, 1], [0.85, 1.2, 0.85]) },
    ],
    opacity: interpolate(drift.value, [0, 0.5, 1], [0.22, 0.5, 0.22]),
  }));

  return (
    <Animated.View
      style={[
        styles.orb,
        { width: size, height: size, borderRadius: size / 2, left, top, backgroundColor: color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
  },
});
