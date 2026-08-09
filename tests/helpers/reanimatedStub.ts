import React from 'react';

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
export const cancelAnimation = () => undefined;
export const withDelay = (_delay: number, value: any) => value;
export const withRepeat = (value: any) => value;
export const withSequence = (...values: any[]) => values[0];
export const withSpring = (value: any) => value;
export const withTiming = (value: any) => value;
export const runOnJS = (fn: any) => fn;
