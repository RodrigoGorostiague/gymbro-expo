import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { AnimatedOrb } from '../AnimatedOrb';
import type { AppTheme } from '../../types';

const { width: W, height: H } = Dimensions.get('window');

interface DualLoginBackgroundProps { rodaja: AppTheme; brisas: AppTheme; }

export function DualLoginBackground({ rodaja, brisas }: DualLoginBackgroundProps) {
  const breath = useSharedValue(0);
  useEffect(() => { breath.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.quad) }), -1, true); }, [breath]);
  const auraStyle = useAnimatedStyle(() => ({ opacity: interpolate(breath.value, [0, 1], [0.28, 0.68]), transform: [{ scale: 1 + breath.value * 0.1 }] }));
  return <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <LinearGradient colors={['#070707', '#17120A', '#090909']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
    <Animated.View style={[styles.aura, { backgroundColor: rodaja.primary }, auraStyle]} />
    <AnimatedOrb color={rodaja.primary} size={150} left={W * 0.04} top={H * 0.12} />
    <AnimatedOrb color={brisas.primary} size={76} left={W * 0.72} top={H * 0.18} delay={500} />
    <AnimatedOrb color={rodaja.accent} size={44} left={W * 0.6} top={H * 0.7} delay={950} />
  </View>;
}

const styles = StyleSheet.create({ aura: { borderRadius: 220, height: 440, left: -145, opacity: 0.45, position: 'absolute', top: H * 0.2, width: 440 } });
