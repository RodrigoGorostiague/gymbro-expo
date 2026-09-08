import React from 'react';
import { vi } from 'vitest';

const View = ({ children, ...props }: any) => React.createElement('AnimatedView', props, children);

const Animated: any = { View };
Animated.createAnimatedComponent = (Component: any) => Component;

export default Animated;
export const Easing = {
  inOut: (value: any) => value,
  out: (value: any) => value,
  cubic: 'cubic',
  quad: 'quad',
  sin: 'sin',
};
export const interpolate = (value: number, _input: number[], output: number[]) => output[Math.min(output.length - 1, Math.max(0, Math.round(value)))] ?? output[0];
export const useAnimatedStyle = (factory: () => Record<string, unknown>) => factory();
export const useAnimatedProps = (factory: () => Record<string, unknown>) => factory();
export const useSharedValue = (value: number) => ({ value });
export const useReducedMotion = () => false;
export const ReduceMotion = { System: 'system' };
export const cancelAnimation = () => undefined;
export const withDelay = (_delay: number, value: any) => value;
export const withRepeat = vi.fn((value: any) => value);
export const withSequence = (...values: any[]) => values[0];
export const withSpring = (value: any) => value;
export const withTiming = (value: any, _config?: unknown, callback?: (finished: boolean) => void) => {
  callback?.(true);
  return value;
};
export const runOnJS = (fn: any) => fn;
