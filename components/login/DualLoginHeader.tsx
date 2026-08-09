import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import type { AppTheme } from '../../types';

interface DualLoginHeaderProps {
  rodaja: AppTheme;
  brisas: AppTheme;
}

export function DualLoginHeader({ rodaja, brisas }: DualLoginHeaderProps) {
  const enter = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 14, stiffness: 90 });
    glow.value = withRepeat(withSequence(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
    ), -1, false);
  }, [enter, glow]);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: interpolate(enter.value, [0, 1], [28, 0]) }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: interpolate(glow.value, [0, 1], [0.34, 0.85]), transform: [{ scale: 1 + glow.value * 0.08 }] }));

  return (
    <Animated.View style={[styles.wrap, headerStyle]}>
      <Animated.View style={[styles.glow, { backgroundColor: rodaja.primary }, glowStyle]} />
      <View style={[styles.markFrame, { borderColor: rodaja.primary, shadowColor: rodaja.primary }]}>
        <Image source={require('../../assets/gymbro-icon.png')} resizeMode="cover" style={styles.mark} accessibilityLabel="Marca de GymBro: dos capibaras unidas" />
      </View>
      <Text style={styles.logo}><Text style={styles.logoGym}>Gym</Text><Text style={[styles.logoBro, { color: rodaja.primary }]}>Bro</Text></Text>
      <Text style={[styles.tagline, { color: brisas.primary }]}>Entrená en equipo. Crecé en serio.</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginBottom: 24, overflow: 'hidden', paddingTop: 8 },
  glow: { borderRadius: 100, height: 134, position: 'absolute', top: 8, width: 134 },
  markFrame: { backgroundColor: '#0D0D0D', borderRadius: 32, borderWidth: 1.5, elevation: 10, height: 112, overflow: 'hidden', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.48, shadowRadius: 16, width: 112 },
  mark: { height: '100%', width: '100%' },
  logo: { color: '#FFF8ED', fontSize: 34, fontWeight: '900', letterSpacing: -1.2, marginTop: 12 },
  logoGym: { color: '#FFF8ED' },
  logoBro: { fontWeight: '900' },
  tagline: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3, marginTop: 5 },
});
