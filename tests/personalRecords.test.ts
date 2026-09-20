import React from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { render, resetRuntimeHarness, setMockData, setMockParams } from './helpers/runtimeHarness';
import { Routine, WorkoutAttempt } from '../types';
import { applySessionEdits, attemptToSession, createWorkoutAttempt } from '../utils/workoutAttempts';
import { selectPersonalLoadRecords } from '../utils/personalRecords';
import PersonalWorkoutRecapScreen from '../app/session/recap/[id]';
const recordAwards = vi.hoisted(() => vi.fn(async () => [] as any[]));
vi.mock('../services/recordRewards', () => ({ getRecordGemRewards: recordAwards }));
vi.mock('../components/WorkoutVictory', () => ({ WorkoutVictory: () => null }));
const routine: Routine = { id: 'r', name: 'Upper', createdAt: '', muscleGroups: [], exercises: [{
  id: 'e', catalogExerciseId: 'catalog-e', name: 'Press', variant: 'Barra', muscleGroups: [],
  loadMode: 'external-load', loadUnit: 'kg', sets: [{ id: 's', tipo: 1, weight: 20, reps: 8 }],
}] };
const now = new Date('2026-09-09T12:00:00Z');
function attempt(id: string, load: number, at = '2026-09-08T12:00:00Z'): WorkoutAttempt {
  const value = createWorkoutAttempt({ id, owner: 'rodaja', routine, completedAt: at, durationSeconds: 60, restTimerSeconds: 30,
    results: { 'e:s': { performed: true, load, reps: 8 } } });
  return { ...value, rewardApplication: { ...value.rewardApplication, state: 'applied' } };
}
const current = () => attempt('new', 30, now.toISOString());
const records = (history: WorkoutAttempt[], target = current()) => selectPersonalLoadRecords([...history, target], 'rodaja', target.id, now);
beforeEach(() => { recordAwards.mockResolvedValue([]); resetRuntimeHarness(); setMockParams({ id: 'new' }); });
test('freezes variant on new captures and preserves it through corrections and JSON roundtrip', () => {
  const value = current();
  expect(value.exercises[0].variant).toBe('Barra');
  const corrected = applySessionEdits(JSON.parse(JSON.stringify(value)), attemptToSession(value));
  expect(corrected.exercises[0].variant).toBe('Barra');
});
test('shows previous best, not previous session; ties and first comparable marks are not improvements', () => {
  expect(records([])).toEqual([]);
  expect(records([attempt('tie', 30)])).toEqual([]);
  expect(records([attempt('best', 25), attempt('last', 20, '2026-09-09T10:00:00Z')])).toMatchObject([
    { exerciseId: 'catalog-e', variant: 'Barra', reps: 8, unit: 'kg', previousLoad: 25, load: 30 },
  ]);
});
test.each(['owner', 'future', 'same-time', 'pending', 'unknown-variant', 'variant', 'unit', 'mode', 'reps', 'warmup', 'unperformed', 'invalid', 'identity'])(
  'excludes incompatible previous evidence: %s', (reason) => {
    const previous = JSON.parse(JSON.stringify(attempt('old', 20)));
    const exercise = previous.exercises[0], set = exercise.sets[0];
    if (reason === 'owner') previous.owner = 'other';
    if (reason === 'future') previous.completedAt = '2026-09-10T12:00:00Z';
    if (reason === 'same-time') previous.completedAt = now.toISOString();
    if (reason === 'pending') previous.rewardApplication.state = 'pending';
    if (reason === 'unknown-variant') delete exercise.variant;
    if (reason === 'variant') exercise.variant = 'Mancuernas';
    if (reason === 'unit') set.result.performance.unit = 'lb';
    if (reason === 'mode') set.result.performance = { mode: 'assisted', assistance: 20, unit: 'kg', reps: 8 };
    if (reason === 'reps') set.result.performance.reps = 10;
    if (reason === 'warmup') set.plan.type = 'C';
    if (reason === 'unperformed') set.result.performed = false;
    if (reason === 'invalid') set.result.performance.load = -1;
    if (reason === 'identity') set.result.setId = 'wrong';
    expect(records([previous])).toEqual([]);
  },
);
test('rejects unconfirmed targets, duplicate attempt identities and invalid dates', () => {
  const target = current();
  expect(records([attempt('old', 20)], { ...target, rewardApplication: { ...target.rewardApplication, state: 'pending' } })).toEqual([]);
  expect(records([attempt('old', 20), target])).toEqual([]);
  expect(records([attempt('old', 20)], { ...target, completedAt: 'invalid' })).toEqual([]);
});
test('derives corrections again and does not mutate source history', () => {
  const previous = attempt('old', 20); const snapshot = JSON.stringify(previous);
  expect(records([previous])).toHaveLength(1); expect(JSON.stringify(previous)).toBe(snapshot);
  const edited = attemptToSession(previous); edited.exercises[0].sets[0].weight = 35;
  expect(records([applySessionEdits(previous, edited)])).toEqual([]);
});
test('actual private recap shows contextual improvement and removes it after history correction', async () => {
  const target = current(); const previous = attempt('old', 20);
  setMockData({ sessions: [attemptToSession(target)], attempts: [previous, target], isLoading: false, dataState: 'ready', hydratedUserId: 'rodaja' });
  const tree = await render(React.createElement(PersonalWorkoutRecapScreen));
  expect(JSON.stringify(tree.toJSON())).toContain('Mejor carga a iguales repeticiones');
  expect(tree.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''))).toContain('Anterior: 20 kg · Ahora: 30 kg');
  setMockData({ sessions: [attemptToSession(target)], attempts: [attempt('old', 35), target], isLoading: false, dataState: 'ready', hydratedUserId: 'rodaja' });
  const { act } = await import('react-test-renderer');
  await act(async () => tree.update(React.createElement(PersonalWorkoutRecapScreen)));
  expect(JSON.stringify(tree.toJSON())).not.toContain('Mejor carga a iguales repeticiones');
  await act(async () => tree.unmount());
});

