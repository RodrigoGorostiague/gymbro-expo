import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { withRepeat } from 'react-native-reanimated';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({ user: 'member-1' as string | null }));
const data = vi.hoisted(() => ({ hydratedUserId: null as string | null }));
const shop = vi.hoisted(() => ({ hydratedUserId: null as string | null }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/DataContext', () => ({ useData: () => data }));
vi.mock('../context/ShopContext', () => ({ useShop: () => shop }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { background: ['#101010'] } }) }));

import { AppThemeLoadingOverlay } from '../components/AppThemeLoadingOverlay';

describe('AppThemeLoadingOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = 'member-1';
    data.hydratedUserId = null;
    shop.hydratedUserId = null;
  });

  test('covers the authenticated app while its equipped theme is loading', () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(React.createElement(AppThemeLoadingOverlay)); });

    expect(tree!.root.findByProps({ testID: 'theme-loading-overlay' }).props.accessibilityState).toEqual({ busy: true });
    expect(tree!.root.findByProps({ testID: 'theme-loading-logo' }).props.accessibilityLabel).toBe('Marca de GymBro');
  });

  test('blocks a newly authenticated user until both startup hydrations finish', () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(React.createElement(AppThemeLoadingOverlay)); });

    shop.hydratedUserId = 'member-1';
    act(() => { tree!.update(React.createElement(AppThemeLoadingOverlay)); });
    expect(tree!.root.findByProps({ testID: 'theme-loading-overlay' })).toBeDefined();

    data.hydratedUserId = 'member-1';
    act(() => { tree!.update(React.createElement(AppThemeLoadingOverlay)); });
    expect(tree!.toJSON()).toBeNull();
  });

  test('does not cover login or a fully hydrated app', () => {
    auth.user = null;
    let tree: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(React.createElement(AppThemeLoadingOverlay)); });
    expect(tree!.toJSON()).toBeNull();
    expect(withRepeat).not.toHaveBeenCalled();

    auth.user = 'member-1';
    data.hydratedUserId = 'member-1';
    shop.hydratedUserId = 'member-1';
    act(() => { tree!.update(React.createElement(AppThemeLoadingOverlay)); });
    expect(tree!.toJSON()).toBeNull();
  });
});
