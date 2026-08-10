import React from 'react';
import { vi } from 'vitest';

const createHost = (name: string) => {
  const Component = ({ children, ...props }: any) => React.createElement(name, props, children);
  Component.displayName = name;
  return Component;
};

export const Alert = {
  alert: vi.fn(),
};
export const ActivityIndicator = createHost('ActivityIndicator');
export const Image = createHost('Image');
class AnimatedValue {
  constructor(public value: number) {}
  interpolate() { return this; }
}
const animation = () => ({ start: (callback?: (result: { finished: boolean }) => void) => callback?.({ finished: true }), stop: vi.fn() });
export const Animated = {
  Value: AnimatedValue,
  View: createHost('AnimatedView'),
  timing: animation,
  spring: animation,
  loop: animation,
};
export const Easing = { linear: (value: number) => value };

const appStateListeners = new Set<(state: string) => void>();
export const AppState = {
  addEventListener: vi.fn((_event: 'change', listener: (state: string) => void) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  }),
};

export function __emitAppState(state: string) {
  appStateListeners.forEach((listener) => listener(state));
}

export function __resetAppState() {
  appStateListeners.clear();
  AppState.addEventListener.mockClear();
}

export const Dimensions = { get: () => ({ width: 390, height: 844 }) };
export const FlatList = ({ data, renderItem, keyExtractor, ListHeaderComponent, ListFooterComponent, ...props }: any) => React.createElement(
  'FlatList',
  props,
  ListHeaderComponent,
  (data ?? []).map((item: any, index: number) => {
    const child = renderItem({ item, index });
    const key = keyExtractor ? keyExtractor(item, index) : index;
    return React.createElement(React.Fragment, { key }, child);
  }),
  ListFooterComponent,
);
export const KeyboardAvoidingView = createHost('KeyboardAvoidingView');
export const Modal = createHost('Modal');
export const Platform = { OS: 'ios' };
export const Pressable = ({ children, ...props }: any) => React.createElement(
  'Pressable',
  props,
  typeof children === 'function' ? children({ pressed: false }) : children,
);
export const ScrollView = createHost('ScrollView');
export const StyleSheet = {
  absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  create: <T,>(styles: T) => styles,
  hairlineWidth: 1,
};
export const Text = createHost('Text');
export const TextInput = ({ children, ...props }: any) => React.createElement('TextInput', props, children);
export const Vibration = { vibrate: vi.fn() };
export const View = createHost('View');
