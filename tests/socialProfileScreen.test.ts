import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const social = vi.hoisted(() => ({
  getProfile: vi.fn().mockResolvedValue({ uid: 'member-2', alias: 'Alex', categories: {}, presentationThemeId: null }),
  getSummary: vi.fn(),
  getProfileInsights: vi.fn().mockResolvedValue({}),
  getProfilePlanLibrary: vi.fn().mockResolvedValue({ routines: [], mesocycles: [] }),
  command: vi.fn().mockResolvedValue({ targetId: 'member-2' }),
  realtimeRevision: 0,
}));
const alert = vi.hoisted(() => vi.fn());

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => ReactModule.createElement(name, props, children);
  return { Alert: { alert }, ScrollView: host('ScrollView'), StyleSheet: { create: <T,>(styles: T) => styles }, Text: host('Text'), View: host('View') };
});
vi.mock('expo-router', () => ({ router: { back: vi.fn() }, useFocusEffect: (callback: () => void) => { React.useEffect(callback, [callback]); }, useLocalSearchParams: () => ({ uid: 'member-2' }) }));
vi.mock('react-native-safe-area-context', async () => {
  const ReactModule = await import('react');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement('SafeAreaView', null, children) };
});
vi.mock('../context/SocialContext', () => ({ useSocial: () => social }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { text: '#111', textMuted: '#666', success: '#0a0' } }) }));
vi.mock('../components/AppNavBar', () => ({ AppNavBar: () => null }));
vi.mock('../components/ProfileAvatar', () => ({ ProfileAvatar: () => null }));
vi.mock('../components/ExperienceProgressCard', () => ({ ExperienceProgressCard: () => null }));
vi.mock('../components/MuscleDistributionRadar', () => ({ MuscleDistributionRadar: () => null }));
vi.mock('../components/GlassCard', async () => {
  const ReactModule = await import('react');
  return { GlassCard: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => ReactModule.createElement('GlassCard', props, children), ThemeBackground: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => ReactModule.createElement('ThemeBackground', props, children) };
});
vi.mock('../components/UI', async () => {
  const ReactModule = await import('react');
  return { GlassButton: (props: Record<string, unknown>) => ReactModule.createElement('GlassButton', props) };
});

import PublicProfileScreen from '../app/social/[uid]';

const buttons = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((node) => String(node.type) === 'GlassButton');

