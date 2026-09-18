import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sound = vi.hoisted(() => ({ playRestNotificationSound: vi.fn() }));

vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { tabBarBackground: '#111', primary: '#0f0', text: '#fff', textMuted: '#aaa' } }) }));
vi.mock('../utils/restNotificationSound', () => sound);
vi.mock('../components/HapticPressable', () => ({ HapticPressable: ({ children, onPress, accessibilityLabel }: any) => React.createElement('button', { onClick: onPress, 'aria-label': accessibilityLabel }, children) }));

import { RestCompletionBadge, shouldDismissRestCompletionBadge } from '../components/RestCompletionBadge';

describe('RestCompletionBadge', () => {
  test('plays the rest cue and dismisses the in-app completion notice', async () => {
    const onDismiss = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(React.createElement(RestCompletionBadge, { visible: true, onDismiss })); await Promise.resolve(); });

    expect(sound.playRestNotificationSound).toHaveBeenCalledTimes(1);
    const close = renderer!.root.findByProps({ 'aria-label': 'Cerrar aviso de descanso' });
    close.props.onClick();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('uses the same intentional horizontal swipe threshold as social badges', () => {
    expect(shouldDismissRestCompletionBadge(95, 0)).toBe(false);
    expect(shouldDismissRestCompletionBadge(-96, 0)).toBe(true);
    expect(shouldDismissRestCompletionBadge(0, 650)).toBe(true);
  });
});
