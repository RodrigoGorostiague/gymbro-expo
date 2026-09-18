import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import type { AppTheme } from '../../types';

interface DualLoginFooterProps { rodaja: AppTheme; brisas: AppTheme; }

export function DualLoginFooter({ rodaja, brisas }: DualLoginFooterProps) {
  const enter = useSharedValue(0);
  useEffect(() => { enter.value = withDelay(420, withSpring(1, { damping: 16, stiffness: 80 })); }, [enter]);
  const style = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ translateY: interpolate(enter.value, [0, 1], [12, 0]) }] }));
  return <Animated.View style={[styles.wrap, style]}><View style={styles.row}><View style={[styles.line, { backgroundColor: rodaja.primary }]} /><Text style={[styles.label, { color: brisas.primary }]}>FUERZA COMPARTIDA</Text><View style={[styles.line, { backgroundColor: rodaja.primary }]} /></View><Text style={styles.sub}>Tu progreso también inspira a tu círculo.</Text></Animated.View>;
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center', marginTop: 28 }, row: { alignItems: 'center', flexDirection: 'row', gap: 9 }, line: { height: 1, opacity: 0.62, width: 26 }, label: { fontSize: 11, fontWeight: '900', letterSpacing: 1.25 }, sub: { color: 'rgba(255,255,255,0.48)', fontSize: 12, marginTop: 7, textAlign: 'center' } });
