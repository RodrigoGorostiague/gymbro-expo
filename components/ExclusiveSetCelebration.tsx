import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AppTheme } from '../types';

type ParticleProps = {
  color: string;
  progress: SharedValue<number>;
  x: number;
  y: number;
  size: number;
};

function Particle({ color, progress, x, y, size }: ParticleProps) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12, 0.7, 1], [0, 1, 0.8, 0]),
    transform: [
      { translateX: progress.value * x },
      { translateY: progress.value * y },
      { scale: interpolate(progress.value, [0, 0.2, 1], [0.3, 1, 0.1]) },
      { rotate: `${progress.value * 220}deg` },
    ],
  }));

  return <Animated.View style={[styles.particle, { width: size, height: size, backgroundColor: color }, style]} />;
}

export function ExclusiveSetCelebration({ active, theme }: { active: number; theme: AppTheme }) {
  const progress = useSharedValue(1);

  useEffect(() => {
    if (active === 0) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 820, easing: Easing.out(Easing.cubic) });
  }, [active, progress]);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.1, 0.55, 1], [0, 0.82, 0.12, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.5, 2.2]) }],
  }));

  if (active === 0) return null;

  return (
    <View pointerEvents="none" style={styles.layer}>
      <Animated.View style={[styles.flash, { backgroundColor: theme.accent }, flashStyle]} />
      <Particle color={theme.primary} progress={progress} x={-100} y={-220} size={14} />
      <Particle color={theme.accent} progress={progress} x={95} y={-190} size={10} />
      <Particle color={theme.secondary} progress={progress} x={-135} y={-70} size={12} />
      <Particle color={theme.primary} progress={progress} x={130} y={-80} size={8} />
      <Particle color={theme.accent} progress={progress} x={-45} y={-270} size={9} />
      <Particle color={theme.secondary} progress={progress} x={50} y={-250} size={13} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  flash: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  particle: {
    position: 'absolute',
    borderRadius: 99,
  },
});