test('does not announce warmup, unperformed, invalid or unknown-variant target marks', () => {
  for (const kind of ['warmup', 'unperformed', 'invalid', 'variant']) {
    const target = JSON.parse(JSON.stringify(current()));
    const exercise = target.exercises[0], set = exercise.sets[0];
    if (kind === 'warmup') set.plan.type = 'C';
    if (kind === 'unperformed') set.result.performed = false;
    if (kind === 'invalid') set.result.performance.reps = 0;
    if (kind === 'variant') delete exercise.variant;
    expect(records([attempt('old', 20)], target)).toEqual([]);
  }
});
test('aggregates repeated compatible exercises by maximum without mixing rep partitions', () => {
  const target = JSON.parse(JSON.stringify(current()));
  const second = JSON.parse(JSON.stringify(target.exercises[0]));
  second.sets[0].result.performance.load = 35;
  target.exercises.push(second);
  expect(records([attempt('old', 20)], target)).toMatchObject([{ load: 35 }]);
  expect(records([attempt('old', 20)], target)).toHaveLength(1);
});
test('private recap never announces records while confirmed history is unavailable', async () => {
  const target = current();
  setMockData({ sessions: [attemptToSession(target)], attempts: [attempt('old', 20), target], dataState: 'error', hydratedUserId: 'rodaja' });
  const tree = await render(React.createElement(PersonalWorkoutRecapScreen));
  expect(JSON.stringify(tree.toJSON())).not.toContain('Mejor carga a iguales repeticiones');
  const { act } = await import('react-test-renderer'); await act(async () => tree.unmount());
});

