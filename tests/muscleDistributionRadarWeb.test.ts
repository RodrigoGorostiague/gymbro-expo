import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { primary: '#00f', accent: '#0ff', text: '#111', textMuted: '#666', glassBorder: '#ccc' } }) }));
vi.mock('@shopify/react-native-skia', () => { throw new Error('The web radar must not import Skia without CanvasKit'); });

import { MuscleDistributionRadar } from '../components/MuscleDistributionRadar';

const data = [{ id: 'chest', label: 'Pecho', value: 8 }, { id: 'back', label: 'Espalda', value: 3 }, { id: 'legs', label: 'Piernas', value: 5 }];

describe('radar without CanvasKit (web renderer)', () => {
  test('renders the empty state without constructing a Skia path', async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(MuscleDistributionRadar, { data: [] })); });
    expect(tree.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toContain('Sin ejercicios completados en los últimos 90 días.');
    act(() => tree.unmount());
  });
  test('renders data, reference and accessible interaction without a WASM runtime', async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(MuscleDistributionRadar, { data, reference: data.map((entry) => ({ ...entry, value: 1 })) })); });
    expect(tree.root.findAll((node) => String(node.type) === 'Svg')).toHaveLength(1);
    expect(tree.root.findAll((node) => String(node.type) === 'Polygon')).toHaveLength(7);
    const label = tree.root.find((node) => String(node.type) === 'Pressable' && String(node.props.accessibilityLabel).startsWith('Pecho:'));
    act(() => label.props.onPress());
    expect(tree.root.find((node) => String(node.type) === 'Text' && node.props.accessibilityLiveRegion === 'polite').children.join('')).toContain('Pecho: 8.00 puntos de estímulo');
    const chart = tree.root.find((node) => String(node.type) === 'View' && node.props.accessibilityRole === 'summary');
    act(() => chart.props.onLayout({ nativeEvent: { layout: { width: 180 } } }));
    expect(tree.root.find((node) => String(node.type) === 'Svg').props.viewBox).toBe('0 0 260 260');
    act(() => tree.unmount());
  });
});
