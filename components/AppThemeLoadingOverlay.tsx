import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useShop } from '../context/ShopContext';
import { useTheme } from '../context/ThemeContext';
import { useAnimationActivity } from '../hooks/useAnimationActivity';

const gymbroIcon = process.env.NODE_ENV === 'test' ? 0 : require('../assets/gymbro-icon.png');

export function AppThemeLoadingOverlay() {
  const { user } = useAuth();
  const { hydratedUserId: dataHydratedUserId, offlineWorkoutEnabled } = useData();
  const { hydratedUserId: shopHydratedUserId } = useShop();
  const visible = Boolean(user && !offlineWorkoutEnabled && (dataHydratedUserId !== user || shopHydratedUserId !== user));
  return <GymBroLoadingOverlay visible={visible} />;
}

/** Shared login/publication loader with the same rotating GymBro mark. */
export function GymBroLoadingOverlay({ visible, label = 'Cargando tema', message }: { visible: boolean; label?: string; message?: string }) {
  const { theme } = useTheme();
  const rotation = useSharedValue(0);
  const animationActive = useAnimationActivity(visible);

  useEffect(() => {
    cancelAnimation(rotation);
    rotation.value = animationActive ? withRepeat(withTiming(360, { duration: 1_100, easing: Easing.linear }), -1, false) : 0;
    return () => cancelAnimation(rotation);
  }, [animationActive, rotation]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${rotation.value}deg` }],
  }));

  if (!visible) return null;

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      pointerEvents="auto"
      testID="theme-loading-overlay"
      style={[styles.overlay, { backgroundColor: theme.background[0] }]}
    >
      <Animated.View style={iconStyle}>
        <Image accessibilityLabel="Marca de GymBro" source={gymbroIcon} style={styles.icon} testID="theme-loading-logo" />
      </Animated.View>
      {message ? <Text style={{ color: theme.text, fontSize: 16, marginTop: 24, textAlign: 'center' }}>{message}</Text> : null}
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