// Repetition records share the same confirmed-history boundary as load records.
import { selectPersonalRepRecords } from '../utils/personalRecords';
function repAttempt(id: string, reps: number, load = 30, at = '2026-09-08T12:00:00Z') {
  const value = attempt(id, load, at);
  const edited = attemptToSession(value); edited.exercises[0].sets[0].reps = reps;
  return applySessionEdits(value, edited);
}
const repCurrent = () => repAttempt('new', 12, 30, now.toISOString());
const repRecords = (history: WorkoutAttempt[], target = repCurrent()) => selectPersonalRepRecords([...history, target], 'rodaja', target.id, now);
test('repetition record compares earlier best at exactly the same external load', () => {
  expect(repRecords([repAttempt('best', 10), repAttempt('last', 8)])).toMatchObject([{ previousReps: 10, reps: 12, load: 30, unit: 'kg', variant: 'Barra' }]);
  expect(repRecords([])).toEqual([]);
  expect(repRecords([repAttempt('tie', 12)])).toEqual([]);
  expect(repRecords([repAttempt('higher', 15)])).toEqual([]);
  expect(repRecords([repAttempt('different-load', 8, 30.1)])).toEqual([]);
});
test.each(['owner', 'future', 'same-time', 'pending', 'variant', 'unknown', 'unit', 'mode', 'warmup', 'unperformed', 'invalid', 'identity'])(
  'repetition record excludes incompatible evidence: %s', (kind) => {
    const previous = JSON.parse(JSON.stringify(repAttempt('old', 8)));
    const exercise = previous.exercises[0], set = exercise.sets[0];
    if (kind === 'owner') previous.owner = 'other';
    if (kind === 'future') previous.completedAt = '2026-09-11T12:00:00Z';
    if (kind === 'same-time') previous.completedAt = now.toISOString();
    if (kind === 'pending') previous.rewardApplication.state = 'pending';
    if (kind === 'variant') exercise.variant = 'Mancuernas';
    if (kind === 'unknown') delete exercise.variant;
    if (kind === 'unit') set.result.performance.unit = 'lb';
    if (kind === 'mode') set.result.performance = { mode: 'bodyweight', bodyweight: 30, reps: 8, unit: 'kg' };
    if (kind === 'warmup') set.plan.type = 'C';
    if (kind === 'unperformed') set.result.performed = false;
    if (kind === 'invalid') set.result.performance.reps = 0;
    if (kind === 'identity') set.result.setId = 'wrong';
    expect(repRecords([previous])).toEqual([]);
  },
);
test('repetition records reject duplicate identities, pending targets and derive corrections without mutation', () => {
  const previous = repAttempt('old', 8); const target = repCurrent(); const snapshot = JSON.stringify([previous, target]);
  expect(repRecords([previous])).toHaveLength(1);
  expect(JSON.stringify([previous, target])).toBe(snapshot);
  expect(repRecords([previous, previous])).toEqual([]);
  expect(repRecords([previous], { ...target, rewardApplication: { ...target.rewardApplication, state: 'pending' } })).toEqual([]);
  const edited = attemptToSession(previous); edited.exercises[0].sets[0].reps = 14;
  expect(repRecords([applySessionEdits(previous, edited)])).toEqual([]);
});
test('private recap renders repetition comparison and recalculates after corrections', async () => {
  const target = repCurrent();
  const data = { sessions: [attemptToSession(target)], attempts: [repAttempt('old', 8), target], isLoading: false, dataState: 'ready', hydratedUserId: 'rodaja' };
  setMockData(data);
  const tree = await render(React.createElement(PersonalWorkoutRecapScreen));
  const text = () => tree.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''));
  expect(text()).toContain('Más repeticiones con la misma carga');
  expect(text()).toContain('Anterior: 8 reps · Ahora: 12 reps');
  expect(text()).not.toContain('Mejor carga a iguales repeticiones');
  setMockData({ ...data, attempts: [repAttempt('old', 15), target] });
  const { act } = await import('react-test-renderer');
  await act(async () => tree.update(React.createElement(PersonalWorkoutRecapScreen)));
  expect(text()).not.toContain('Más repeticiones con la misma carga');
  await act(async () => tree.unmount());
});
test('repetition records keep distinct loads separate and choose the best repeated occurrence', () => {
  const previous = repAttempt('old', 8); const target = JSON.parse(JSON.stringify(repCurrent()));
  const repeated = JSON.parse(JSON.stringify(target.exercises[0])); repeated.sets[0].result.performance.reps = 13;
  const different = JSON.parse(JSON.stringify(target.exercises[0])); different.sets[0].result.performance.load = 40;
  target.exercises.push(repeated, different);
  expect(repRecords([previous], target)).toMatchObject([{ load: 30, reps: 13, previousReps: 8 }]);
  expect(repRecords([previous], target)).toHaveLength(1);
});
test.each(['warmup', 'unperformed', 'invalid', 'unknown', 'future', 'date', 'owner'])(
  'repetition record excludes invalid target: %s', (kind) => {
    const target = JSON.parse(JSON.stringify(repCurrent()));
    const exercise = target.exercises[0], set = exercise.sets[0];
    if (kind === 'warmup') set.plan.type = 'C';
    if (kind === 'unperformed') set.result.performed = false;
    if (kind === 'invalid') set.result.performance.load = -1;
    if (kind === 'unknown') delete exercise.variant;
    if (kind === 'future') target.completedAt = '2026-09-11T12:00:00Z';
    if (kind === 'date') target.completedAt = 'invalid';
    if (kind === 'owner') target.owner = 'other';
    expect(repRecords([repAttempt('old', 8)], target)).toEqual([]);
  },
);

