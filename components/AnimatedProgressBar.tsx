import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export function AnimatedProgressBar({ value, primary, accent, track }: { value: number; primary: string; accent: string; track: string }) {
  const progress = useSharedValue(0);
  const target = Math.max(0, Math.min(100, value));

  useEffect(() => {
    progress.value = withTiming(target, { duration: 720, easing: Easing.out(Easing.cubic) });
  }, [progress, target]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value}%` }));

  return <View style={[styles.track, { backgroundColor: track }]}>
    <Animated.View style={[styles.fill, fillStyle]}>
      <LinearGradient colors={[primary, accent, primary]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.gradient} />
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  track: { borderRadius: 999, height: 9, marginTop: 6, overflow: 'hidden' },
  fill: { borderRadius: 999, height: '100%', overflow: 'hidden' },
  gradient: { flex: 1 },
});
