import React from 'react';
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
nodeRequire.extensions['.wav'] = (module) => { module.exports = 1; };
import { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { press, render, resetRuntimeHarness } from './helpers/runtimeHarness';
import { __emitAppState } from './helpers/reactNativeStub';
const state = vi.hoisted(() => ({ capture: vi.fn(), store: vi.fn(), gallery: vi.fn(), permission: { granted: true, canAskAgain: true } }));
vi.mock('expo-camera', async () => {
  const R = await import('react');
  return { useCameraPermissions: () => [state.permission, vi.fn()], CameraView: R.forwardRef((props: any, ref: any) => {
    R.useImperativeHandle(ref, () => ({ takePictureAsync: state.capture }));
    return R.createElement('CameraView', props);
  }) };
});
vi.mock('expo-audio', () => ({ useAudioPlayer: () => ({ seekTo: async () => {}, play: vi.fn() }) }));
vi.mock('expo-file-system/legacy', () => ({ deleteAsync: vi.fn(async () => {}) }));
vi.mock('../services/bodyPhotos', () => ({ storeBodyPhoto: state.store, copyBodyPhotoToGallery: state.gallery }));
vi.mock('../components/body/PoseGuide', () => ({ PoseGuide: () => null }));
import { BodyCamera } from '../components/body/BodyCamera';
function tap(root: any, label: string) {
  press(root.findAll((node: any) => node.type === 'Pressable' && node.findAll((n: any) => n.type === 'Text' && n.children.join('') === label).length)[0]);
}
async function start() {
  const onSaved = vi.fn();
  const view = render(React.createElement(BodyCamera, { owner: 'alice', pose: 'back', onClose: vi.fn(), onSaved }));
  tap(view.root, 'Abrir cámara');
  act(() => view.root.findByType('CameraView' as any).props.onCameraReady());
  tap(view.root, 'Tomar foto · 10 s');
  return { view, onSaved };
}
beforeEach(() => {
  resetRuntimeHarness(); vi.clearAllMocks(); vi.useFakeTimers();
  state.permission.granted = true;
  state.capture.mockResolvedValue({ uri: 'file://capture.jpg' });
  state.store.mockResolvedValue({ uri: 'file://saved.jpg' });
  state.gallery.mockResolvedValue(false);
});
afterEach(() => { resetRuntimeHarness(); vi.useRealTimers(); });
describe('hands-free body capture', () => {
  it('waits for countdown then requires confirmation before saving', async () => {
    const { view, onSaved } = await start();
    expect(state.capture).not.toHaveBeenCalled();
    for (let i = 0; i < 10; i++) await act(async () => { vi.advanceTimersByTime(1000); });
    expect(state.capture).toHaveBeenCalledTimes(1);
    expect(state.store).not.toHaveBeenCalled();
    tap(view.root, 'Confirmar foto');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(state.store).toHaveBeenCalledWith('alice', expect.objectContaining({ pose: 'back', uri: 'file://capture.jpg' }));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
  it('cancels countdown when app enters background', async () => {
    await start();
    act(() => __emitAppState('background'));
    await act(async () => { vi.advanceTimersByTime(15000); });
    expect(state.capture).not.toHaveBeenCalled();
  });
  it('cancels the timer when the user closes the camera', async () => {
    const { view } = await start();
    act(() => view.unmount());
    await act(async () => { vi.advanceTimersByTime(15000); });
    expect(state.capture).not.toHaveBeenCalled();
  });
});
