import React from 'react';
import { describe, expect, test } from 'vitest';
import { render, resetRuntimeHarness } from './helpers/runtimeHarness';
import { WeeklyDensity } from '../components/progress/WeeklyDensity';
import { THEMES } from '../constants/theme';

describe('weekly density presentation', () => {
  test.each(['rodaja', 'brisas'])('uses %s theme and accessible neutral period labels', (profile) => {
    resetRuntimeHarness();
    const theme = THEMES[profile];
    const screen = render(React.createElement(WeeklyDensity, { current: 12.5, previous: 0, theme }));
    const hosts = screen.root.findAll((node) => typeof node.type === 'string');
    expect(hosts.some((node) => node.props.accessibilityLabel === 'Actual · en curso: 12,5 series efectivas por hora registrada')).toBe(true);
    expect(hosts.some((node) => node.props.accessibilityLabel === 'Anterior · completa: 0 series efectivas por hora registrada')).toBe(true);
    expect(hosts.some((node) => node.props.accessibilityRole === 'header' && node.children.includes('Densidad semanal'))).toBe(true);
    const value = hosts.find((node) => node.children.includes('12,5'))!;
    expect(value.props.style).toContainEqual({ color: theme.text });
    expect(hosts.some((node) => node.props.style?.some?.((style: any) => style.backgroundColor === theme.accent))).toBe(true);
    expect(hosts.every((node) => node.props.numberOfLines === undefined && node.props.allowFontScaling !== false)).toBe(true);
    expect(hosts.some((node) => node.props.style?.flexWrap === 'wrap')).toBe(true);
  });
  test('explains unavailable data without displaying zero or a positive/negative judgment', () => {
    resetRuntimeHarness();
    const screen = render(React.createElement(WeeklyDensity, { current: null, previous: null, theme: THEMES.rodaja }));
    const hosts = screen.root.findAll((node) => typeof node.type === 'string');
    expect(hosts.filter((node) => node.props.accessibilityLabel?.includes('densidad no disponible'))).toHaveLength(2);
    const text = hosts.flatMap((node) => node.children.filter((child) => typeof child === 'string')).join(' ');
    expect(text).toContain('Faltan registros completos con duración positiva');
    expect(text).toContain('incluidos los descansos registrados');
    expect(text).toContain('más no siempre es mejor');
    expect(text).not.toContain('series / hora');
  });
});
