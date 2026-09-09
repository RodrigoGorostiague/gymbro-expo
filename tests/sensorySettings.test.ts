import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, expect, test, vi } from 'vitest';
import { SensorySettings } from '../components/SensorySettings';
import { applySensoryPreferences, DEFAULT_SENSORY_PREFERENCES, getSensoryPreferences } from '../utils/sensoryPreferences';
const storage = vi.hoisted(() => ({ getItem: vi.fn(async () => null), setItem: vi.fn(async (_key: string, _value: string) => undefined) }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { primary: '#00EEAA', text: '#FFFFFF', textMuted: '#AAAAAA', glassBorder: '#333333' } }) }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { applySensoryPreferences(DEFAULT_SENSORY_PREFERENCES); storage.setItem.mockReset().mockResolvedValue(undefined); });

test('a sensory toggle persists before applying the new policy', async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(React.createElement(SensorySettings)); });
  const toggle = tree.root.find((node) => String(node.type) === 'Switch' && node.props.accessibilityLabel === 'Vibración al interactuar');
  await act(async () => { toggle.props.onValueChange(false); });
  expect(storage.setItem).toHaveBeenCalledWith('gymbro:sensory:v1', JSON.stringify({ motion: true, haptics: false, sound: true }));
  expect(getSensoryPreferences().haptics).toBe(false);
  act(() => tree.unmount());
});

test('failed persistence retains the prior sensory choice and offers an honest error', async () => {
  storage.setItem.mockRejectedValueOnce(new Error('Storage unavailable'));
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(React.createElement(SensorySettings)); });
  const toggle = tree.root.find((node) => String(node.type) === 'Switch' && node.props.accessibilityLabel === 'Animaciones decorativas');
  await act(async () => { toggle.props.onValueChange(false); });
  expect(getSensoryPreferences().motion).toBe(true);
  expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.accessibilityRole === 'alert')[0].children.join('')).toContain('No se guardó');
  act(() => tree.unmount());
});