import { selectPersonalVolumeRecords } from '../utils/personalRecords';
test('exercise volume adds eligible sets and compares previous session total, not best single set', () => {
  const target = JSON.parse(JSON.stringify(repCurrent()));
  const second = JSON.parse(JSON.stringify(target.exercises[0]));
  second.sets[0].plan.id = 'second'; second.sets[0].result.setId = 'second';
  target.exercises.push(second);
  expect(selectPersonalVolumeRecords([repAttempt('old', 8), target], 'rodaja', target.id, now)).toMatchObject([{ previousVolume: 240, volume: 720, unit: 'kg' }]);
  expect(selectPersonalVolumeRecords([target], 'rodaja', target.id, now)).toEqual([]);
});

test.each(['tie', 'unknown', 'owner', 'warmup', 'unperformed', 'unit', 'future', 'duplicate-set'])(
  'volume excludes incompatible or non-improving evidence: %s', (kind) => {
    const old = JSON.parse(JSON.stringify(repAttempt('old', 8)));
    const target = repCurrent(); const e = old.exercises[0], set = e.sets[0];
    if (kind === 'tie') set.result.performance.reps = 12;
    if (kind === 'unknown') delete e.variant;
    if (kind === 'owner') old.owner = 'other';
    if (kind === 'warmup') set.plan.type = 'C';
    if (kind === 'unperformed') set.result.performed = false;
    if (kind === 'unit') set.result.performance.unit = 'lb';
    if (kind === 'future') old.completedAt = '2999-01-01T00:00:00Z';
    if (kind === 'duplicate-set') e.sets.push(set);
    expect(selectPersonalVolumeRecords([old, target], 'rodaja', target.id, now)).toEqual([]);
  },
);
test('recap separates recalculated volume from immutable server-awarded gems', async () => {
  const target = repCurrent(); const data = { sessions: [attemptToSession(target)], attempts: [repAttempt('old', 8), target], dataState: 'ready', hydratedUserId: 'rodaja' };
  recordAwards.mockResolvedValue([{ amount: 25, recordType: 'volume', exerciseId: 'catalog-e', variant: 'Barra', unit: 'kg' }]);
  setMockData(data); const tree = await render(React.createElement(PersonalWorkoutRecapScreen));
  const texts = () => tree.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join('')).join(' ');
  const { act } = await import('react-test-renderer');
  await act(async () => { await Promise.resolve(); });
  expect(texts()).toContain('Mayor volumen por ejercicio'); expect(texts()).toContain('+25 gemas acreditadas');
  setMockData({ ...data, attempts: [repAttempt('old', 20), target] });
  await act(async () => tree.update(React.createElement(PersonalWorkoutRecapScreen)));
  expect(texts()).not.toContain('Mayor volumen por ejercicio'); expect(texts()).toContain('+25 gemas acreditadas');
  await act(async () => tree.unmount());
});
test('late server award read from another recap cannot publish into the current recap', async () => {
  let resolve!: (value: any[]) => void;
  recordAwards.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const target = repCurrent(); const data = { sessions: [attemptToSession(target)], attempts: [target], dataState: 'ready', hydratedUserId: 'rodaja' };
  setMockData(data); const tree = await render(React.createElement(PersonalWorkoutRecapScreen));
  setMockParams({ id: 'other' }); setMockData({ ...data, sessions: [{ ...attemptToSession(target), id: 'other' }] });
  const { act } = await import('react-test-renderer');
  await act(async () => tree.update(React.createElement(PersonalWorkoutRecapScreen)));
  await act(async () => resolve([{ amount: 25, recordType: 'volume', exerciseId: 'e', variant: 'Barra', unit: 'kg' }]));
  expect(JSON.stringify(tree.toJSON())).not.toContain('gemas acreditadas');
  await act(async () => tree.unmount());
});

