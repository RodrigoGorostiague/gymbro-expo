import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { __resolveHref } from './helpers/expoRouterStub';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const social = vi.hoisted(() => ({
  requests: vi.fn(),
  realtimeRevision: 0,
  ownProfile: { uid: 'member-1', alias: 'Athlete', categories: {}, categoryVisibility: {}, autoShareCompletedWorkouts: true },
  getWorkoutRecaps: vi.fn().mockResolvedValue({ recaps: [], nextCursor: null }),
  getCommunityActivities: vi.fn().mockResolvedValue({ activities: [], nextCursor: null }),
  createWorkoutRecap: vi.fn(), deleteWorkoutRecap: vi.fn(), failedAutoRecapSessionIds: new Set<string>(), clearFailedAutoRecapSession: vi.fn(),
}));
const communityBadge = vi.hoisted(() => ({ get: vi.fn() }));

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
vi.mock('../services/communityBadge', () => ({ getCommunityBadgeCounts: communityBadge.get }));
vi.mock('../components/ThemePreviewBar', () => ({ ThemePreviewBar: () => null }));
vi.mock('../components/ProfileAvatar', () => ({ ProfileAvatar: () => null }));
vi.mock('../components/AppScreenHeader', async () => {
  const ReactModule = await import('react');
  return { AppScreenHeader: ({ trailing, ...props }: Record<string, any>) => ReactModule.createElement('AppScreenHeader', props, trailing) };
});
vi.mock('../components/LogoutButton', async () => {
  const ReactModule = await import('react');
  return { LogoutButton: () => ReactModule.createElement('LogoutButton') };
});
vi.mock('../components/CombineWithPartnerCard', () => ({ CombineWithPartnerCard: () => null }));
vi.mock('../constants/shopThemes', () => ({ GEM_REWARDS: { setComplete: 1, routineComplete: 1, weeklyGoalImprovement: 1 }, getShopTheme: vi.fn(), getThemesByRarity: vi.fn(() => []), isProfileThemeId: vi.fn(() => false), PROFILE_THEMES: [], SHOP_RARITIES: [] }));

import TabsLayout from '../app/(tabs)/_layout';
import CommunityScreen from '../app/(tabs)/community';
import MoreScreen from '../app/(tabs)/more';

const rootLayout = readFileSync(resolve(import.meta.dirname, '../app/_layout.tsx'), 'utf8');
const tabsLayout = readFileSync(resolve(import.meta.dirname, '../app/(tabs)/_layout.tsx'), 'utf8');

describe('navigation shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    social.requests.mockResolvedValue({ profiles: [], nextCursor: null });
    communityBadge.get.mockResolvedValue({ incomingRequests: 0, unreadNotifications: 0, jointInvitations: 0, planShareRequests: 0, total: 0 });
  });

  test('exposes exactly five primary tabs and keeps legacy deep-link routes hidden', async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(TabsLayout)); });
    const screens = tree!.root.findAll((node) => String(node.type) === 'TabsScreen');
    const primary = screens.filter((node) => node.props.options?.href !== null);

    expect(primary.map((node) => node.props.name)).toEqual(['progress', 'community', 'train', 'profile', 'more']);
    expect(primary.map((node) => node.props.options.title)).toEqual(['Progreso', 'Comunidad', 'Entrenar', 'Perfil', 'Más']);
    const train = primary.find((node) => node.props.name === 'train')!;
    expect(train.props.options.tabBarButton).toBeTypeOf('function');
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

  test('uses the server-owned aggregate badge for pending Community work', async () => {
    communityBadge.get.mockResolvedValue({ incomingRequests: 1, unreadNotifications: 2, jointInvitations: 1, planShareRequests: 3, total: 7 });
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(TabsLayout)); });
    const community = tree!.root.find((node) => String(node.type) === 'TabsScreen' && node.props.name === 'community');

    expect(community.props.options.tabBarBadge).toBe(7);
    expect(community.props.options.tabBarAccessibilityLabel).toBe('Comunidad, 7 pendientes');
  });

  test('keeps cancellation available from the active workout long-press menu', () => {
    expect(tabsLayout).toContain("text: 'Cancelar entrenamiento'");
    expect(tabsLayout).toContain('cancelActiveWorkout().catch');
  });

  test('renders active-workout progress from completed series around the central control', () => {
    expect(tabsLayout).toContain("import Svg, { Circle } from 'react-native-svg'");
    expect(tabsLayout).toContain('const completedSets = sets.filter');
    expect(tabsLayout).toContain('strokeDashoffset={ringCircumference * (1 - progress)}');
    expect(tabsLayout).toContain('`${completedSets}/${sets.length}`');
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

  test('presents the plan recipient picker as a full modal', () => {
    expect(rootLayout).toContain('name="community/share-plan" options={{ animation: \'slide_from_bottom\', presentation: \'modal\' }}');
    expect(rootLayout).not.toContain('presentation: \'formSheet\'');
  });
});
