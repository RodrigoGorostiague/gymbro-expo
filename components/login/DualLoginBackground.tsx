import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { AnimatedOrb } from '../AnimatedOrb';
import { AppTheme } from '../../types';

const { width: W, height: H } = Dimensions.get('window');

interface DualLoginBackgroundProps {
  rodaja: AppTheme;
  brisas: AppTheme;
}

export function DualLoginBackground({ rodaja, brisas }: DualLoginBackgroundProps) {
  const seamPulse = useSharedValue(0);
  const leftBreath = useSharedValue(0);
  const rightBreath = useSharedValue(0);

  useEffect(() => {
    seamPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    leftBreath.value = withRepeat(
      withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    rightBreath.value = withRepeat(
      withTiming(1, { duration: 5400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [leftBreath, rightBreath, seamPulse]);

  const leftStyle = useAnimatedStyle(() => ({
    opacity: interpolate(leftBreath.value, [0, 1], [0.88, 1]),
    transform: [{ scale: interpolate(leftBreath.value, [0, 1], [1, 1.03]) }],
  }));

  const rightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(rightBreath.value, [0, 1], [0.9, 1]),
    transform: [
      { scale: interpolate(rightBreath.value, [0, 1], [1, 1.03]) },
      { skewY: '-8deg' },
      { translateY: -40 },
    ],
  }));

  const seamStyle = useAnimatedStyle(() => ({
    opacity: interpolate(seamPulse.value, [0, 1], [0.35, 0.85]),
    transform: [
      { rotate: '-8deg' },
      { scaleX: interpolate(seamPulse.value, [0, 1], [0.98, 1.02]) },
    ],
  }));

  const seamGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(seamPulse.value, [0, 1], [0.08, 0.28]),
    transform: [{ rotate: '-8deg' }, { scaleY: interpolate(seamPulse.value, [0, 1], [1, 1.8]) }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.half, leftStyle]}>
        <LinearGradient
          colors={rodaja.background as [string, string, ...string[]]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <AnimatedOrb color={rodaja.primary} size={120} left={W * 0.04} top={H * 0.12} />
        <AnimatedOrb color={rodaja.accent} size={56} left={W * 0.28} top={H * 0.28} delay={400} />
        <AnimatedOrb color={rodaja.secondary} size={36} left={W * 0.1} top={H * 0.55} delay={900} />
      </Animated.View>

      <Animated.View style={[styles.half, styles.rightHalf, rightStyle]}>
        <LinearGradient
          colors={brisas.background as [string, string, ...string[]]}
          style={StyleSheet.absoluteFill}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
        <AnimatedOrb color={brisas.primary} size={100} left={W * 0.52} top={H * 0.18} delay={200} />
        <AnimatedOrb color={brisas.accent} size={48} left={W * 0.72} top={H * 0.42} delay={600} />
        <AnimatedOrb color={brisas.secondary} size={32} left={W * 0.58} top={H * 0.62} delay={1100} />
      </Animated.View>

      <Animated.View
        style={[
          styles.seamGlow,
          { backgroundColor: rodaja.primary, shadowColor: brisas.primary },
          seamGlowStyle,
        ]}
      />
      <Animated.View style={[styles.seam, seamStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  half: {
    ...StyleSheet.absoluteFill,
  },
  rightHalf: {
    opacity: 0.92,
  },
  seam: {
    position: 'absolute',
    top: '42%',
    left: -24,
    right: -24,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  seamGlow: {
    position: 'absolute',
    top: '41%',
    left: -24,
    right: -24,
    height: 28,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },
});