describe('relationship transition actions', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test('renders a view-shaped skeleton while the profile is loading', async () => {
    social.getProfile.mockImplementationOnce(() => new Promise(() => undefined));
    social.getSummary.mockImplementationOnce(() => new Promise(() => undefined));
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(PublicProfileScreen)); });

    expect(tree!.root.find((node) => node.props.accessibilityLabel === 'Cargando perfil')).toBeTruthy();
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).not.toContain('Cargando perfil...');
  });

  test('requires an explicit kind for new invitations', async () => {
    social.getSummary.mockResolvedValue({ targetId: 'member-2' });
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(PublicProfileScreen)); });
    expect(buttons(tree!).map((button) => button.props.title)).toEqual(expect.arrayContaining(['Invitar como Bro', 'Invitar como Partner']));
    await act(async () => { buttons(tree!).find((button) => button.props.title === 'Invitar como Partner')!.props.onPress(); });
    expect(social.command).toHaveBeenCalledWith({ command: 'sendRequest', targetId: 'member-2', relationshipKind: 'partner' });
  });

  test('shows and accepts the persisted incoming request kind without client override', async () => {
    social.getSummary.mockResolvedValue({ targetId: 'member-2', incomingRequest: true, requestKind: 'partner' });
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(PublicProfileScreen)); });
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toContain('Solicitud para ser Partner');
    await act(async () => { buttons(tree!).find((button) => button.props.title === 'Aceptar solicitud de Partner')!.props.onPress(); });
    expect(social.command).toHaveBeenCalledWith({ command: 'respondRequest', targetId: 'member-2', accepted: true });
  });

  test('offers Bro upgrade and confirmed Partner downgrade actions', async () => {
    social.getSummary.mockResolvedValueOnce({ targetId: 'member-2', relationshipKind: 'bro' }).mockResolvedValueOnce({ targetId: 'member-2', relationshipKind: 'partner' });
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(PublicProfileScreen)); });
    await act(async () => { buttons(tree!).find((button) => button.props.title === 'Solicitar upgrade a Partner')!.props.onPress(); });
    expect(social.command).toHaveBeenCalledWith({ command: 'sendRequest', targetId: 'member-2', relationshipKind: 'partner' });

    await act(async () => { tree!.unmount(); });
    await act(async () => { tree = TestRenderer.create(React.createElement(PublicProfileScreen)); });
    await act(async () => { buttons(tree!).find((button) => button.props.title === 'Bajar a Bro')!.props.onPress(); });
    expect(alert).toHaveBeenCalledWith('Bajar a Bro', expect.any(String), expect.any(Array));
    const confirmation = alert.mock.calls[0][2][1];
    await act(async () => { confirmation.onPress(); });
    expect(social.command).toHaveBeenLastCalledWith({ command: 'downgradePartner', targetId: 'member-2' });
  });

  test('shows the safe Partner transition failure returned by the graph boundary', async () => {
    social.getSummary.mockResolvedValue({ targetId: 'member-2', relationshipKind: 'bro' });
    social.command.mockRejectedValue(new Error('Esta transición de relación no está disponible.'));
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => { tree = TestRenderer.create(React.createElement(PublicProfileScreen)); });
    await act(async () => { buttons(tree!).find((button) => button.props.title === 'Solicitar upgrade a Partner')!.props.onPress(); });

    expect(alert).toHaveBeenCalledWith('Acción no disponible', 'Esta transición de relación no está disponible.');
  });

  test('shows shared planning only for an accepted connection', async () => {
    social.getSummary.mockResolvedValue({ targetId: 'member-2', relationshipKind: 'bro' });
    social.getProfilePlanLibrary.mockResolvedValue({
      routines: [{ id: 'routine-1', name: 'Upper', exercises: [], muscleGroups: [], createdAt: '2026-08-02T00:00:00.000Z' }],
      mesocycles: [{ id: 'mesocycle-1', name: 'Strength block', goal: 'Strength', durationWeeks: 4, weeks: [], status: 'draft', createdAt: '2026-08-02T00:00:00.000Z' }],
    });
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(PublicProfileScreen)); });

    expect(social.getProfilePlanLibrary).toHaveBeenCalledWith('member-2');
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toEqual(expect.arrayContaining(['Planificación', 'Upper', 'Strength block']));
  });

  test('renders only the safe social insight aggregates for an accepted connection', async () => {
    social.getSummary.mockResolvedValue({ targetId: 'member-2', relationshipKind: 'bro' });
    social.getProfileInsights.mockResolvedValue({ muscleDistribution: [{ id: 'GM-001', label: 'Pecho', value: 5 }], statistics: { workoutsLast90Days: 4, completedExercisesLast90Days: 10 } });
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(PublicProfileScreen)); });
    expect(social.getProfileInsights).toHaveBeenCalledWith('member-2');
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toEqual(expect.arrayContaining(['Distribución muscular', '4', '10']));
  });

  test('applies a connected athlete presentation theme to the complete detail surface', async () => {
    social.getProfile.mockResolvedValue({ uid: 'member-2', alias: 'Alex', categories: { trainingStyle: 'Fuerza' }, presentationThemeId: 'sakura' });
    social.getSummary.mockResolvedValue({ targetId: 'member-2', relationshipKind: 'bro' });
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(PublicProfileScreen)); });

    expect(tree!.root.find((node) => String(node.type) === 'ThemeBackground').props.theme.id).toBe('sakura');
    expect(tree!.root.findAll((node) => String(node.type) === 'GlassCard')).toEqual(expect.arrayContaining([
      expect.objectContaining({ props: expect.objectContaining({ theme: expect.objectContaining({ id: 'sakura' }) }) }),
    ]));
    expect(buttons(tree!).find((button) => button.props.title === 'Solicitar upgrade a Partner')!.props.theme.id).toBe('sakura');
  });

  test('stretches the hero profile card to the container width', async () => {
    social.getSummary.mockResolvedValue({ targetId: 'member-2' });
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(PublicProfileScreen)); });

    expect(tree!.root.findAll((node) => String(node.type) === 'GlassCard')[0].props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ alignSelf: 'stretch' })]),
    );
  });
});
