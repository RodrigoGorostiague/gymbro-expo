import React from 'react';

export const SafeAreaView = ({ children, ...props }: any) => React.createElement('SafeAreaView', props, children);
export const SafeAreaProvider = ({ children, ...props }: any) => React.createElement('SafeAreaProvider', props, children);
export const useSafeAreaInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 });
