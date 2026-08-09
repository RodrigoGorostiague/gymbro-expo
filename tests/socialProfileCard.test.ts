import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { glass: '#fff', glassBorder: '#ccc', primary: '#00f', onPrimary: '#fff', text: '#111', textMuted: '#666' } }) }));
vi.mock('../components/HapticPressable', async () => {
  const ReactModule = await import('react');
  return { HapticPressable: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => ReactModule.createElement('HapticPressable', props, children) };
});
vi.mock('../components/ProfileAvatar', () => ({ ProfileAvatar: () => null }));

import { SocialProfileCard } from '../components/SocialProfileCard';

describe('SocialProfileCard', () => {
  test('makes the complete card an accessible detail action and preserves the relationship badge', async () => {
    const onPress = vi.fn();
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => { tree = TestRenderer.create(React.createElement(SocialProfileCard, { profile: { uid: 'member-2', alias: 'Alex', avatarId: 'capigirl', frameId: 'principiante', titleId: 'principiante', categories: { trainingStyle: 'Fuerza' }, presentationThemeId: null, relationshipStatus: 'partner' }, onPress })); });
    const card = tree!.root.find((node) => String(node.type) === 'HapticPressable');
    expect(card.props.accessibilityLabel).toBe('Ver perfil de Alex');
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toEqual(expect.arrayContaining(['Alex', 'Partner', 'Forjando Base']));
    await act(async () => { card.props.onPress(); });
    expect(onPress).toHaveBeenCalledOnce();
  });

  test('uses the connected athlete presentation theme with rank and a mini radar', async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => { tree = TestRenderer.create(React.createElement(SocialProfileCard, { profile: { uid: 'member-2', alias: 'Moon athlete', avatarId: 'capigirl', frameId: 'avanzado', titleId: 'avanzado', categories: {}, presentationThemeId: 'moon', relationshipStatus: 'bro' }, insights: { progress: { level: 12, rank: 'Avanzado' }, muscleDistribution: [{ id: 'chest', label: 'Pecho', value: 3 }] }, onPress: vi.fn() })); });
    expect(tree!.root.find((node) => String(node.type) === 'LinearGradient').props.colors).toEqual(['#9FA8DA', '#C5CAE9', '#5C6BC0']);
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toContain('Nivel 12 · Avanzado');
    expect(tree!.root.find((node) => String(node.type) === 'View' && node.props.accessibilityLabel === 'Distribución muscular resumida')).toBeDefined();
  });
});
