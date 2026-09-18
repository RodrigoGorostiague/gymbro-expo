import React from 'react';
import { describe, expect, test } from 'vitest';
import { render, resetRuntimeHarness } from './helpers/runtimeHarness';
import { WeeklyEffort } from '../components/progress/WeeklyEffort';
import { THEMES } from '../constants/theme';

const empty = { eligibleSets: 0, rir: { count: 0, average: null }, rpe: { count: 0, average: null } };
describe('weekly effort presentation', () => {
  test.each(['rodaja', 'brisas'])('renders distinct averages and coverage with the %s theme', (profile) => {
    resetRuntimeHarness();
    const theme = THEMES[profile];
    const screen = render(React.createElement(WeeklyEffort, { theme, current: { eligibleSets: 5, rir: { count: 2, average: 0 }, rpe: { count: 1, average: 8.5 } }, previous: empty }));
    const hosts = screen.root.findAll((node) => typeof node.type === 'string');
    const labels = hosts.map((node) => node.props.accessibilityLabel);
    expect(labels).toContain('Actual · en curso: RIR 0. 2 de 5 series efectivas con RIR');
    expect(labels).toContain('Actual · en curso: RPE 8,5. 1 de 5 series efectivas con RPE');
    expect(labels).toContain('Anterior · completa: RIR Sin registros. 0 de 0 series efectivas con RIR');
    expect(hosts.some((node) => node.props.accessibilityRole === 'header' && node.children.includes('Esfuerzo registrado'))).toBe(true);
    expect(hosts.find((node) => node.children.includes('8,5'))!.props.style).toContainEqual({ color: theme.text });
    expect(hosts.every((node) => node.props.numberOfLines === undefined && node.props.allowFontScaling !== false)).toBe(true);
    expect(hosts.some((node) => node.props.style?.flexWrap === 'wrap')).toBe(true);
    screen.unmount();
  });
  test('shows missing data rather than zero and explains the sampling rules', () => {
    resetRuntimeHarness();
    const screen = render(React.createElement(WeeklyEffort, { theme: THEMES.rodaja, current: empty, previous: empty }));
    const hosts = screen.root.findAll((node) => typeof node.type === 'string');
    expect(hosts.filter((node) => node.props.accessibilityLabel?.includes('Sin registros'))).toHaveLength(4);
    const text = hosts.flatMap((node) => node.children.filter((child) => typeof child === 'string')).join(' ');
    expect(text).toContain('Las series sin registro no entran en el promedio');
    expect(text).toContain('Sin calentamientos ni objetivos planificados');
    screen.unmount();
  });
});
