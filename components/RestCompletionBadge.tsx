import React, { useEffect, useRef } from 'react';
import { Animated as RNAnimated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { HapticPressable } from './HapticPressable';

export function shouldDismissRestCompletionBadge(translationX: number, velocityX: number): boolean {
  'worklet';
  return Math.abs(translationX) >= 96 || Math.abs(velocityX) >= 650;
}

export function RestCompletionBadge({ visible, onDismiss }: {
  visible: boolean;
  onDismiss: () => void;
}) {
  const { theme } = useTheme();
  const entrance = useRef(new RNAnimated.Value(84)).current;
  const translateX = useSharedValue(0);
  const swipeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((event) => { translateX.value = event.translationX; })
    .onEnd((event) => {
      if (shouldDismissRestCompletionBadge(event.translationX, event.velocityX)) {
        const direction = event.translationX || event.velocityX;
        translateX.value = withTiming(direction < 0 ? -480 : 480, { duration: 160 }, (finished) => {
          if (finished) runOnJS(onDismiss)();
        });
      } else translateX.value = withTiming(0, { duration: 160 });
    });

  useEffect(() => {
    if (!visible) return;
    RNAnimated.spring(entrance, { toValue: 0, useNativeDriver: true, friction: 9, tension: 75 }).start();
    void import('../utils/restNotificationSound').then(({ playRestNotificationSound }) => playRestNotificationSound()).catch(() => undefined);
  }, [entrance, visible]);

  if (!visible) return null;

  return <View pointerEvents="box-none" style={styles.stack}><GestureDetector gesture={pan}><Animated.View style={swipeStyle}>
    <RNAnimated.View accessibilityRole="alert" style={[styles.badge, { backgroundColor: theme.tabBarBackground, borderColor: theme.primary, transform: [{ translateY: entrance }] }]}>
      <View style={[styles.icon, { backgroundColor: `${theme.primary}24` }]}><Ionicons name="timer-outline" color={theme.primary} size={23} /></View>
      <View style={styles.copy}><Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>Descanso terminado</Text><Text numberOfLines={2} style={[styles.body, { color: theme.textMuted }]}>Continúa con la próxima serie.</Text></View>
      <HapticPressable accessibilityRole="button" accessibilityLabel="Cerrar aviso de descanso" onPress={onDismiss} style={styles.close}><Text style={[styles.closeText, { color: theme.textMuted }]}>×</Text></HapticPressable>
    </RNAnimated.View>
  </Animated.View></GestureDetector></View>;
}

const styles = StyleSheet.create({
  stack: { bottom: 24, left: 12, position: 'absolute', right: 12, zIndex: 100 },
  badge: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, elevation: 8 },
  icon: { alignItems: 'center', borderRadius: 21, height: 42, justifyContent: 'center', width: 42 },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '900' },
  body: { fontSize: 12, lineHeight: 16 },
  close: { padding: 2 },
  closeText: { fontSize: 24, lineHeight: 24 },
});
