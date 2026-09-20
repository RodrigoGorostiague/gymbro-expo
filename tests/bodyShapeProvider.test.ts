import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: 'user-a' as string | null, path: '/', get: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('expo-router', () => ({ usePathname: () => state.path }));
vi.mock('../services/onboarding', () => ({ getOwnOnboarding: state.get }));
import { BodyShapeProvider } from '../components/BodyShapeProvider';
import { useBodyShape } from '../context/BodyShapeContext';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let tree: Renderer.ReactTestRenderer;
function Probe() { return React.createElement('shape', { value: useBodyShape() }); }
const content = () => React.createElement(BodyShapeProvider, null, React.createElement(Probe));
const shape = () => tree.root.findByType('shape' as any).props.value;
beforeEach(() => { state.user = 'user-a'; state.path = '/'; state.get.mockReset(); });
afterEach(() => { if (tree) act(() => tree.unmount()); });
test('loads registration sex and refreshes when onboarding finishes', async () => {
  state.path = '/onboarding'; state.get.mockResolvedValue({ sex: null });
  await act(async () => { tree = Renderer.create(content()); });
  expect(shape()).toBe('a');
  state.path = '/'; state.get.mockResolvedValue({ sex: 'female' });
  await act(async () => { tree.update(content()); });
  expect(shape()).toBe('b');
});
test('ignores a previous account response and resets on sign out', async () => {
  let resolveOld!: (value: { sex: string }) => void;
  state.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  await act(async () => { tree = Renderer.create(content()); });
  state.user = 'user-b'; state.get.mockResolvedValue({ sex: 'male' });
  await act(async () => { tree.update(content()); });
  await act(async () => { resolveOld({ sex: 'female' }); });
  expect(shape()).toBe('a');
  state.user = null;
  await act(async () => { tree.update(content()); });
  expect(shape()).toBe('a');
  expect(state.get).toHaveBeenCalledTimes(2);
});
test('missing or unavailable private profile keeps a deterministic fallback', async () => {
  state.get.mockRejectedValue(new Error('Offline'));
  await act(async () => { tree = Renderer.create(content()); });
  expect(shape()).toBe('a');
});
