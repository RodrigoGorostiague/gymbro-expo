import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { primary: '#00f', accent: '#0ff', text: '#111', textMuted: '#666', glassBorder: '#ccc' } }) }));
vi.mock('@shopify/react-native-skia', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => ReactModule.createElement(name, props, children);
  const builder = () => {
    const value: any = { build: vi.fn(() => ({})) };
    value.moveTo = vi.fn(() => value);
    value.lineTo = vi.fn(() => value);
    value.close = vi.fn(() => value);
    return value;
  };
  return { BlurMask: host('BlurMask'), Canvas: host('Canvas'), Circle: host('Circle'), Group: host('Group'), LinearGradient: host('LinearGradient'), Path: host('Path'), Skia: { PathBuilder: { Make: builder } }, vec: (x: number, y: number) => ({ x, y }) };
});

import { MuscleDistributionRadar } from '../components/MuscleDistributionRadar';
import { MuscleDistributionRadarCanvas as NativeRadarCanvas } from '../components/MuscleDistributionRadarCanvas.native';

describe('MuscleDistributionRadar', () => {
  test('renders a labeled accessible summary for the strongest training focus', async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => { tree = TestRenderer.create(React.createElement(MuscleDistributionRadar, { data: [{ id: 'chest', label: 'Pecho', value: 8 }, { id: 'back', label: 'Espalda', value: 3 }] })); });
    const chart = tree!.root.find((node) => String(node.type) === 'View' && node.props.accessibilityRole === 'summary');
    expect(chart.props.accessibilityLabel).toContain('Pecho, 8.00 puntos');
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toEqual(expect.arrayContaining(['Pecho 8.0', 'Espalda 3.0']));
  });

  test('retains native Skia rings, reference, gradient and focus glow', async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    const shape = [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }];
    await act(async () => { tree = TestRenderer.create(React.createElement(NativeRadarCanvas, {
      size: 260, center: 130, radius: 82, shape, axes: shape, rings: [shape, shape, shape, shape], reference: shape, focusedIndex: 1,
      theme: { primary: '#00f', accent: '#0ff', textMuted: '#666', glassBorder: '#ccc' },
    })); });
    expect(tree.root.findAll((node) => String(node.type) === 'Canvas')).toHaveLength(1);
    expect(tree.root.findAll((node) => String(node.type) === 'Path')).toHaveLength(10);
    expect(tree.root.find((node) => String(node.type) === 'LinearGradient').props.colors).toEqual(['#0ff', '#00f']);
    expect(tree.root.findAll((node) => String(node.type) === 'Circle' && node.props.r === 4.5)).toHaveLength(1);
    expect(tree.root.findAll((node) => String(node.type) === 'BlurMask' && node.props.blur === 7)).toHaveLength(1);
    act(() => tree.unmount());
  });

  test('explains the empty ninety-day state', async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => { tree = TestRenderer.create(React.createElement(MuscleDistributionRadar, { data: [{ id: 'chest', label: 'Pecho', value: 0 }] })); });
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toContain('Sin ejercicios completados en los últimos 90 días.');
  });
});
