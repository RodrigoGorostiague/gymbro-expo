import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({ user: 'member-1' as string | null }));
const shop = vi.hoisted(() => ({ isInitialLoading: true }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/ShopContext', () => ({ useShop: () => shop }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { background: ['#101010'] } }) }));

import { AppThemeLoadingOverlay } from '../components/AppThemeLoadingOverlay';

describe('AppThemeLoadingOverlay', () => {
  beforeEach(() => {
    auth.user = 'member-1';
    shop.isInitialLoading = true;
  });

  test('covers the authenticated app while its equipped theme is loading', () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(React.createElement(AppThemeLoadingOverlay)); });

    expect(tree!.root.findByProps({ testID: 'theme-loading-overlay' }).props.accessibilityState).toEqual({ busy: true });
    expect(tree!.root.findByProps({ testID: 'theme-loading-logo' }).props.accessibilityLabel).toBe('Marca de GymBro');
  });

  test('does not cover login or a fully hydrated app', () => {
    auth.user = null;
    let tree: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(React.createElement(AppThemeLoadingOverlay)); });
    expect(tree!.toJSON()).toBeNull();

    auth.user = 'member-1';
    shop.isInitialLoading = false;
    act(() => { tree!.update(React.createElement(AppThemeLoadingOverlay)); });
    expect(tree!.toJSON()).toBeNull();
  });
});
