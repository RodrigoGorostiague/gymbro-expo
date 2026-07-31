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
export const FlatList = ({ data, renderItem, keyExtractor, ...props }: any) => React.createElement(
  'FlatList',
  props,
  (data ?? []).map((item: any, index: number) => {
    const child = renderItem({ item, index });
    const key = keyExtractor ? keyExtractor(item, index) : index;
    return React.createElement(React.Fragment, { key }, child);
  }),
);
export const KeyboardAvoidingView = createHost('KeyboardAvoidingView');
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
