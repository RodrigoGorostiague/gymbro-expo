import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';
import { NavigationContext } from 'expo-router/react-navigation';
import { __emitAppState, __resetAppState } from './helpers/reactNativeStub';
import { shouldRunAnimations } from '../utils/animationActivity';
import { useAnimationActivity } from '../hooks/useAnimationActivity';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function ActivityProbe({ enabled = true }: { enabled?: boolean }) {
  return React.createElement('ActivityProbe', { active: useAnimationActivity(enabled) });
}

const activityNode = (tree: TestRenderer.ReactTestRenderer) => tree.root.find((node) => String(node.type) === 'ActivityProbe');

describe('animation activity', () => {
  test('requires an active app, focused route, enabled surface, and unrestricted motion', () => {
    const active = { appActive: true, navigationFocused: true, reduceMotion: false };
    expect(shouldRunAnimations(active)).toBe(true);
    expect(shouldRunAnimations({ ...active, appActive: false })).toBe(false);
    expect(shouldRunAnimations({ ...active, navigationFocused: false })).toBe(false);
    expect(shouldRunAnimations({ ...active, reduceMotion: true })).toBe(false);
    expect(shouldRunAnimations({ ...active, enabled: false })).toBe(false);
  });

  test('is safe outside navigation and stops for hidden or inactive surfaces', () => {
    __resetAppState();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(React.createElement(ActivityProbe)); });
    expect(activityNode(tree).props.active).toBe(true);

    act(() => { tree.update(React.createElement(ActivityProbe, { enabled: false })); });
    expect(activityNode(tree).props.active).toBe(false);
    act(() => { __emitAppState('background'); });
    expect(activityNode(tree).props.active).toBe(false);
    act(() => { tree.unmount(); });
  });

  test('tracks route focus when navigation is available', () => {
    let focused = true;
    const listeners = new Map<string, () => void>();
    const navigation = {
      isFocused: () => focused,
      addListener: vi.fn((event: string, listener: () => void) => {
        listeners.set(event, listener);
        return () => { listeners.delete(event); };
      }),
    };
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(NavigationContext.Provider, { value: navigation as unknown as React.ContextType<typeof NavigationContext> }, React.createElement(ActivityProbe)));
    });
    expect(activityNode(tree).props.active).toBe(true);
    focused = false;
    act(() => { listeners.get('blur')?.(); });
    expect(activityNode(tree).props.active).toBe(false);
    act(() => { tree.unmount(); });
  });
});
