import React from 'react';

let insets = { top: 0, right: 0, bottom: 0, left: 0 };

export const SafeAreaView = ({ children, ...props }: any) => React.createElement('SafeAreaView', props, children);
export const SafeAreaProvider = ({ children, ...props }: any) => React.createElement('SafeAreaProvider', props, children);
export const useSafeAreaInsets = () => insets;
export const __setSafeAreaInsets = (next: Partial<typeof insets>) => { insets = { ...insets, ...next }; };
export const __resetSafeAreaInsets = () => { insets = { top: 0, right: 0, bottom: 0, left: 0 }; };
