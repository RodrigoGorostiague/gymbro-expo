import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Alert } from 'react-native';
import { SHOP_BACKGROUNDS } from '../constants/backgrounds';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const atmosphere = vi.hoisted(() => ({ selected: 'local-forge' as string | null, save: vi.fn(async (_value: unknown) => undefined) }));
vi.mock('../hooks/useLocalAtmosphere', () => ({ ATMOSPHERES: [], useLocalAtmosphere: () => atmosphere.selected, getLocalAtmosphere: () => atmosphere.selected, saveLocalAtmosphere: atmosphere.save }));
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
  test('restores an equipped paid background from local ambience without a purchase or unequip', async () => {
    shop.purchasedBackgroundIds = ['banzai'];
    shop.equippedBackgroundId = 'banzai';
    atmosphere.selected = 'local-forge';
    atmosphere.save.mockClear();
    shop.purchaseBackground.mockClear();
    shop.unequipBackground.mockClear();
    let screen!: TestRenderer.ReactTestRenderer;
    act(() => { screen = TestRenderer.create(React.createElement(ShopScreen)); });
    act(() => { screen.root.findByProps({ testID: 'shop-tab-backgrounds' }).props.onPress(); });
    act(() => { scheduledFrame?.(0); });
    await act(async () => {
      screen.root.find((node) => String(node.type) === 'HapticPressable' && node.props.accessibilityLabel === 'Restaurar fondo Banzai').props.onPress();
    });
    expect(atmosphere.save).toHaveBeenCalledWith(null);
    expect(shop.purchaseBackground).not.toHaveBeenCalled();
    expect(shop.unequipBackground).not.toHaveBeenCalled();
    expect(shop.equippedBackgroundId).toBe('banzai');
    act(() => screen.unmount());
    shop.purchasedBackgroundIds = [];
    shop.equippedBackgroundId = null;
    atmosphere.selected = null;
  });

  test('waits for remote confirmation, blocks duplicate taps and preserves local choice on rejection', async () => {
    shop.purchasedBackgroundIds = ['banzai']; shop.equippedBackgroundId = 'sakura';
    atmosphere.selected = 'local-forge'; atmosphere.save.mockClear();
    const alert = vi.spyOn(Alert, 'alert');
    let finish!: (value: boolean) => void;
    shop.equipBackground.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    shop.equipBackground.mockClear();
    let screen!: TestRenderer.ReactTestRenderer;
    act(() => { screen = TestRenderer.create(React.createElement(ShopScreen)); });
    act(() => { screen.root.findByProps({ testID: 'shop-tab-backgrounds' }).props.onPress(); });
    act(() => { scheduledFrame?.(0); });
    const action = () => screen.root.find((node) => String(node.type) === 'HapticPressable' && node.props.accessibilityLabel === 'Usar fondo Banzai').props.onPress();
    act(() => { action(); action(); });
    expect(shop.equipBackground).toHaveBeenCalledOnce();
    expect(atmosphere.save).not.toHaveBeenCalled();
    await act(async () => { finish(false); });
    expect(atmosphere.save).not.toHaveBeenCalled();
    expect(atmosphere.selected).toBe('local-forge');
    expect(alert).toHaveBeenCalledWith('No se confirmó el fondo', expect.stringContaining('sigue activa'));
    act(() => action());
    await act(async () => { finish(true); });
    expect(atmosphere.save).toHaveBeenCalledWith(null);
    atmosphere.save.mockClear();
    atmosphere.save.mockRejectedValueOnce(new Error('disk full'));
    act(() => action());
    await act(async () => { finish(true); });
    expect(alert).toHaveBeenCalledWith('Fondo de cuenta confirmado', expect.stringContaining('Banzai está seleccionado en tu cuenta'));
    expect(atmosphere.selected).toBe('local-forge');
    atmosphere.save.mockClear();
    act(() => action());
    auth.user = 'brisas';
    act(() => screen.update(React.createElement(ShopScreen)));
    await act(async () => { finish(true); });
    expect(atmosphere.save).not.toHaveBeenCalled();
    act(() => screen.unmount());
    shop.purchasedBackgroundIds = []; shop.equippedBackgroundId = null;
    atmosphere.selected = null;
    shop.equipBackground.mockReset();
    alert.mockRestore();
  });

});
