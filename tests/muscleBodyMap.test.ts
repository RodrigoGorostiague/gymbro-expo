import { BodyShapeContext, bodyShapeForSex } from '../context/BodyShapeContext';
import React from 'react';
import { beforeEach, describe, expect, test } from 'vitest';
import { render, press, resetRuntimeHarness, findTextsContaining, setMockData } from './helpers/runtimeHarness';
import { MuscleBodyMap } from '../components/MuscleBodyMap';
import { SharedBodyMap } from '../components/TrainingBodyMap';
import { projectSharedBody, projectRecapBody } from '../utils/bodyMapProjection';

beforeEach(resetRuntimeHarness);
const projection = () => projectSharedBody([{ id: 'GM-101', value: 3 }, { id: 'GM-146', value: 1 }]);
describe('MuscleBodyMap', () => {
  test('both views share a scale; region names are accessible and selection works without SVG hit targets', () => {
    const tree = render(React.createElement(MuscleBodyMap, { projection: projection() }));
    expect(tree.root.findAllByType('Svg' as any)).toHaveLength(2);
    const region = tree.root.findAll((node) => node.props.accessibilityLabel === 'Pecho: 3 Ejercicios del resumen')[0];
    press(region);
    expect(findTextsContaining(tree.root, 'Grupos: Pectoral mayor')).toHaveLength(1);
    press(tree.root.findAll((node) => node.props.accessibilityLabel === 'Espalda')[0]);
    expect(tree.root.findAllByType('Svg' as any)).toHaveLength(1);
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'Silueta B')).toHaveLength(0);
  });
  test('effort view labels unavailable records rather than displaying zero', () => {
    const data = projectRecapBody([{ name: 'Press', muscleGroupIds: ['GM-101'], sets: [{ completed: true, reps: 8, weight: 20 }] }]);
    const tree = render(React.createElement(MuscleBodyMap, { projection: data }));
    press(tree.root.findAll((node) => node.props.accessibilityLabel === 'RIR')[0]);
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'Pecho: Sin registro RIR medio registrado').length).toBeGreaterThan(0);
  });
  test('compact public map expands without private data access or navigation', () => {
    setMockData({ attempts: new Proxy([], { get() { throw new Error('Private attempts must not be read'); } }) });
    const tree = render(React.createElement(SharedBodyMap, { distribution: [{ id: 'GM-101', value: 2 }] }));
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'Silueta B')).toHaveLength(0);
    press(tree.root.findAll((node) => node.props.accessibilityLabel === 'Explorar mapa muscular')[0]);
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'Silueta B')).toHaveLength(0);
    expect(findTextsContaining(tree.root, 'no equivale a series ni a esfuerzo')).toHaveLength(1);
  });
});

import { MuscleRegionGlyph } from '../components/MuscleRegionGlyph';
import { bodyAppearance, bodyGeometry } from '../components/MuscleBodyMap';
const palette = { primary: '#ba44aa', secondary: '#12abcd', text: '#fff', textMuted: '#aaa', glass: '#111', glassBorder: '#333' };
test('isolated bilateral pectorals retain the map theme and intensity in both silhouettes', () => {
  for (const shape of ['a','b'] as const) {
    const data = projection();
    const tree = render(React.createElement(MuscleRegionGlyph, { axisId:'chest', projection:data, max:5, palette, shape }));
    const paths = tree.root.findAllByType('Path' as any);
    expect(paths.map(p=>p.props.d)).toEqual(Object.values(bodyGeometry[shape].front.find(p=>p.slug==='chest')!.path).flat());
    expect(paths).toHaveLength(2);
    const appearance = bodyAppearance(data.entries.find(e=>e.id==='chest'),data,'volume',5,palette);
    expect(paths.every(p=>p.props.fill===palette.primary && p.props.fillOpacity===appearance.opacity)).toBe(true);
    const box=tree.root.findByType('Svg' as any).props.viewBox.split(' ').map(Number);
    expect(box[3]).toBeLessThan(300);
  }
});
test('higher volume changes opacity without replacing the selected theme color', () => {
  const data = projection(); const entry = data.entries.find(e=>e.id==='chest')!;
  const low = bodyAppearance({...entry,value:1},data,'volume',5,palette);
  const high = bodyAppearance({...entry,value:5},data,'volume',5,palette);
  expect(low.fill).toBe(palette.primary); expect(high.fill).toBe(palette.primary); expect(high.opacity).toBeGreaterThan(low.opacity);
});


test('onboarding sex selects both body views automatically without manual controls', () => {
  for (const sex of ['male', 'female', null] as const) {
    const tree = render(React.createElement(BodyShapeContext.Provider, { value: bodyShapeForSex(sex) }, React.createElement(MuscleBodyMap, { projection: projection() })));
    expect(tree.root.findAllByType('Svg' as any).map(node => node.props.viewBox)).toEqual(sex === 'female' ? ['-50 -40 734 1538', '756 0 774 1448'] : ['0 80 724 1310', '724 80 724 1310']);
    expect(tree.root.findAll(node => ['Silueta A', 'Silueta B'].includes(node.props.accessibilityLabel))).toHaveLength(0);
  }
});
