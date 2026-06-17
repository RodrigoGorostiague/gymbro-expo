import React from 'react';
import { Pressable, PressableProps } from 'react-native';
import { vibrateButtonPress } from '../utils/haptics';

export function HapticPressable({ onPress, disabled, ...rest }: PressableProps) {
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPress={(event) => {
        if (!disabled) vibrateButtonPress();
        onPress?.(event);
      }}
    />
  );
}
