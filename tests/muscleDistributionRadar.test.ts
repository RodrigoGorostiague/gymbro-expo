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

describe('MuscleDistributionRadar', () => {
  test('renders a labeled accessible summary for the strongest training focus', async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => { tree = TestRenderer.create(React.createElement(MuscleDistributionRadar, { data: [{ id: 'chest', label: 'Pecho', value: 8 }, { id: 'back', label: 'Espalda', value: 3 }] })); });
    const chart = tree!.root.find((node) => String(node.type) === 'View' && node.props.accessibilityRole === 'image');
    expect(chart.props.accessibilityLabel).toContain('Pecho, 8 ejercicios');
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toEqual(expect.arrayContaining(['Pecho 8', 'Espalda 3']));
  });

  test('explains the empty ninety-day state', async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => { tree = TestRenderer.create(React.createElement(MuscleDistributionRadar, { data: [{ id: 'chest', label: 'Pecho', value: 0 }] })); });
    expect(tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toContain('Sin ejercicios completados en los últimos 90 días.');
  });
});
