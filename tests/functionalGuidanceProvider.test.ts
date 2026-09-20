import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { volumeAttempt, volumeSubject } from './fixtures/muscleVolume';
const state = vi.hoisted(() => ({ user: null as string | null, data: {} as Record<string, any>, get: vi.fn(), set: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../context/DataContext', () => ({ useData: () => state.data }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: state.get, setItem: state.set } }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { text: '#fff', textMuted: '#ccc', primary: '#aaa' } }) }));
vi.mock('../components/GlassCard', () => ({ GlassCard: ({ children }: any) => React.createElement('card', null, children) }));
vi.mock('../components/UI', () => ({ GlassButton: (props: any) => React.createElement('button', props, props.title) }));
import { FunctionalGuidanceProvider } from '../components/FunctionalGuidanceProvider';
import { FunctionalGuidanceValue, useFunctionalGuidance } from '../context/FunctionalGuidanceContext';
import { FunctionalGuidanceCard } from '../components/FunctionalGuidanceCard';
import { ResultGuidance, WorkoutGuidance } from '../components/WorkoutGuidance';
import { TrainingHelp } from '../components/TrainingHelp';
import { newGuidancePreferences } from '../utils/functionalGuidance';
import { router } from './helpers/expoRouterStub';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let tree: Renderer.ReactTestRenderer | undefined;
let guide: FunctionalGuidanceValue;
function Probe() { guide = useFunctionalGuidance(); return null; }
const content = (child?: React.ReactNode) => React.createElement(FunctionalGuidanceProvider, null, React.createElement(Probe), child);
const mount = async (child?: React.ReactNode) => { await act(async () => { tree = Renderer.create(content(child)); }); };
const update = async (child?: React.ReactNode) => { await act(async () => { tree!.update(content(child)); }); };
const press = async (title: string) => { await act(async () => { tree!.root.findByProps({ title }).props.onPress(); }); };
beforeEach(() => {
  state.user = volumeSubject; state.data = { dataState: 'ready', hydratedUserId: volumeSubject, routines: [], attempts: [], sessions: [] };
  state.get.mockReset().mockResolvedValue(null); state.set.mockReset().mockResolvedValue(undefined); router.push.mockClear();
});
afterEach(async () => { if (tree) await act(async () => tree!.unmount()); tree = undefined; });
test('loads only after matching hydration; read latency never invites prematurely', async () => {
  state.data.hydratedUserId = 'old'; await mount();
  expect(state.get).not.toHaveBeenCalled(); expect(guide.progress.visible).toBe(false);
  let resolve!: (raw: string | null) => void;
  state.get.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  state.data.hydratedUserId = state.user; await update();
  expect(guide.ready).toBe(false);
  await act(async () => resolve(null));
  expect(guide.progress.visible).toBe(true);
});
test('late previous-account hydration and write failures cannot replace the current account', async () => {
  let resolve!: (raw: string) => void;
  state.get.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await mount(); state.user = 'second'; state.data.hydratedUserId = 'second'; await update();
  await act(async () => resolve(JSON.stringify({ ...newGuidancePreferences(), invitation: 'dismissed' })));
  expect(guide.preferences.invitation).toBe('unseen');
  let reject!: (e: Error) => void;
  state.set.mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
  await act(async () => guide.dismiss());
  state.user = 'third'; state.data.hydratedUserId = 'third'; await update();
  await act(async () => reject(new Error('disk')));
  expect(guide.error).toBeNull(); expect(guide.preferences.invitation).toBe('unseen');
  state.user = null; await update(); expect(guide.ready).toBe(false); expect(guide.progress.visible).toBe(false);
});
test('automatic read failure stays quiet; explicit choices remain in memory and report failed persistence', async () => {
  state.get.mockRejectedValueOnce(new Error('disk')); await mount();
  expect(guide.progress.visible).toBe(false); expect(guide.error).toBeNull(); expect(guide.ready).toBe(true);
  state.set.mockRejectedValue(new Error('disk')); await act(async () => guide.accept());
  expect(guide.active).toBe(true); expect(guide.error).toContain('No pudimos guardar');
  await act(async () => guide.dismiss()); expect(guide.progress.visible).toBe(false);
});
test('dismissal survives remount and manual re-enabling does not erase milestones', async () => {
  const store = new Map<string, string>();
  state.get.mockImplementation(async key => store.get(key) ?? null); state.set.mockImplementation(async (key, value) => { store.set(key, value); });
  await mount(); await act(async () => guide.dismiss()); await act(async () => tree!.unmount()); await mount();
  expect(guide.preferences.invitation).toBe('dismissed');
  await act(async () => guide.accept()); expect(guide.progress.visible).toBe(true);
});
test('invitation opts in without creating a routine, starting a session or inventing completed steps', async () => {
  await mount(React.createElement(FunctionalGuidanceCard));
  expect(JSON.stringify(tree!.toJSON())).not.toContain('1. Preparar');
  await press('Empezar'); expect(router.push).toHaveBeenCalledWith('/routine/create');
  expect(guide.preferences.invitation).toBe('accepted'); expect(guide.progress.prepared).toBe(false);
  expect(JSON.stringify(tree!.toJSON())).toContain('1. Preparar');
  await press('Ocultar guía'); expect(guide.progress.visible).toBe(false);
});
test('a stale continuation callback rechecks recovery and never launches a competing workout', async () => {
  await mount(React.createElement(FunctionalGuidanceCard));
  const stale = tree!.root.findByProps({ title: 'Empezar' }).props.onPress;
  state.data.activeWorkoutDraft = { attemptId: 'busy' }; await update(React.createElement(FunctionalGuidanceCard));
  await act(async () => stale()); expect(router.push).not.toHaveBeenCalled(); expect(guide.progress.visible).toBe(false);
});
test('a previous account cannot navigate through its stale guide action', async () => {
  await mount(React.createElement(FunctionalGuidanceCard));
  const stale = tree!.root.findByProps({ title: 'Empezar' }).props.onPress;
  state.user = 'second'; state.data.hydratedUserId = 'second'; await update(React.createElement(FunctionalGuidanceCard));
  await act(async () => stale()); expect(router.push).not.toHaveBeenCalled();
});
test('partial confirmed history advances only when its available recap is viewed', async () => {
  state.get.mockResolvedValue(JSON.stringify({ ...newGuidancePreferences(), invitation: 'accepted' }));
  const a = volumeAttempt(); state.data.attempts = [{ ...a, rewardApplication: { id: 'pending', state: 'pending' } }]; state.data.sessions = [{ id: a.id }];
  await mount(React.createElement(ResultGuidance, { sessionId: a.id })); expect(guide.preferences.reviewedResultId).toBeNull();
  state.data.attempts = [a]; await update(React.createElement(ResultGuidance, { sessionId: 'missing' }));
  expect(guide.progress.recorded).toBe(true); expect(guide.preferences.reviewedResultId).toBeNull();
  await update(React.createElement(ResultGuidance, { sessionId: a.id }));
  expect(guide.progress.reviewed).toBe(true); expect(guide.progress.visible).toBe(false);
});
test('first-series help is opt-in, hides after saved work, and never changes training state', async () => {
  await mount(React.createElement(WorkoutGuidance, { phase: 'active' }));
  expect(JSON.stringify(tree!.toJSON())).not.toContain('Registra lo realizado');
  await act(async () => guide.accept()); expect(JSON.stringify(tree!.toJSON())).toContain('Registra lo realizado');
  await update(React.createElement(WorkoutGuidance, { phase: 'active', hasSavedSet: true }));
  expect(JSON.stringify(tree!.toJSON())).not.toContain('Registra lo realizado');
  await update(React.createElement(WorkoutGuidance, { phase: 'active', hasSavedSet: false }));
  expect(JSON.stringify(tree!.toJSON())).not.toContain('Registra lo realizado');
  expect(router.push).not.toHaveBeenCalled();
});
test('mesocycle help expands inline and acknowledgement does not create or activate a plan', async () => {
  await mount(React.createElement(TrainingHelp, { topic: 'mesocycles' }));
  await act(async () => { tree!.root.findAll(n => n.props.accessibilityLabel === '¿Qué es un mesociclo?')[0].props.onPress(); });
  expect(JSON.stringify(tree!.toJSON())).toContain('Un día sin asignar no es un descanso');
  await press('Entendido'); expect(guide.preferences.mesocycleTopicAcknowledged).toBe(true);
  expect(router.push).not.toHaveBeenCalled();
});
