import React from 'react';

export const GestureDetector = ({ children }: { children: React.ReactNode }) => <>{children}</>;
export const GestureHandlerRootView = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const chain = () => ({ enabled: () => chain(), activateAfterLongPress: () => chain(), activeOffsetX: () => chain(), failOffsetY: () => chain(), runOnJS: () => chain(), onBegin: () => chain(), onUpdate: () => chain(), onEnd: () => chain(), onFinalize: () => chain() });
export const Gesture = { Pan: chain };