test.each(['error', 'loading', 'wrong-owner'])('recap does not claim an award query is running when unavailable: %s', async (state) => {
  const target = current(); recordAwards.mockClear();
  setMockData({ sessions: [attemptToSession(target)], attempts: [target], dataState: state === 'wrong-owner' ? 'ready' : state,
    hydratedUserId: state === 'wrong-owner' ? 'other' : 'rodaja' });
  const tree = await render(React.createElement(PersonalWorkoutRecapScreen));
  expect(recordAwards).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).not.toContain('Consultando premios…');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Tu trabajo, serie por serie');
  expect(JSON.stringify(tree.toJSON())).toContain(state === 'loading' ? 'Cargando tu entrenamiento…' : 'Tu historial confirmado no está disponible.');
  const { act } = await import('react-test-renderer'); await act(async () => tree.unmount());
});
test('recap shows genuine award loading, failure, retry and empty receipt without inventing gems', async () => {
  let reject!: (reason: Error) => void;
  recordAwards.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const target = current(); const data = { sessions: [attemptToSession(target)], attempts: [target], dataState: 'ready', hydratedUserId: 'rodaja' };
  setMockData(data); const tree = await render(React.createElement(PersonalWorkoutRecapScreen));
  const text = () => JSON.stringify(tree.toJSON()); const { act } = await import('react-test-renderer');
  expect(text()).toContain('Consultando premios…');
  await act(async () => reject(new Error('offline')));
  expect(text()).toContain('No se pudieron consultar los premios.'); expect(text()).not.toContain('Consultando premios…');
  setMockData({ ...data, dataState: 'error' });
  await act(async () => tree.update(React.createElement(PersonalWorkoutRecapScreen)));
  expect(text()).not.toContain('Consultando premios…');
  let resolve!: (values: any[]) => void;
  recordAwards.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  setMockData(data); await act(async () => tree.update(React.createElement(PersonalWorkoutRecapScreen)));
  expect(text()).toContain('Consultando premios…'); expect(text()).not.toContain('No se pudieron consultar los premios.');
  await act(async () => resolve([]));
  expect(text()).toContain('Sin premios por récords acreditados en esta sesión.');
  await act(async () => tree.unmount());
});
test.each(['match', 'variant', 'identity', 'owner', 'blank'])('award labels use only the matching recorded exercise name: %s', async (kind) => {
  const target = JSON.parse(JSON.stringify(current()));
  target.exercises[0].recordedName = kind === 'blank' ? '  ' : 'Recorded press';
  if (kind === 'variant') target.exercises[0].variant = 'Mancuernas';
  if (kind === 'identity') target.exercises[0].exerciseId = 'different';
  if (kind === 'owner') target.owner = 'other';
  recordAwards.mockResolvedValue([{ amount: 25, recordType: 'volume', exerciseId: 'catalog-e', variant: 'Barra', unit: 'kg' }]);
  setMockData({ sessions: [attemptToSession(target)], attempts: [target], dataState: 'ready', hydratedUserId: 'rodaja' });
  const tree = await render(React.createElement(PersonalWorkoutRecapScreen));
  const { act } = await import('react-test-renderer');
  await act(async () => { await Promise.resolve(); });
  const texts = tree.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''));
  expect(texts).toContain(`Volumen · ${kind === 'match' ? 'Recorded press' : 'Ejercicio'} · Barra · kg: +25 gemas acreditadas`);
  expect(texts.some((value) => value.includes('catalog-e'))).toBe(false);
  await act(async () => tree.unmount());
});
