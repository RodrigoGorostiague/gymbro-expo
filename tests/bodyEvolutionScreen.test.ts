import React from 'react';
import { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changeText, findButton, findInputs, findText, mockAlert, press, render, resetRuntimeHarness } from './helpers/runtimeHarness';
import { localDay } from '../utils/bodyEvolution';
const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), photos: vi.fn(), deleteMetrics: vi.fn(), deletePhotos: vi.fn() }));
vi.mock('../services/bodyEvolution', () => ({ loadBodyEvolution: api.load, saveBodyDay: api.save, deleteBodyMeasurements: api.deleteMetrics }));
vi.mock('../services/bodyPhotos', () => ({ loadBodyPhotos: api.photos, removeBodyPhotos: api.deletePhotos }));
vi.mock('../components/body/BodyCamera', () => ({ BodyCamera: () => null }));
vi.mock('../components/body/PhotoComparison', () => ({ PhotoComparison: () => null }));
vi.mock('../components/body/PoseGuide', () => ({ PoseGuide: () => null }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon', FontAwesome5: 'Icon' }));
import BodyEvolutionScreen from '../app/body';
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const pressText = (root: any, label: string) => {
  const node = root.findAll((n: any) => n.type === 'Pressable' && n.findAll((x: any) => x.type === 'Text' && x.children.join('') === label).length)[0];
  expect(node).toBeDefined(); press(node);
};
beforeEach(() => {
  resetRuntimeHarness(); vi.clearAllMocks();
  api.load.mockResolvedValue([]); api.photos.mockResolvedValue([]); api.save.mockResolvedValue(undefined); api.deleteMetrics.mockResolvedValue(undefined); api.deletePhotos.mockResolvedValue(undefined);
});
describe('body evolution experience', () => {
  it('starts with optional weight and progressively reveals measurements', async () => {
    const view = render(React.createElement(BodyEvolutionScreen)); await flush();
    expect(findText(view.root, 'Evolución corporal')).toBeDefined();
    expect(findInputs(view.root, () => true)).toHaveLength(1);
    pressText(view.root, 'Agregar o actualizar medidas');
    expect(findInputs(view.root, () => true)).toHaveLength(12);
    expect(findButton(view.root, 'Guardar medidas de hoy').props.disabled).toBe(true);
  });
  it('saves only the supplied weight without inventing other measurements', async () => {
    const view = render(React.createElement(BodyEvolutionScreen)); await flush();
    changeText(findInputs(view.root, () => true)[0], '72,5');
    press(findButton(view.root, 'Guardar medidas de hoy')); await flush();
    expect(api.save).toHaveBeenCalledWith(localDay(), [{ metricType: 'body_weight', value: 72.5 }]);
    expect(findInputs(view.root, () => true)[0].props.value).toBe('');
  });
  it('retains unsaved values and explains failed saves', async () => {
    api.save.mockRejectedValue(new Error('Sin conexión'));
    const view = render(React.createElement(BodyEvolutionScreen)); await flush();
    changeText(findInputs(view.root, () => true)[0], '72');
    press(findButton(view.root, 'Guardar medidas de hoy')); await flush();
    expect(findInputs(view.root, () => true)[0].props.value).toBe('72');
    expect(findText(view.root, 'Sin conexión')).toBeDefined();
  });
  it('requires confirmation for deleting historical records', async () => {
    api.load.mockResolvedValue([{ id: 'm1', metricType: 'body_weight', value: 70, unit: 'kg', measuredAt: '2026-01-01T12:00:00Z' }]);
    const view = render(React.createElement(BodyEvolutionScreen)); await flush();
    pressText(view.root, 'Historial'); pressText(view.root, 'Eliminar registro');
    expect(api.deleteMetrics).not.toHaveBeenCalled();
    const [, message, actions] = mockAlert.alert.mock.calls.at(-1)!;
    expect(message).toContain('galería permanecerán');
    await act(async () => { actions[1].onPress(); await Promise.resolve(); await Promise.resolve(); });
    expect(api.deleteMetrics).toHaveBeenCalledWith(['m1']);
  });
});
