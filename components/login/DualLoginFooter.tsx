import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AppTheme } from '../../types';

interface DualLoginFooterProps {
  rodaja: AppTheme;
  brisas: AppTheme;
}

export function DualLoginFooter({ rodaja, brisas }: DualLoginFooterProps) {
  const enter = useSharedValue(0);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    enter.value = withDelay(420, withSpring(1, { damping: 16, stiffness: 80 }));
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [enter, shimmer]);

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: interpolate(enter.value, [0, 1], [12, 0]) }],
  }));

  const leftGlow = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.4, 1]),
  }));

  const rightGlow = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [1, 0.4]),
  }));

  return (
    <Animated.View style={[styles.wrap, wrapStyle]}>
      <View style={styles.row}>
        <Animated.Text style={[styles.side, { color: rodaja.primary }, leftGlow]}>
          fuego
        </Animated.Text>
        <Text style={styles.mid}>×</Text>
        <Animated.Text style={[styles.side, { color: brisas.primary }, rightGlow]}>
          brisa
        </Animated.Text>
      </View>
      <Text style={styles.sub}>Mismo entrenamiento, distinta energía</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 28,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  side: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  mid: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 18,
    fontWeight: '300',
  },
  sub: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
});
