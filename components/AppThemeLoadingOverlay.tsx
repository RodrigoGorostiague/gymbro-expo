import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useAuth } from '../context/AuthContext';
import { useShop } from '../context/ShopContext';
import { useTheme } from '../context/ThemeContext';

const gymbroIcon = process.env.NODE_ENV === 'test' ? 0 : require('../assets/gymbro-icon.png');

export function AppThemeLoadingOverlay() {
  const { user } = useAuth();
  const { isInitialLoading } = useShop();
  const { theme } = useTheme();
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 1_100, easing: Easing.linear }), -1, false);
  }, [rotation]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${rotation.value}deg` }],
  }));

  if (!user || !isInitialLoading) return null;

  return (
    <View
      accessibilityLabel="Cargando tema"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      pointerEvents="auto"
      testID="theme-loading-overlay"
      style={[styles.overlay, { backgroundColor: theme.background[0] }]}
    >
      <Animated.View style={iconStyle}>
        <Image accessibilityLabel="Marca de GymBro" source={gymbroIcon} style={styles.icon} testID="theme-loading-logo" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    elevation: 100,
    justifyContent: 'center',
    zIndex: 100,
  },
  icon: { height: 104, width: 104 },
});
