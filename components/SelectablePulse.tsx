import React, { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { AppTheme } from '../types';
import { useAnimationActivity } from '../hooks/useAnimationActivity';

type PulseTheme = Pick<AppTheme, 'primary' | 'accent'>;

interface SelectablePulseProps {
  selected: boolean;
  theme: PulseTheme;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
}

export function SelectablePulse({
  selected,
  theme,
  children,
  style,
  borderRadius = 20,
}: SelectablePulseProps) {
  const pulse = useSharedValue(0);
  const animationActive = useAnimationActivity(selected);

  useEffect(() => {
    cancelAnimation(pulse);
    if (animationActive) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      pulse.value = 0;
    }
    return () => cancelAnimation(pulse);
  }, [animationActive, pulse]);

  const animatedStyle = useAnimatedStyle(() => {
    if (!selected) {
      return {
        borderWidth: 0,
        borderColor: 'transparent',
        transform: [{ scale: 1 }],
      };
    }

    return {
      borderWidth: 2,
      borderColor: interpolateColor(pulse.value, [0, 1], [theme.primary, theme.accent]),
      transform: [{ scale: 1 + pulse.value * 0.012 }],
    };
  }, [selected, theme.primary, theme.accent]);

  return (
    <Animated.View style={[{ borderRadius, overflow: 'hidden' }, animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}
