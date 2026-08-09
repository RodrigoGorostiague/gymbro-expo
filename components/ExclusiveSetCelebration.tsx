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
import { AppTheme, ThemeCelebrationSpec } from '../types';

const DEFAULT_CELEBRATION: ThemeCelebrationSpec = {
  duration: 820, particleCount: 6, spread: 130, rise: 220, rotation: 220, flashScale: 2.2, shape: 'circle',
};

type ParticleProps = {
  color: string;
  progress: SharedValue<number>;
  x: number;
  y: number;
  size: number;
  rotation: number;
  shape: ThemeCelebrationSpec['shape'];
};

function Particle({ color, progress, x, y, size, rotation, shape }: ParticleProps) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12, 0.7, 1], [0, 1, 0.8, 0]),
    transform: [
      { translateX: progress.value * x },
      { translateY: progress.value * y },
      { scale: interpolate(progress.value, [0, 0.2, 1], [0.3, 1, 0.1]) },
      { rotate: `${progress.value * rotation}deg` },
    ],
  }));

  return <Animated.View style={[styles.particle, shape === 'circle' && styles.circle, shape === 'bar' && styles.bar, { width: size, height: size, backgroundColor: color }, style]} />;
}

export function ExclusiveSetCelebration({ active, theme }: { active: number; theme: AppTheme }) {
  const progress = useSharedValue(1);
  const celebration = theme.celebration ?? DEFAULT_CELEBRATION;
  const particles = Array.from({ length: celebration.particleCount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / celebration.particleCount - Math.PI / 2;
    return {
      color: [theme.primary, theme.accent, theme.secondary][index % 3],
      x: Math.cos(angle) * celebration.spread,
      y: Math.sin(angle) * celebration.spread - celebration.rise,
      size: 8 + (index % 4) * 2,
    };
  });

  useEffect(() => {
    if (active === 0) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: celebration.duration, easing: Easing.out(Easing.cubic) });
  }, [active, celebration.duration, progress]);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.1, 0.55, 1], [0, 0.82, 0.12, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.5, celebration.flashScale]) }],
  }));

  if (active === 0) return null;

  return (
    <View pointerEvents="none" style={styles.layer}>
      <Animated.View style={[styles.flash, { backgroundColor: theme.accent }, flashStyle]} />
      {particles.map((particle, index) => <Particle key={index} {...particle} progress={progress} rotation={celebration.rotation} shape={celebration.shape} />)}
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
  },
  circle: { borderRadius: 99 },
  bar: { borderRadius: 2, height: 5 },
});
