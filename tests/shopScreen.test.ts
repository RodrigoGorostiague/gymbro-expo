import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SHOP_BACKGROUNDS } from '../constants/backgrounds';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({ user: 'rodaja' as string | null }));
const shop = vi.hoisted(() => ({
  gems: 800,
  purchasedThemeIds: [] as string[],
  purchasedFrameIds: [] as string[],
  purchasedBackgroundIds: [] as string[],
  equippedThemeId: null as string | null,
  equippedBackgroundId: null as string | null,
  previewThemeId: null as string | null,
  previewBackgroundId: null as string | null,
  purchaseTheme: vi.fn(),
  purchaseFrame: vi.fn(),
  purchaseBackground: vi.fn(),
  equipTheme: vi.fn(),
  unequipTheme: vi.fn(),
  equipBackground: vi.fn(),
  unequipBackground: vi.fn(),
  startPreview: vi.fn(),
  startBackgroundPreview: vi.fn(),
}));

function host(name: string) {
  return ({ children, ...props }: any) => React.createElement(name, props, children);
}

vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/ShopContext', () => ({ useShop: () => shop }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: {
  primary: '#7C3AED', accent: '#A855F7', text: '#FFFFFF', textMuted: '#94A3B8', onPrimary: '#111827',
  success: '#22C55E', glass: 'rgba(255,255,255,0.08)', glassBorder: 'rgba(255,255,255,0.2)', background: ['#020617'],
} }) }));
vi.mock('../components/AppScreenHeader', () => ({ AppScreenHeader: host('AppScreenHeader') }));
vi.mock('../components/CombineWithPartnerCard', () => ({ CombineWithPartnerCard: host('CombineWithPartnerCard') }));
vi.mock('../components/GlassCard', () => ({ GlassCard: host('GlassCard'), ThemeBackground: host('ThemeBackground') }));
vi.mock('../components/LogoutButton', () => ({ LogoutButton: host('LogoutButton') }));
vi.mock('../components/SelectablePulse', () => ({ SelectablePulse: host('SelectablePulse') }));
vi.mock('../components/ThemeDecorations', () => ({ ThemeDecorations: host('ThemeDecorations') }));
vi.mock('../components/BackgroundEngine', () => ({ BackgroundEngine: host('BackgroundEngine') }));
vi.mock('../components/UI', () => ({ GlassButton: host('GlassButton') }));
vi.mock('../components/ProfileAvatar', () => ({ ProfileAvatar: host('ProfileAvatar') }));
vi.mock('../components/HapticPressable', () => ({ HapticPressable: host('HapticPressable') }));

import ShopScreen from '../app/(tabs)/shop';

describe('ShopScreen', () => {
  let scheduledFrame: FrameRequestCallback | null = null;

  beforeEach(() => {
    auth.user = 'rodaja';
    scheduledFrame = null;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  test('acknowledges a requested catalog before rendering it', () => {
    let screen!: TestRenderer.ReactTestRenderer;
    act(() => { screen = TestRenderer.create(React.createElement(ShopScreen)); });

    const framesTab = screen.root.findByProps({ testID: 'shop-tab-frames' });
    act(() => { framesTab.props.onPress(); });

    expect(screen.root.findByProps({ testID: 'shop-tab-frames' }).props.accessibilityState).toEqual({ selected: false, busy: true });
    expect(screen.root.findByProps({ testID: 'shop-tab-frames' }).props.accessibilityLabel).toBe('Cargando Marcos');

    act(() => { scheduledFrame?.(0); });

    expect(screen.root.findByProps({ testID: 'shop-tab-frames' }).props.accessibilityState).toEqual({ selected: true, busy: false });
    expect(screen.root.findAll((node) => (node.type as unknown) === 'ProfileAvatar')).not.toHaveLength(0);
  });

  test('renders catalog entries through the virtualized list', () => {
    let screen!: TestRenderer.ReactTestRenderer;
    act(() => { screen = TestRenderer.create(React.createElement(ShopScreen)); });

    const list = screen.root.find((node) => (node.type as unknown) === 'FlatList');
    expect(list.props.initialNumToRender).toBe(6);
    expect(list.props.maxToRenderPerBatch).toBe(6);
    expect(list.props.windowSize).toBe(5);
    expect(list.props.onViewableItemsChanged).toBeTypeOf('function');
  });

  test('preserves hook order across authentication transitions', () => {
    auth.user = null;
    let screen!: TestRenderer.ReactTestRenderer;
    act(() => { screen = TestRenderer.create(React.createElement(ShopScreen)); });
    expect(screen.toJSON()).toBeNull();

    auth.user = 'rodaja';
    expect(() => act(() => { screen.update(React.createElement(ShopScreen)); })).not.toThrow();
    expect(screen.root.find((node) => (node.type as unknown) === 'FlatList')).toBeDefined();

    auth.user = null;
    expect(() => act(() => { screen.update(React.createElement(ShopScreen)); })).not.toThrow();
    expect(screen.toJSON()).toBeNull();
  });

  test('animates only the selected visible background preview', () => {
    let screen!: TestRenderer.ReactTestRenderer;
    act(() => { screen = TestRenderer.create(React.createElement(ShopScreen)); });
    act(() => { screen.root.findByProps({ testID: 'shop-tab-backgrounds' }).props.onPress(); });
    act(() => { scheduledFrame?.(0); });
    const list = screen.root.find((node) => (node.type as unknown) === 'FlatList');
    const background = SHOP_BACKGROUNDS[0];
    shop.previewBackgroundId = background.id;
    act(() => {
      list.props.onViewableItemsChanged({ viewableItems: [{ isViewable: true, item: { id: background.id, type: 'background', item: background } }] });
      screen.update(React.createElement(ShopScreen));
    });

    const engines = screen.root.findAll((node) => (node.type as unknown) === 'BackgroundEngine');
    expect(engines.filter((engine) => engine.props.animate)).toHaveLength(1);
    expect(engines.find((engine) => engine.props.backgroundId === background.id)?.props.animate).toBe(true);
  });
});
