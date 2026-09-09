import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { expect, test, vi } from 'vitest';
import { ThemeFamilyDiscovery } from '../components/ThemeFamilyDiscovery';
import { ProceduralAtmosphere } from '../components/ProceduralAtmosphere';
import { THEME_FAMILIES } from '../constants/themeFamilies';
import { ATMOSPHERES } from '../hooks/useLocalAtmosphere';
import { withRepeat } from 'react-native-reanimated';
const policy = vi.hoisted(() => ({ active: true }));
vi.mock('../hooks/useAnimationActivity', () => ({ useAnimationActivity: (enabled = true) => enabled && policy.active }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { text: '#FFF', textMuted: '#AAA', primary: '#0FA', glassBorder: '#333', glass: '#222' } }) }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test('eight discovery tiles expose one focused variant while preserving equipped legacy identity', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(React.createElement(ThemeFamilyDiscovery, { equippedId: 'frame-fuerza-gorila', renderTheme: (theme) => React.createElement('FocusedTheme', { id: theme.id }) })); });
  expect(tree.root.findByType('FocusedTheme' as React.ElementType).props.id).toBe('frame-fuerza-gorila');
  const families = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel?.startsWith('Familia '));
  expect(families).toHaveLength(8);
  act(() => families.find((node) => node.props.accessibilityLabel === 'Familia Órbita')!.props.onPress());
  expect(tree.root.findByType('FocusedTheme' as React.ElementType).props.id).toBe('eclipse');
  expect(tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'radio')).toHaveLength(THEME_FAMILIES.find((family) => family.id === 'orbit')!.variants.length);
  act(() => tree.unmount());
});
test('four deterministic scenes retain static artwork with disabled motion and start only active animation', () => {
  vi.mocked(withRepeat).mockClear();
  const snapshots = new Set<string>();
  for (const scene of ATMOSPHERES) {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(React.createElement(ProceduralAtmosphere, { id: scene.id, animate: false })); });
    snapshots.add(JSON.stringify(tree.toJSON()));
    act(() => tree.unmount());
  }
  expect(snapshots.size).toBe(4);
  expect(withRepeat).not.toHaveBeenCalled();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(React.createElement(ProceduralAtmosphere, { id: 'local-orbit' })); });
  expect(withRepeat).toHaveBeenCalledOnce();
  policy.active = false;
  act(() => tree.update(React.createElement(ProceduralAtmosphere, { id: 'local-orbit' })));
  expect(withRepeat).toHaveBeenCalledOnce();
  expect(tree.toJSON()).not.toBeNull();
  act(() => tree.unmount());
  policy.active = true;
});
