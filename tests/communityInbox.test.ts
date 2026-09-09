import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { router as mockRouter } from './helpers/expoRouterStub';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const trees: TestRenderer.ReactTestRenderer[] = [];
function render(element: React.ReactElement) { let tree!: TestRenderer.ReactTestRenderer; act(() => { tree = TestRenderer.create(element); }); trees.push(tree); return tree; }
const findButton = (root: TestRenderer.ReactTestInstance, title: string) => root.find((node) => String(node.type) === 'GlassButton' && node.props.title === title);
const findText = (root: TestRenderer.ReactTestInstance, title: string) => root.findAll((node) => String(node.type) === 'Text' && node.children.join('') === title)[0];
const press = (node: TestRenderer.ReactTestInstance) => act(() => node.props.onPress());
afterEach(() => { act(() => trees.splice(0).forEach((tree) => tree.unmount())); });
const account = vi.hoisted(() => ({ user: 'owner' }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => account }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { primary: '#00A', text: '#FFF', textMuted: '#AAA' } }) }));
vi.mock('../components/GlassCard', () => ({ ThemeBackground: ({ children }: any) => React.createElement('View', null, children), GlassCard: ({ children }: any) => React.createElement('View', null, children) }));
vi.mock('../components/UI', () => ({ GlassButton: (props: any) => React.createElement('GlassButton', props) }));
vi.mock('../components/AppNavBar', () => ({ AppNavBar: () => null }));
vi.mock('../components/AppScreenHeader', () => ({ AppScreenHeader: () => null }));
const sources = vi.hoisted(() => ({
  requests: vi.fn(), plans: vi.fn(), joint: vi.fn(), notifications: vi.fn(),
}));
vi.mock('../context/SocialContext', () => ({ useSocial: () => ({ requests: sources.requests, listReceivedPrivatePlanShareRequests: sources.plans, realtimeRevision: 0 }) }));
vi.mock('../services/jointWorkouts', () => ({ listJointWorkouts: sources.joint }));
vi.mock('../services/notificationInbox', () => ({ listNotificationInbox: sources.notifications }));
import CommunityInboxScreen from '../app/community/inbox';

beforeEach(() => {
  vi.clearAllMocks();
  account.user = 'owner';
  sources.requests.mockReset().mockResolvedValue({ profiles: [], nextCursor: null });
  sources.plans.mockReset().mockResolvedValue([]);
  sources.joint.mockReset().mockResolvedValue([]);
  sources.notifications.mockReset().mockResolvedValue([]);
});

test('loads typed pending work with honest counts and routes to existing review flows', async () => {
  sources.requests.mockResolvedValue({ profiles: [{ uid: 'alice', alias: 'Alice' }], nextCursor: 'next' });
  sources.plans.mockResolvedValue([{ id: 'p', senderAlias: 'Coach', contentKind: 'routine', snapshot: { routines: [{ name: 'Upper' }] } }]);
  sources.joint.mockResolvedValue([{ id: 'j', participants: [{ isSelf: true, status: 'invited' }, { alias: 'Bro' }] }, { id: 'active', participants: [{ isSelf: true, status: 'active' }] }]);
  sources.notifications.mockResolvedValue([{ id: 'n', title: 'New achievement', body: 'Milestone', readAt: null }, { id: 'old', title: 'Already read', readAt: 'now' }]);
  let tree!: ReturnType<typeof render>;
  await act(async () => { tree = render(React.createElement(CommunityInboxScreen)); });
  expect(findText(tree.root, 'Solicitudes de conexión · 1+')).toBeTruthy();
  expect(findText(tree.root, 'Planes compartidos · 1')).toBeTruthy();
  expect(findText(tree.root, 'Entrenamientos juntos · 1')).toBeTruthy();
  expect(findText(tree.root, 'Notificaciones · 1')).toBeTruthy();
  press(findButton(tree.root, 'Revisar: Alice'));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/social/alice');
  press(findButton(tree.root, 'Revisar: Upper'));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/community/plan-inbox');
  press(findButton(tree.root, 'Revisar: Bro'));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/community/joint-workout');
  press(findButton(tree.root, 'Revisar: New achievement'));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/community/notifications');
});

test('distinguishes loading, partial failure and empty results, retaining successful pending data on retry', async () => {
  let resolve!: (value: any) => void;
  sources.requests.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  sources.plans.mockRejectedValueOnce(new Error('Plans offline'));
  const tree = render(React.createElement(CommunityInboxScreen));
  expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.children.join('') === 'Cargando pendientes…').length).toBeGreaterThan(0);
  await act(async () => { resolve({ profiles: [{ uid: 'alice', alias: 'Alice' }], nextCursor: null }); });
  expect(findText(tree.root, 'Plans offline')).toBeTruthy();
  expect(findButton(tree.root, 'Revisar: Alice')).toBeTruthy();
  expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.children.join('') === 'No hay pendientes en esta sección.')).toHaveLength(2);
  sources.requests.mockRejectedValueOnce(new Error('Connections offline'));
  await act(async () => { findButton(tree.root, 'Reintentar Planes compartidos').props.onPress(); });
  expect(findButton(tree.root, 'Revisar: Alice')).toBeTruthy();
  expect(findText(tree.root, 'Connections offline Mostrando la última actualización disponible.')).toBeTruthy();
  expect(findText(tree.root, 'Planes compartidos · 0')).toBeTruthy();
});

test('does not reveal stale pending content after an account changes', async () => {
  let resolveOld!: (value: any) => void;
  sources.requests.mockImplementationOnce(() => new Promise((done) => { resolveOld = done; }));
  const tree = render(React.createElement(CommunityInboxScreen));
  account.user = 'another-owner';
  await act(async () => { tree.update(React.createElement(CommunityInboxScreen)); });
  await act(async () => { resolveOld({ profiles: [{ uid: 'private', alias: 'Old account request' }], nextCursor: null }); });
  expect(findText(tree.root, 'Old account request')).toBeUndefined();
  expect(findText(tree.root, 'Solicitudes de conexión · 0')).toBeTruthy();
});
