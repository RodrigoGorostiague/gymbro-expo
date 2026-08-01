import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { __resolveHref } from './helpers/expoRouterStub';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const social = vi.hoisted(() => ({
  requests: vi.fn(),
  realtimeRevision: 0,
  ownProfile: { uid: 'member-1', alias: 'Athlete', categories: {}, categoryVisibility: {}, autoShareCompletedWorkouts: true },
  getWorkoutRecaps: vi.fn().mockResolvedValue({ recaps: [], nextCursor: null }),
  createWorkoutRecap: vi.fn(), deleteWorkoutRecap: vi.fn(), failedAutoRecapSessionIds: new Set<string>(), clearFailedAutoRecapSession: vi.fn(),
}));

vi.mock('@expo/vector-icons', async () => {
  const ReactModule = await import('react');
  return { Ionicons: ({ name }: { name: string }) => ReactModule.createElement('Ionicons', { name }) };
});
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: 'member-1', isLoading: false }) }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { primary: '#00f', accent: '#0ff', text: '#111', textMuted: '#666', glass: '#eee', glassBorder: '#ddd', blurTint: 'light', tabBarBackground: '#fff' } }) }));
vi.mock('../context/DataContext', () => ({ useData: () => ({ sessions: [], ensureRecapPublicationKey: vi.fn(), catalogMuscleGroups: [] }) }));
vi.mock('../context/ShopContext', () => ({ useShop: () => ({ gems: 0, purchasedThemeIds: [], equippedThemeId: null, previewThemeId: null, purchaseTheme: vi.fn(), equipTheme: vi.fn(), unequipTheme: vi.fn(), startPreview: vi.fn() }) }));
vi.mock('../context/SocialContext', () => ({ useSocial: () => social }));
vi.mock('../services/workoutRecapFeed', () => ({ recapInputFromSession: vi.fn() }));
vi.mock('../components/ThemePreviewBar', () => ({ ThemePreviewBar: () => null }));
vi.mock('../components/AppScreenHeader', async () => {
  const ReactModule = await import('react');
  return { AppScreenHeader: ({ trailing, ...props }: Record<string, any>) => ReactModule.createElement('AppScreenHeader', props, trailing) };
});
vi.mock('../components/LogoutButton', async () => {
  const ReactModule = await import('react');
  return { LogoutButton: () => ReactModule.createElement('LogoutButton') };
});
vi.mock('../components/CombineWithPartnerCard', () => ({ CombineWithPartnerCard: () => null }));
vi.mock('../constants/shopThemes', () => ({ GEM_REWARDS: { setComplete: 1, routineComplete: 1, weeklyGoalImprovement: 1 }, getShopTheme: vi.fn(), getThemesByCategory: vi.fn(() => []), isProfileThemeId: vi.fn(() => false), SHOP_CATEGORIES: [] }));

import TabsLayout from '../app/(tabs)/_layout';
import CommunityScreen from '../app/(tabs)/community';
import MoreScreen from '../app/(tabs)/more';

describe('navigation shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    social.requests.mockResolvedValue({ profiles: [], nextCursor: null });
  });

  test('exposes exactly five primary tabs and keeps legacy deep-link routes hidden', async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(TabsLayout)); });
    const screens = tree!.root.findAll((node) => String(node.type) === 'TabsScreen');
    const primary = screens.filter((node) => node.props.options?.href !== null);

    expect(primary.map((node) => node.props.name)).toEqual(['train', 'progress', 'community', 'profile', 'more']);
    expect(primary.map((node) => node.props.options.title)).toEqual(['Entrenar', 'Progreso', 'Comunidad', 'Perfil', 'Más']);
    expect(screens.filter((node) => node.props.options?.href === null).map((node) => node.props.name)).toEqual(expect.arrayContaining(['mesocycles/index', 'routines/index', 'exercises/index', 'social', 'shop']));
  });

  test('keeps routable Train child routes hidden from the bottom bar', async () => {
    expect(__resolveHref('/routines')).toBe('routines/index');
    expect(__resolveHref('/mesocycles')).toBe('mesocycles/index');
    expect(__resolveHref('/exercises')).toBe('exercises/index');

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(TabsLayout)); });
    const hiddenNames = tree!.root
      .findAll((node) => String(node.type) === 'TabsScreen' && node.props.options?.href === null)
      .map((node) => node.props.name);

    expect(hiddenNames).toEqual(expect.arrayContaining(['routines/index', 'mesocycles/index']));
  });

  test('uses an accurate bounded request badge when more pages exist', async () => {
    social.requests.mockResolvedValue({ profiles: Array.from({ length: 20 }, (_, index) => ({ uid: String(index), alias: String(index), categories: {} })), nextCursor: 'next-page' });
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(TabsLayout)); });
    const community = tree!.root.find((node) => String(node.type) === 'TabsScreen' && node.props.name === 'community');

    expect(community.props.options.tabBarBadge).toBe('20+');
    expect(community.props.options.tabBarAccessibilityLabel).toBe('Comunidad, 20+ solicitudes pendientes');
  });

  test('uses the recap feed as the Community tab default', async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(CommunityScreen)); });

    expect(tree!.root.find((node) => node.props.testID === 'community-feed')).toBeDefined();
  });

  test('keeps the shop, theme help, and logout surface under More', async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(MoreScreen)); });

    expect(tree!.root.find((node) => String(node.type) === 'AppScreenHeader').props).toMatchObject({ title: 'Más', subtitle: 'Tienda, temas y ayuda' });
    expect(tree!.root.findAll((node) => String(node.type) === 'LogoutButton')).toHaveLength(1);
  });
});
