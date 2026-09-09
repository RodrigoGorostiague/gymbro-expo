import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useAnimationActivity } from '../hooks/useAnimationActivity';
import { HapticPressable } from './HapticPressable';
export function PublicationReaction({ count, selected, color, muted, onPress }: {
    count: number;
    selected: boolean;
    color: string;
    muted: string;
    onPress: () => void;
}) {
    const active = useAnimationActivity();
    const scale = useSharedValue(1);
    useEffect(() => {
        if (!active) {
            cancelAnimation(scale);
            scale.value = 1;
        }
        return () => { cancelAnimation(scale); scale.value = 1; };
    }, [active, scale]);
    const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    return <HapticPressable accessibilityRole="button" accessibilityLabel={selected ? 'Quitar estrella' : 'Dar estrella'} accessibilityState={{ selected }} onPress={() => {
            if (active)
                scale.value = withSequence(withTiming(1.18, { duration: 110 }), withTiming(1, { duration: 230 }));
            onPress();
        }} style={styles.target}>
    <Animated.View style={style}><Text style={[styles.value, { color: selected ? color : muted }]}>★ {count}</Text></Animated.View>
  </HapticPressable>;
}
const styles = StyleSheet.create({ target: {
        minHeight: 48, minWidth: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 24
    }, value: { fontSize: 20, fontWeight: '900' } });
