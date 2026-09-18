import React from 'react';
import { __emitAppState, __resetAppState } from './helpers/reactNativeStub';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CatalogLibrary } from '../types';
import { createWorkoutAttempt } from '../utils/workoutAttempts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: vi.fn(async (key: string) => data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { data.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { data.delete(key); }),
    getAllKeys: vi.fn(async () => [...data.keys()]),
    multiRemove: vi.fn(async (keys: string[]) => { keys.forEach((key) => data.delete(key)); }),
  };
});
const trainingLibrary = vi.hoisted(() => ({
  value: { routines: [] as any[], mesocycles: [] as any[] } as {
    routines: any[]; mesocycles: any[]; routinesRevision?: number; mesocyclesRevision?: number;
  },
  load: vi.fn(async () => ({ routinesRevision: 0, mesocyclesRevision: 0, ...trainingLibrary.value })),
  saveMesocycles: vi.fn(async (input: { expectedRevision: number; items: any[] }) => ({ revision: input.expectedRevision + 1, items: input.items })),
  saveRoutines: vi.fn(async (input: { expectedRevision: number; items: any[] }) => ({ revision: input.expectedRevision + 1, items: input.items })),
}));
const authState = vi.hoisted(() => ({ user: 'rodaja' as string | null }));
const trainingState = vi.hoisted(() => ({
  value: { definitions: [] as any[], attempts: [] as any[], sessions: [] as any[], activeWorkoutDraft: null as any },
  load: vi.fn(async () => trainingState.value),
  save: vi.fn(async () => undefined),
  start: vi.fn(async (draft: any) => draft),
  import: vi.fn(async () => undefined),
  experience: vi.fn(async () => ({ level: 1, rank: 'Principiante', xpIntoLevel: 0, xpForNextLevel: 100, totalXp: 0 })),
}));
const offlineRpc = vi.hoisted(() => vi.fn(async (_name: string, _input?: unknown) => ({ data: null as any, error: {code:'PGRST202'} as any })));
vi.mock('../services/supabase', () => ({ supabase: { rpc: offlineRpc }, supabaseConfigurationError: null }));
const finalizeAttempt = vi.hoisted(() => vi.fn());

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: authState.user }) }));
vi.mock('../services/catalog', () => ({
  loadCatalogExercises: vi.fn(async () => [{ id: 'EX-0001', name: 'Press banca', muscleGroups: ['GM-101'], variant: 'Barra', defaultSets: [] }]),
  loadCatalogMuscleGroups: vi.fn(async () => [{ id: 'GM-101', name: 'Pectoral mayor', displayName: 'Pectoral mayor', type: 'Músculo', level: 3, visibleInFilters: true, path: 'Cuerpo > Pecho > Pectoral mayor' }]),
  filterCatalogExercises: vi.fn(),
}));
vi.mock('../services/trainingLibrary', () => ({
  loadTrainingLibrary: trainingLibrary.load,
  saveTrainingRoutines: trainingLibrary.saveRoutines,
  saveTrainingMesocycles: trainingLibrary.saveMesocycles,
}));
vi.mock('../services/trainingState', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/trainingState')>(),
  loadTrainingState: trainingState.load,
  saveTrainingState: trainingState.save,
  startTrainingWorkout: trainingState.start,
  importLegacyCustomDefinitions: trainingState.import,
  loadExperienceProgress: trainingState.experience,
  finalizeTrainingAttempt: finalizeAttempt,
}));
vi.mock('../services/experience', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/experience')>(),
  loadExperienceProgress: trainingState.experience,
}));

import { DataProvider, useData } from '../context/DataContext';

const library = (): CatalogLibrary => ({
  version: 2,
  owner: 'rodaja',
  definitions: [{
    id: 'system:press-banca', source: { kind: 'system' }, name: 'Press banca',
    muscleGroups: ['pecho'], loadMode: 'external-load', loadUnit: 'kg', variant: 'barra',
    defaultSets: [{ id: 'set-1', tipo: 1, weight: 0, reps: 8 }],
  }],
  routines: [{
    id: 'routine-1', name: 'Upper', muscleGroups: ['pecho'], createdAt: '2026-07-31T00:00:00.000Z',
    exercises: [{
      id: 'routine-exercise-1', catalogExerciseId: 'system:press-banca', definitionId: 'system:press-banca',
      definitionSnapshot: { id: 'system:press-banca', name: 'Press banca', muscleGroups: ['pecho'], loadMode: 'external-load', loadUnit: 'kg', variant: 'barra' },
      name: 'Press banca', muscleGroups: ['pecho'], loadMode: 'external-load', loadUnit: 'kg', variant: 'barra',
      sets: [{ id: 'set-1', tipo: 1, weight: 0, reps: 8 }],
    }],
  }],
  mesocycles: [],
  attempts: [],
});

describe('DataProvider catalog library integration', () => {
  beforeEach(() => {
    __resetAppState();
    storage.data.clear();
    vi.clearAllMocks();
    offlineRpc.mockResolvedValue({data:null,error:{code:'PGRST202'}});
    authState.user = 'rodaja';
    trainingLibrary.value = { routines: [], mesocycles: [] };
    trainingLibrary.load.mockImplementation(async () => ({ routinesRevision: 0, mesocyclesRevision: 0, ...trainingLibrary.value }));
    trainingLibrary.saveRoutines.mockImplementation(async (input) => ({ revision: input.expectedRevision + 1, items: input.items }));
    trainingLibrary.saveMesocycles.mockImplementation(async (input) => ({ revision: input.expectedRevision + 1, items: input.items }));
    trainingState.value = { definitions: [], attempts: [], sessions: [], activeWorkoutDraft: null };
    trainingState.load.mockResolvedValue(trainingState.value);
    storage.data.set('@gymbro/catalog-library/v2/rodaja', JSON.stringify(library()));
    storage.data.set('@gymbro/catalog-library/v2/brisas', JSON.stringify({ ...library(), owner: 'brisas' }));
  });

  test('saves complete new routines atomically, returns stable versions and rejects stale drafts', async () => {
    const base = library().routines[0];
    trainingLibrary.value = { routines: [base], mesocycles: [] };
    trainingState.load.mockResolvedValue({ ...trainingState.value, attempts: [createWorkoutAttempt({ id: 'used', owner: 'rodaja', routine: base, completedAt: '2026-09-18T12:00:00Z', durationSeconds: 60, restTimerSeconds: 90, results: {} })] });
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await act(async () => { expect((await current!.saveRoutineDraft(base, base, 'no-op-version')).id).toBe(base.id); });
    expect(current!.routines).toHaveLength(1);
    const edited = { ...base, name: 'Edited' };
    const reverseKeys = (value: any): any => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseKeys(entry)])) : value;
    trainingLibrary.saveRoutines.mockImplementation(async (input) => ({ revision: input.expectedRevision + 1, items: reverseKeys(input.items) }));
    let saved: any;
    await act(async () => { saved = await current!.saveRoutineDraft(edited, base, 'stable-version'); });
    expect(saved).toMatchObject({ id: 'stable-version', name: 'Edited', previousVersionId: base.id });
    expect(current!.getRoutine(base.id)?.name).toBe(base.name);
    await act(async () => { await current!.saveRoutineDraft(edited, base, 'stable-version'); });
    expect(current!.routines.filter((routine) => routine.id === 'stable-version')).toHaveLength(1);
    const fresh = { ...base, id: 'fresh', name: 'Complete new routine' };
    await act(async () => { await current!.saveRoutineDraft(fresh, null, 'fresh'); });
    expect(current!.getRoutine('fresh')?.exercises).toEqual(base.exercises);
    await act(async () => { await current!.saveRoutineDraft({ ...fresh, name: 'Changed elsewhere' }, fresh, 'unused'); });
    await expect(current!.saveRoutineDraft({ ...fresh, name: 'Stale' }, fresh, 'unused-2')).rejects.toThrow('cambió');
    await act(async () => renderer.unmount());
  });

  test('reconciles canonical reward metadata but rejects a changed captured result', async () => {
    const { createWorkoutAttempt } = await import('../utils/workoutAttempts');
    const captured = createWorkoutAttempt({ id: 'reconcile', owner: 'rodaja', routine: library().routines[0], completedAt: '2026-09-08T12:00:00Z', durationSeconds: 60, restTimerSeconds: 90, results: {} });
    const canonical = { ...captured, rewardApplication: { ...captured.rewardApplication, state: 'applied' as const, appliedAt: '2026-09-08T12:00:01Z' } };
    trainingState.load.mockResolvedValue({ ...trainingState.value, attempts: [canonical] });
    finalizeAttempt.mockResolvedValue({ attempt: canonical, receipt: { balance: 0, entries: [], weekly: {} }, experienceReceipt: { progress: await trainingState.experience() } });
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };
    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await act(async () => { await current!.addAttempt(captured); });
    expect(finalizeAttempt).toHaveBeenCalledWith(captured);
    expect(current!.attempts).toEqual([canonical]);
    const changed = createWorkoutAttempt({ id: captured.id, owner: captured.owner, routine: library().routines[0], completedAt: captured.completedAt, durationSeconds: captured.durationSeconds, restTimerSeconds: captured.restTimerSeconds, results: { 'routine-exercise-1-set-1': { performed: true, reps: 12, load: 25 } } });
    await expect(current!.addAttempt(changed)).rejects.toThrow('otros datos capturados');
    await expect(current!.addAttempt({ ...captured, rewardApplication: { ...captured.rewardApplication, id: 'another-receipt' } })).rejects.toThrow('otros datos capturados');
    expect(finalizeAttempt).toHaveBeenCalledTimes(1);
  });

  test('prevents shared cancellation and unavailable-route cleanup from deleting pending finalization', async () => {
    const { createWorkoutAttempt } = await import('../utils/workoutAttempts');
    const attempt = createWorkoutAttempt({ id: 'pending', owner: 'rodaja', routine: library().routines[0], completedAt: '2026-09-08T12:00:00Z', durationSeconds: 60, restTimerSeconds: 90, results: {} });
    const draft = { version: 1 as const, owner: 'rodaja', attemptId: attempt.id, routineId: library().routines[0].id, startedAtMs: Date.now(), restTimerSeconds: 90, completedSets: {}, setValues: {}, routineSnapshot: library().routines[0], jointWorkoutId: 'joint-1', pendingFinalization: { attempt } };
    trainingState.load.mockResolvedValue({ ...trainingState.value, activeWorkoutDraft: draft });
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };
    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    trainingState.save.mockClear();
    await act(async () => { await expect(current!.cancelActiveWorkout()).rejects.toThrow('pendiente'); });
    await act(async () => { await current!.clearActiveWorkoutIfMatches({ owner: draft.owner, routineId: draft.routineId }); });
    const leave = vi.fn();
    await expect(current!.updateActiveWorkout({ ...draft, jointCancellationPending: true }).then(leave)).rejects.toThrow('pendiente');
    expect(leave).not.toHaveBeenCalled();
    expect(current!.activeWorkoutDraft).toEqual(draft);
    expect(trainingState.save).not.toHaveBeenCalled();
    await act(async () => { await current!.updateActiveWorkout({ ...draft, pendingFinalization: undefined }); });
    expect(current!.activeWorkoutDraft?.pendingFinalization).toEqual({ attempt });
    expect(trainingState.save).toHaveBeenLastCalledWith({ activeWorkoutDraft: expect.objectContaining({ pendingFinalization: { attempt } }) });
    await act(async () => { await current!.updateActiveWorkout({ ...draft, pendingFinalization: undefined }, { allowFinalizationReset: true }); });
    expect(current!.activeWorkoutDraft?.pendingFinalization).toBeUndefined();
  });

  test('custom exercise writes never replace an active workout or other training fields', async () => {
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };
    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    const draft = { version: 1 as const, owner: 'rodaja', attemptId: 'active', routineId: 'routine-1', startedAtMs: Date.now(), restTimerSeconds: 90, completedSets: {}, setValues: {} };
    await act(async () => { await current!.startActiveWorkout(draft); });
    await act(async () => { await current!.addExercise({ name: 'Custom press', muscleGroups: ['GM-101'], variant: 'Barra', defaultSets: [] }); });
    expect(trainingState.save).toHaveBeenLastCalledWith({ definitions: [expect.objectContaining({ name: 'Custom press' })] });
    expect(current!.activeWorkoutDraft).toEqual(draft);
  });

  test('custom exercise writes do not restore a deleted attempt from the hydration snapshot', async () => {
    const { createWorkoutAttempt } = await import('../utils/workoutAttempts');
    const attempt = createWorkoutAttempt({ id: 'deleted', owner: 'rodaja', routine: library().routines[0], completedAt: '2026-09-08T12:00:00Z', durationSeconds: 60, restTimerSeconds: 90, results: {} });
    trainingState.value = { ...trainingState.value, attempts: [attempt] };
    trainingState.load.mockResolvedValue(trainingState.value);
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };
    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await act(async () => { await current!.deleteSession(attempt.id); });
    await act(async () => { await current!.addExercise({ name: 'Custom press', muscleGroups: ['GM-101'], variant: 'Barra', defaultSets: [] }); });
    expect(current!.attempts).toEqual([]);
    expect(current!.sessions).toEqual([]);
    expect(trainingState.save).toHaveBeenLastCalledWith({ definitions: expect.any(Array) });
  });

  test('serializes concurrent custom exercise edits without dropping either definition', async () => {
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };
    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await act(async () => {
      await Promise.all(['First', 'Second'].map((name) => current!.addExercise({ name, muscleGroups: ['GM-101'], variant: 'Barra', defaultSets: [] })));
    });
    expect(current!.definitions.map(({ name }) => name)).toEqual(['First', 'Second']);
    expect(trainingState.save).toHaveBeenLastCalledWith({ definitions: [expect.objectContaining({ name: 'First' }), expect.objectContaining({ name: 'Second' })] });
  });

  test('hydrates the remote normalized catalog without a broad local runtime wipe', async () => {
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });

    expect(current?.dataState).toBe('ready');
    expect(current?.hydratedUserId).toBe('rodaja');
    expect(current?.definitions).toEqual([]);
    expect(current?.exercises[0]).toMatchObject({ id: 'EX-0001', muscleGroups: ['GM-101'] });
    expect(current?.catalogMuscleGroups).toHaveLength(1);
    expect(current?.routines).toEqual([]);
    expect(trainingState.import).not.toHaveBeenCalled();
    expect(storage.data.has('@gymbro/catalog-library/v2/rodaja')).toBe(true);
  });

  test('rejects a recipient-mismatched import before it can publish state', async () => {
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };
    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });

    await expect(current!.importCatalogContent({ recipient: 'brisas', definitions: [], routines: [], mesocycles: [] }))
      .rejects.toThrow('perfil activo');
    expect(current?.routines).toHaveLength(0);
  });

  test('remains ready after deleting the last remote mesocycle', async () => {
    trainingLibrary.value = {
      routines: [],
      mesocycles: [{
        id: 'mesocycle-1', name: 'Block', goal: '', status: 'draft', durationWeeks: 1,
        createdAt: '2026-08-01T00:00:00.000Z', weeks: [],
      }],
    };
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await act(async () => { await current!.deleteMesocycle('mesocycle-1'); });

    expect(trainingLibrary.saveMesocycles).toHaveBeenCalledWith({ expectedRevision: 0, items: [] });
    expect(current?.mesocycles).toEqual([]);
    expect(current?.dataState).toBe('ready');
    expect(current?.isLoading).toBe(false);
  });

  test('rejects deleting terminal or attempted mesocycles at the context boundary', async () => {
    const draft = { id: 'draft', name: 'Draft', goal: '', status: 'draft' as const, durationWeeks: 1, createdAt: '', weeks: [] };
    const completed = { ...draft, id: 'completed', status: 'completed' as const };
    trainingLibrary.value = { routines: [], mesocycles: [draft, completed] };
    trainingState.value = { ...trainingState.value, attempts: [{ lineage: { mesocycleId: draft.id, weekNumber: 1, plannedSessionId: 'session' } } as any] };
    trainingState.load.mockResolvedValue(trainingState.value);
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };
    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await act(async () => { await expect(current!.deleteMesocycle(completed.id)).rejects.toThrow('borradores sin entrenamientos'); });
    await act(async () => { await expect(current!.deleteMesocycle(draft.id)).rejects.toThrow('borradores sin entrenamientos'); });
    expect(trainingLibrary.saveMesocycles).not.toHaveBeenCalled();
    expect(current?.mesocycles).toHaveLength(2);
  });

  test.each([false, true])('keeps the finalization boundary when mesocycle completion save fails: %s', async (failMesocycleSave) => {
    const mesocycle = {
      id: 'mesocycle-1', name: 'Block', goal: '', status: 'active' as const, durationWeeks: 1,
      createdAt: '2026-08-01T00:00:00.000Z', weeks: [{ id: 'week-1', weekNumber: 1, entries: [{ id: 'entry-1', ref: { routineId: 'routine-1', routineName: 'Upper', source: 'local' as const }, order: 1 }] }],
    };
    const attempt = {
      id: 'attempt-1', owner: 'rodaja', routineId: 'routine-1', recordedRoutineName: 'Upper', completedAt: '2026-08-01T00:00:00.000Z', durationSeconds: 0, restTimerSeconds: 0, version: 1 as const,
      lineage: { mesocycleId: mesocycle.id, weekNumber: 1, plannedSessionId: 'entry-1' }, exercises: [],
      completion: { validSets: 1, plannedSets: 1, adherence: 1, displayPercent: 100, status: 'fully-completed' as const },
      reward: { setGems: 1, completionGems: 10, fullCompletionBonus: 6, totalGems: 17, qualifiesForCompletion: true }, rewardApplication: { id: 'receipt', state: 'applied' as const },
    };
    trainingLibrary.value = { routines: [library().routines[0]], mesocycles: [mesocycle] };
    finalizeAttempt.mockResolvedValue({
      attempt,
      receipt: { balance: 0, entries: [], weekly: {} },
      experienceReceipt: { attemptId: attempt.id, earnedXp: 1, entries: [], progress: await trainingState.experience() },
    });
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    if (failMesocycleSave) {
      const failure = new Error('mesocycle CAS conflict after finalization');
      trainingLibrary.saveMesocycles.mockRejectedValueOnce(failure);
      await act(async () => { await expect(current!.addAttempt(attempt)).rejects.toBe(failure); });
      expect(finalizeAttempt).toHaveBeenCalledWith(attempt);
      return;
    }
    await act(async () => { await current!.addAttempt(attempt); });

    expect(current?.mesocycles).toMatchObject([{ id: mesocycle.id, status: 'completed' }]);
    expect(trainingLibrary.saveMesocycles).toHaveBeenCalledWith({
      expectedRevision: 0,
      items: [expect.objectContaining({ id: mesocycle.id, status: 'completed' })],
    });
  });

  test('rejects deleting a scheduled routine without changing the rendered library', async () => {
    trainingLibrary.value = {
      routines: [{ id: 'routine-1', name: 'Upper', muscleGroups: ['GM-100'], exercises: [], createdAt: '2026-08-01T00:00:00.000Z' }],
      mesocycles: [{
        id: 'mesocycle-1', name: 'Block', goal: '', status: 'draft', durationWeeks: 1,
        createdAt: '2026-08-01T00:00:00.000Z', weeks: [{ id: 'week-1', weekNumber: 1, entries: [{ id: 'entry-1', ref: { routineId: 'routine-1', routineName: 'Upper', source: 'local' }, order: 1 }] }],
      }],
    };
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await expect(current!.deleteRoutine('routine-1')).rejects.toThrow('programada en un mesociclo');

    expect(trainingLibrary.saveRoutines).not.toHaveBeenCalled();
    expect(current?.routines.map(({ id }) => id)).toEqual(['routine-1']);
  });

  test('keeps a routine rendered when remote deletion persistence fails', async () => {
    trainingLibrary.value = {
      routines: [{ id: 'routine-1', name: 'Upper', muscleGroups: ['GM-100'], exercises: [], createdAt: '2026-08-01T00:00:00.000Z' }],
      mesocycles: [],
    };
    trainingLibrary.saveRoutines.mockRejectedValueOnce(new Error('No se pudo guardar la planificación: offline'));
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await expect(current!.deleteRoutine('routine-1')).rejects.toThrow('offline');

    expect(current?.routines.map(({ id }) => id)).toEqual(['routine-1']);
  });

  test('keeps independent revisions and publishes only canonical save responses', async () => {
    const initialRoutine = library().routines[0];
    const initialMesocycle = {
      id: 'mesocycle-1', name: 'Block', goal: '', status: 'draft' as const, durationWeeks: 1,
      createdAt: '2026-08-01T00:00:00.000Z', weeks: [{ id: 'week-1', weekNumber: 1, entries: [] }],
    };
    trainingLibrary.value = {
      routines: [initialRoutine], mesocycles: [initialMesocycle], routinesRevision: 4, mesocyclesRevision: 9,
    };
    trainingLibrary.saveRoutines.mockResolvedValueOnce({
      revision: 5, items: [{ ...initialRoutine, name: 'Canonical routine' }],
    });
    trainingLibrary.saveMesocycles.mockResolvedValueOnce({
      revision: 10, items: [{ ...initialMesocycle, name: 'Canonical mesocycle' }],
    });
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await act(async () => {
      await current!.updateRoutine({ ...initialRoutine, name: 'Local routine draft' });
      await current!.updateMesocycle({ ...initialMesocycle, name: 'Local mesocycle draft' });
    });

    expect(trainingLibrary.saveRoutines).toHaveBeenCalledWith({
      expectedRevision: 4, items: [expect.objectContaining({ name: 'Local routine draft' })],
    });
    expect(trainingLibrary.saveMesocycles).toHaveBeenCalledWith({
      expectedRevision: 9, items: [expect.objectContaining({ name: 'Local mesocycle draft' })],
    });
    expect(current?.routines[0].name).toBe('Canonical routine');
    expect(current?.mesocycles[0].name).toBe('Canonical mesocycle');
  });

  test('preserves a local routine draft and server state on stale conflict without retrying', async () => {
    const initialRoutine = library().routines[0];
    const localDraft = { ...initialRoutine, name: 'Local draft' };
    const serverCurrent = { revision: 8, items: [{ ...initialRoutine, name: 'Web saved first' }] };
    const conflict = Object.assign(new Error('La planificación cambió en otro dispositivo.'), {
      name: 'TrainingLibraryConflictError', collection: 'routines', expectedRevision: 7,
      attemptedItems: [localDraft], current: serverCurrent,
    });
    trainingLibrary.value = {
      routines: [initialRoutine], mesocycles: [], routinesRevision: 7, mesocyclesRevision: 2,
    };
    trainingLibrary.saveRoutines.mockRejectedValueOnce(conflict);
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    const caught = await current!.updateRoutine(localDraft).catch((error) => error);

    expect(caught).toBe(conflict);
    expect(caught).toMatchObject({ attemptedItems: [localDraft], current: serverCurrent });
    expect(trainingLibrary.saveRoutines).toHaveBeenCalledTimes(1);
    expect(current?.routines).toEqual([initialRoutine]);
  });

  test('orders same-process routine mutations and advances from canonical revisions', async () => {
    trainingLibrary.value = { routines: [], mesocycles: [], routinesRevision: 3, mesocyclesRevision: 0 };
    let resolveFirst: ((value: { revision: number; items: any[] }) => void) | undefined;
    trainingLibrary.saveRoutines
      .mockImplementationOnce((input) => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(async (input) => ({ revision: 5, items: input.items }));
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    await act(async () => {
      first = current!.addRoutine('First', ['pecho']);
      second = current!.addRoutine('Second', ['espalda']);
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(trainingLibrary.saveRoutines).toHaveBeenCalledTimes(1));
    const firstItems = trainingLibrary.saveRoutines.mock.calls[0][0].items;
    await act(async () => {
      resolveFirst!({ revision: 4, items: firstItems });
      await Promise.all([first, second]);
    });

    expect(trainingLibrary.saveRoutines.mock.calls[1][0]).toMatchObject({ expectedRevision: 4 });
    expect(trainingLibrary.saveRoutines.mock.calls[1][0].items.map(({ name }) => name)).toEqual(['Second', 'First']);
    expect(current?.routines.map(({ name }) => name)).toEqual(['Second', 'First']);
  });

  test('clears revision-backed data on session changes and hydrates the next owner atomically', async () => {
    trainingLibrary.value = { routines: [library().routines[0]], mesocycles: [], routinesRevision: 7, mesocyclesRevision: 1 };
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });

    authState.user = null;
    await act(async () => { renderer!.update(React.createElement(DataProvider, null, React.createElement(Probe))); });
    expect(current?.routines).toEqual([]);
    await expect(current!.addRoutine('Blocked', ['pecho'])).rejects.toThrow('autenticación');

    authState.user = 'brisas';
    trainingLibrary.value = { routines: [], mesocycles: [], routinesRevision: 2, mesocyclesRevision: 6 };
    await act(async () => { renderer!.update(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await act(async () => { await current!.addRoutine('Brisas routine', ['pecho']); });

    expect(current?.hydratedUserId).toBe('brisas');
    expect(trainingLibrary.saveRoutines).toHaveBeenLastCalledWith({
      expectedRevision: 2, items: [expect.objectContaining({ name: 'Brisas routine' })],
    });
  });

  test('reloads the canonical routine and revision after an Expo provider remount', async () => {
    trainingLibrary.value = { routines: [], mesocycles: [], routinesRevision: 5, mesocyclesRevision: 1 };
    trainingLibrary.saveRoutines.mockImplementationOnce(async (input) => {
      trainingLibrary.value = {
        ...trainingLibrary.value,
        routinesRevision: 6,
        routines: input.items.map((item) => ({ ...item, name: 'Canonical after save' })),
      };
      return { revision: 6, items: trainingLibrary.value.routines };
    });
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => { renderer = TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await act(async () => { await current!.addRoutine('Local draft', ['pecho']); });
    expect(current?.routines[0].name).toBe('Canonical after save');
    await act(async () => { renderer!.unmount(); });
    await act(async () => { renderer = TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await act(async () => { await current!.updateRoutine({ ...current!.routines[0], name: 'After reload' }); });

    expect(trainingLibrary.saveRoutines).toHaveBeenLastCalledWith({
      expectedRevision: 6, items: [expect.objectContaining({ name: 'After reload' })],
    });
  });

  test('exposes a retryable error when remote training hydration fails without local fallback', async () => {
    __resetAppState();
    storage.data.clear();
    storage.data.set('@gymbro/catalog-library/v2/rodaja', JSON.stringify(library()));
    trainingState.load.mockRejectedValueOnce(new Error('offline'));
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });

    expect(current?.dataState).toBe('error');
    expect(current?.hydratedUserId).toBe('rodaja');
    expect(current?.dataError).toBe('offline');
    expect(current?.attempts).toEqual([]);
    expect(current?.sessions).toEqual([]);
  });

  test('retains definition source keys when the definitions-only remote import fails', async () => {
    __resetAppState();
    storage.data.clear();
    storage.data.set('@gymbro/catalog-library/v2/journal', JSON.stringify({
      version: 1,
      libraries: {
        rodaja: {
          definitions: [{
            id: 'custom:rodaja:press', source: { kind: 'custom', owner: 'rodaja', originId: 'press' }, name: 'Press',
            muscleGroups: ['GM-101'], loadMode: 'external-load', loadUnit: 'kg', variant: 'Barra', defaultSets: [],
          }],
        },
      },
    }));
    trainingState.import.mockRejectedValueOnce(new Error('offline'));
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });

    expect(trainingState.import).toHaveBeenCalledOnce();
    expect(storage.data.has('@gymbro/catalog-library/v2/journal')).toBe(true);
    expect(storage.multiRemove).not.toHaveBeenCalled();
    expect(current?.dataState).toBe('error');
  });

  test('imports definitions without running a broad local runtime wipe', async () => {
    const order: string[] = [];
    const definition = {
      id: 'custom:rodaja:press', source: { kind: 'custom', owner: 'rodaja', originId: 'press' }, name: 'Press',
      muscleGroups: ['GM-101'], loadMode: 'external-load', loadUnit: 'kg', variant: 'Barra', defaultSets: [],
    };
    storage.data.set('@gymbro/catalog-library/v2/rodaja', JSON.stringify({ definitions: [definition] }));
    storage.data.set('@gymbro/catalog-library/v2/journal', JSON.stringify({
      version: 1, libraries: { rodaja: { definitions: [definition] } },
    }));
    trainingState.import.mockImplementationOnce(async () => {
      order.push('import:start');
      await Promise.resolve();
      order.push('import:resolved');
    });
    storage.multiRemove.mockImplementationOnce(async (keys: string[]) => {
      order.push('deleted');
      keys.forEach((key) => storage.data.delete(key));
    });
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });

    expect(order).toEqual(['import:start', 'import:resolved']);
    expect(storage.data.has('@gymbro/catalog-library/v2/rodaja')).toBe(true);
    expect(storage.data.has('@gymbro/catalog-library/v2/journal')).toBe(true);
    expect(current?.dataState).toBe('ready');
  });

  test('quarantines an orphaned remote draft before it reaches context consumers', async () => {
    trainingState.value = {
      definitions: [], attempts: [], sessions: [],
      activeWorkoutDraft: {
        version: 1, owner: 'rodaja', attemptId: 'orphan-attempt', routineId: 'deleted-routine',
        startedAtMs: 1, restTimerSeconds: 90, completedSets: {}, setValues: {},
      },
    };
    trainingState.load.mockResolvedValue(trainingState.value);
    storage.data.set('@gymbro/active-workout/v1/rodaja', JSON.stringify(trainingState.value.activeWorkoutDraft));
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });

    expect(current?.activeWorkoutDraft).toBeNull();
    await vi.waitFor(() => expect(trainingState.save).toHaveBeenCalledWith({ activeWorkoutDraft: null }));
    await vi.waitFor(() => expect(storage.data.has('@gymbro/active-workout/v1/rodaja')).toBe(false));
  });

  test('persists rapid active-workout updates in order so the newest rest replaces the previous one', async () => {
    const activeWorkoutDraft = {
      version: 1 as const, owner: 'rodaja' as const, attemptId: 'attempt-1', routineId: 'routine-1',
      startedAtMs: 1, restTimerSeconds: 90, completedSets: {}, setValues: {},
    };
    trainingLibrary.value = { routines: [library().routines[0]], mesocycles: [] };
    trainingState.value = { definitions: [], attempts: [], sessions: [], activeWorkoutDraft };
    trainingState.load.mockResolvedValue(trainingState.value);
    let resolveFirstSave: ((value: undefined) => void) | undefined;
    let resolveSecondSave: ((value: undefined) => void) | undefined;
    trainingState.save
      .mockImplementationOnce(() => new Promise<undefined>((resolve) => { resolveFirstSave = resolve; }))
      .mockImplementationOnce(() => new Promise<undefined>((resolve) => { resolveSecondSave = resolve; }));
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    const first = current!.updateActiveWorkout({ ...activeWorkoutDraft, restEndsAtMs: 1_000 });
    const second = current!.updateActiveWorkout({ ...activeWorkoutDraft, restEndsAtMs: 2_000 });

    await vi.waitFor(() => expect(trainingState.save).toHaveBeenCalledTimes(1));
    expect(trainingState.save).toHaveBeenLastCalledWith({ activeWorkoutDraft: expect.objectContaining({ restEndsAtMs: 1_000 }) });
    resolveFirstSave!(undefined);
    await first;
    await vi.waitFor(() => expect(trainingState.save).toHaveBeenCalledTimes(2));
    expect(trainingState.save).toHaveBeenLastCalledWith({ activeWorkoutDraft: expect.objectContaining({ restEndsAtMs: 2_000 }) });
    resolveSecondSave!(undefined);
    await second;
    expect(current!.activeWorkoutDraft).toMatchObject({ restEndsAtMs: 2_000 });
  });

  test('coalesces deferred active-workout saves to the newest draft', async () => {
    vi.useFakeTimers();
    const activeWorkoutDraft = {
      version: 1 as const, owner: 'rodaja' as const, attemptId: 'attempt-1', routineId: 'routine-1',
      startedAtMs: 1, restTimerSeconds: 90, completedSets: {}, setValues: {},
    };
    trainingLibrary.value = { routines: [library().routines[0]], mesocycles: [] };
    trainingState.value = { definitions: [], attempts: [], sessions: [], activeWorkoutDraft };
    trainingState.load.mockResolvedValue(trainingState.value);
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    const first = current!.updateActiveWorkout({ ...activeWorkoutDraft, restEndsAtMs: 1_000 }, { defer: true });
    const second = current!.updateActiveWorkout({ ...activeWorkoutDraft, restEndsAtMs: 2_000 }, { defer: true });

    expect(trainingState.save).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    await Promise.all([first, second]);
    expect(trainingState.save).toHaveBeenCalledTimes(1);
    expect(trainingState.save).toHaveBeenLastCalledWith({ activeWorkoutDraft: expect.objectContaining({ restEndsAtMs: 2_000 }) });
    expect(current!.activeWorkoutDraft).toMatchObject({ restEndsAtMs: 2_000 });
    vi.useRealTimers();
  });

  test('does not restore a deferred draft after cancelling the workout', async () => {
    vi.useFakeTimers();
    const activeWorkoutDraft = {
      version: 1 as const, owner: 'rodaja' as const, attemptId: 'attempt-1', routineId: 'routine-1',
      startedAtMs: 1, restTimerSeconds: 90, completedSets: {}, setValues: {},
    };
    trainingLibrary.value = { routines: [library().routines[0]], mesocycles: [] };
    trainingState.value = { definitions: [], attempts: [], sessions: [], activeWorkoutDraft };
    trainingState.load.mockResolvedValue(trainingState.value);
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    const pendingSave = current!.updateActiveWorkout({ ...activeWorkoutDraft, restEndsAtMs: 1_000 }, { defer: true });
    await act(async () => { await current!.cancelActiveWorkout(); await vi.advanceTimersByTimeAsync(750); });
    await pendingSave;

    expect(trainingState.save).toHaveBeenCalledTimes(1);
    expect(trainingState.save).toHaveBeenLastCalledWith({ activeWorkoutDraft: null });
    vi.useRealTimers();
  });

  test('recovers the active-workout queue after a save times out without remounting', async () => {
    vi.useFakeTimers();
    const activeWorkoutDraft = {
      version: 1 as const, owner: 'rodaja' as const, attemptId: 'attempt-1', routineId: 'routine-1',
      startedAtMs: 1, restTimerSeconds: 90, completedSets: {}, setValues: {},
    };
    trainingLibrary.value = { routines: [library().routines[0]], mesocycles: [] };
    trainingState.value = { definitions: [], attempts: [], sessions: [], activeWorkoutDraft };
    trainingState.load.mockResolvedValue(trainingState.value);
    trainingState.save.mockImplementationOnce(() => new Promise<undefined>(() => undefined));
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    const firstFailure = current!.updateActiveWorkout({ ...activeWorkoutDraft, restEndsAtMs: 1_000 }).catch((error: unknown) => error);
    await act(async () => { await Promise.resolve(); });
    expect(trainingState.save).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
    const firstError = await firstFailure;
    expect(firstError).toBeInstanceOf(Error);
    expect((firstError as Error).message).toContain('Active workout save timed out');

    await act(async () => { await current!.updateActiveWorkout({ ...activeWorkoutDraft, restEndsAtMs: 2_000 }); });

    expect(trainingState.save).toHaveBeenCalledTimes(2);
    expect(trainingState.save).toHaveBeenLastCalledWith({ activeWorkoutDraft: expect.objectContaining({ restEndsAtMs: 2_000 }) });
    expect(current!.activeWorkoutDraft).toMatchObject({ restEndsAtMs: 2_000 });
    vi.useRealTimers();
  });

  test('re-persists the newest rest after a timed-out stale save settles late', async () => {
    vi.useFakeTimers();
    const activeWorkoutDraft = {
      version: 1 as const, owner: 'rodaja' as const, attemptId: 'attempt-1', routineId: 'routine-1',
      startedAtMs: 1, restTimerSeconds: 90, completedSets: {}, setValues: {},
    };
    trainingLibrary.value = { routines: [library().routines[0]], mesocycles: [] };
    trainingState.value = { definitions: [], attempts: [], sessions: [], activeWorkoutDraft };
    trainingState.load.mockResolvedValue(trainingState.value);
    let resolveFirstSave: ((value: undefined) => void) | undefined;
    let remoteRestEndsAtMs: number | undefined;
    const saveCalls = trainingState.save.mock.calls as unknown as Array<[{ activeWorkoutDraft?: { restEndsAtMs?: number } }]>;
    trainingState.save
      .mockImplementationOnce(() => new Promise<undefined>((resolve) => {
        resolveFirstSave = (value) => {
          remoteRestEndsAtMs = saveCalls[0][0].activeWorkoutDraft?.restEndsAtMs;
          resolve(value);
        };
      }))
      .mockImplementation(() => {
        remoteRestEndsAtMs = saveCalls.at(-1)![0].activeWorkoutDraft?.restEndsAtMs;
        return Promise.resolve(undefined);
      });
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    const firstFailure = current!.updateActiveWorkout({ ...activeWorkoutDraft, restEndsAtMs: 1_000 }).catch((error: unknown) => error);
    await act(async () => { await Promise.resolve(); await vi.advanceTimersByTimeAsync(12_000); });
    await firstFailure;

    await act(async () => { await current!.updateActiveWorkout({ ...activeWorkoutDraft, restEndsAtMs: 2_000 }); });
    expect(remoteRestEndsAtMs).toBe(2_000);

    resolveFirstSave!(undefined);
    await vi.waitFor(() => expect(trainingState.save).toHaveBeenCalledTimes(3));
    expect(trainingState.save).toHaveBeenLastCalledWith({ activeWorkoutDraft: expect.objectContaining({ restEndsAtMs: 2_000 }) });
    expect(remoteRestEndsAtMs).toBe(2_000);
    vi.useRealTimers();
  });
  test('associates only the captured active attempt and preserves latest draft fields', async () => {
    const activeWorkoutDraft = { version: 1 as const, owner: 'rodaja', attemptId: 'attempt-1', routineId: 'routine-1', startedAtMs: 1, restTimerSeconds: 90, completedSets: {}, setValues: {} };
    trainingLibrary.value = { routines: [library().routines[0]], mesocycles: [] };
    trainingState.value = { definitions: [], attempts: [], sessions: [], activeWorkoutDraft };
    trainingState.load.mockResolvedValue(trainingState.value);
    let current: ReturnType<typeof useData>;
    const Probe = () => { current = useData(); return null; };
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await act(async () => {
      await current!.updateActiveWorkout({ ...activeWorkoutDraft, pausedAtMs: 5 });
      await current!.associateActiveWorkoutJoint('rodaja', 'older-attempt', 'wrong');
      await current!.associateActiveWorkoutJoint('other-owner', 'attempt-1', 'wrong');
      await current!.associateActiveWorkoutJoint('rodaja', 'attempt-1', 'canonical');
    });
    expect(current!.activeWorkoutDraft).toMatchObject({ attemptId: 'attempt-1', pausedAtMs: 5, jointWorkoutId: 'canonical' });
    await act(async () => {
      await current!.updateActiveWorkout({ ...current!.activeWorkoutDraft!, jointCancellationPending: true });
      await current!.associateActiveWorkoutJoint('rodaja', 'attempt-1', 'must-not-change');
    });
    expect(current!.activeWorkoutDraft).toMatchObject({ jointWorkoutId: 'canonical', jointCancellationPending: true });
    await act(async () => tree!.unmount());
  });

  test('restores durable solo work offline, saves keystrokes and never cleans expired/missing plans', async () => {
    const draft = { version: 1, owner: 'rodaja', attemptId: 'offline-a', routineId: 'routine-1', startedAtMs: 1, restTimerSeconds: 30, completedSets: {}, setValues: {}, routineSnapshot: library().routines[0] };
    const key = 'gymbro:offline-workout:v1:rodaja';
    storage.data.set(key, JSON.stringify({version:1,owner:'rodaja',sequence:1,acknowledged:0,base:draft,draft}));
    trainingState.load.mockRejectedValue(new TypeError('Failed to fetch'));
    let current: ReturnType<typeof useData>; const Probe = () => { current = useData(); return null; };
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    expect(current!.offlineWorkoutEnabled).toBe(true); expect(current!.activeWorkoutDraft?.attemptId).toBe('offline-a');
    expect(current!.dataState).toBe('error'); expect(current!.routines).toEqual([]);
    await act(async () => {
      await current!.updateActiveWorkout({...current!.activeWorkoutDraft!,setValues:{'e-s':{weight:'25.',reps:''}}},{defer:true});
      await current!.refreshActiveWorkoutTiming();
      await current!.clearActiveWorkoutIfMatches({owner:'rodaja',routineId:'routine-1'});
    });
    expect(JSON.parse(storage.data.get(key)!).draft.setValues).toEqual({'e-s':{weight:'25.',reps:''}});
    expect(current!.activeWorkoutDraft).not.toBeNull(); expect(trainingState.save).not.toHaveBeenCalled();
    await act(async () => tree!.unmount());
    await act(async () => { tree = TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    expect(current!.activeWorkoutDraft?.setValues['e-s'].weight).toBe('25.');
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    await act(async () => { await expect(current!.updateActiveWorkout({...current!.activeWorkoutDraft!,restTimerSeconds:60})).rejects.toThrow('disk full'); });
    expect(current!.offlineWorkoutStatus).toBe('local-error');
    authState.user = 'other-owner';
    await act(async () => tree!.update(React.createElement(DataProvider, null, React.createElement(Probe))));
    expect(current!.activeWorkoutDraft).toBeNull(); expect(storage.data.has(key)).toBe(true);
    await act(async () => tree!.unmount());
  });

  test('reconciles persisted completion through provider with server-only receipts and no blind state save', async () => {
    const routine = library().routines[0];
    const attempt = createWorkoutAttempt({id:'offline-completion',owner:'rodaja',routine,completedAt:'2026-09-09T12:00:00Z',durationSeconds:60,restTimerSeconds:30,results:{}});
    const draft = {version:1,owner:'rodaja',attemptId:attempt.id,routineId:routine.id,startedAtMs:1,restTimerSeconds:30,completedSets:{},setValues:{},routineSnapshot:routine,pendingFinalization:{attempt}};
    const key='gymbro:offline-workout:v1:rodaja';
    storage.data.set(key,JSON.stringify({version:1,owner:'rodaja',sequence:1,acknowledged:0,base:{...draft,pendingFinalization:undefined},draft}));
    trainingState.load.mockRejectedValue(new TypeError('Failed to fetch'));
    offlineRpc.mockResolvedValue({error:null,data:{status:'saved',draft:null,finalized:{attempt,receipt:{balance:13,entries:[],weekly:{}},experience_receipt:{attempt_id:attempt.id,earned_xp:4,entries:[],progress:{level:1,rank:'Principiante',xp_into_level:4,xp_for_next_level:100,total_xp:4}}}}});
    let current: ReturnType<typeof useData>; const Probe=()=>{current=useData();return null;};
    let tree: TestRenderer.ReactTestRenderer;
    await act(async()=>{tree=TestRenderer.create(React.createElement(DataProvider,null,React.createElement(Probe)));});
    expect(current!.attempts).not.toContainEqual(attempt);
    await act(async()=>{await current!.retryOfflineWorkout();});
    expect(current!.attempts.filter((value)=>value.id===attempt.id)).toHaveLength(1);
    expect(current!.experienceProgress?.totalXp).toBe(4);
    expect(current!.offlineWorkoutResult?.receipt.balance).toBe(13);
    expect(storage.data.has(key)).toBe(false);expect(trainingState.save).not.toHaveBeenCalled();
    expect(offlineRpc.mock.calls[0]).toEqual(['sync_offline_workout',expect.objectContaining({attempt_input:attempt})]);
    await act(async()=>tree!.unmount());
  });

  test('late cancellation for owner A cannot clear owner B projection',async()=>{
    const make=(owner:string)=>({version:1,owner,attemptId:owner,routineId:'routine-1',startedAtMs:1,restTimerSeconds:30,completedSets:{},setValues:{},routineSnapshot:library().routines[0]});
    for(const owner of ['rodaja','brisas']){const draft=make(owner);storage.data.set(`gymbro:offline-workout:v1:${owner}`,JSON.stringify({version:1,owner,sequence:0,acknowledged:0,base:draft,draft}));}
    trainingState.load.mockRejectedValue(new TypeError('Failed to fetch'));
    let current:ReturnType<typeof useData>;const Probe=()=>{current=useData();return null;};let tree:TestRenderer.ReactTestRenderer;
    await act(async()=>{tree=TestRenderer.create(React.createElement(DataProvider,null,React.createElement(Probe)));});
    let release!:()=>void,started!:()=>void;const began=new Promise<void>(resolve=>{started=resolve;});
    storage.setItem.mockImplementationOnce(async(key,value)=>{started();await new Promise<void>(resolve=>{release=resolve;});storage.data.set(key,value);});
    let cancellation!:Promise<void>;await act(async()=>{cancellation=current!.cancelActiveWorkout();await began;});
    authState.user='brisas';await act(async()=>tree!.update(React.createElement(DataProvider,null,React.createElement(Probe))));
    expect(current!.activeWorkoutDraft?.owner).toBe('brisas');
    await act(async()=>{release();await cancellation;});expect(current!.activeWorkoutDraft?.owner).toBe('brisas');
    await act(async()=>tree!.unmount());
  });

  test('retry persists latest optimistic input after older ACK and a local write failure',async()=>{
    const base={version:1,owner:'rodaja',attemptId:'local-failure',routineId:'routine-1',startedAtMs:1,restTimerSeconds:30,completedSets:{},setValues:{},routineSnapshot:library().routines[0]},draft={...base,restTimerSeconds:40};
    storage.data.set('gymbro:offline-workout:v1:rodaja',JSON.stringify({version:1,owner:'rodaja',sequence:1,acknowledged:0,base,draft}));
    trainingState.load.mockRejectedValue(new TypeError('Failed to fetch'));
    let release!:(value:any)=>void,started!:()=>void;const began=new Promise<void>(resolve=>{started=resolve;});
    offlineRpc.mockImplementationOnce(async()=>{started();return new Promise(resolve=>{release=resolve;});});
    let current:ReturnType<typeof useData>;const Probe=()=>{current=useData();return null;};let tree:TestRenderer.ReactTestRenderer;
    await act(async()=>{tree=TestRenderer.create(React.createElement(DataProvider,null,React.createElement(Probe)));});
    let syncing!:Promise<void>;await act(async()=>{syncing=current!.retryOfflineWorkout();await began;});
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    await act(async()=>{await expect(current!.updateActiveWorkout({...draft,restTimerSeconds:50} as any)).rejects.toThrow('disk full');});
    await act(async()=>{release({error:null,data:{status:'saved',draft}});await syncing;});
    expect(current!.offlineWorkoutStatus).toBe('local-error');expect(current!.activeWorkoutDraft?.restTimerSeconds).toBe(50);
    offlineRpc.mockResolvedValueOnce({error:null,data:{status:'saved',draft:{...draft,restTimerSeconds:50}}});
    await act(async()=>{await current!.retryOfflineWorkout();});
    expect(JSON.parse(storage.data.get('gymbro:offline-workout:v1:rodaja')!).draft.restTimerSeconds).toBe(50);
    expect(current!.offlineWorkoutStatus).toBe('saved');await act(async()=>tree!.unmount());
  });


  test.each([false, true])('hydrates clean journal from canonical progress or completion (%s)', async (finished) => {
    const base = { version: 1, owner: 'rodaja', attemptId: 'handoff', routineId: 'routine-1', startedAtMs: 1, restTimerSeconds: 30, completedSets: {}, setValues: {}, routineSnapshot: library().routines[0] };
    storage.data.set('gymbro:offline-workout:v1:rodaja', JSON.stringify({ version: 1, owner: 'rodaja', sequence: 2, acknowledged: 2, base, draft: base }));
    const remote = finished ? null : { ...base, restTimerSeconds: 70, completedSets: { 'routine-exercise-1-set-1': true } };
    trainingState.load.mockResolvedValue({ ...trainingState.value, activeWorkoutDraft: remote });
    let current: ReturnType<typeof useData>;
    const Probe = () => { current = useData(); return null; };
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    expect(current!.activeWorkoutDraft).toEqual(remote);
    expect(trainingState.save).not.toHaveBeenCalled();
    await act(async () => tree!.unmount());
  });

  test('foreground reconciliation cannot discard edits entered during its network read', async () => {
    const base = { version: 1 as const, owner: 'rodaja', attemptId: 'handoff', routineId: 'routine-1', startedAtMs: 1, restTimerSeconds: 30, completedSets: {}, setValues: {}, routineSnapshot: library().routines[0] };
    storage.data.set('gymbro:offline-workout:v1:rodaja', JSON.stringify({ version: 1, owner: 'rodaja', sequence: 0, acknowledged: 0, base, draft: base }));
    trainingState.load.mockResolvedValue({ ...trainingState.value, activeWorkoutDraft: base });
    let current: ReturnType<typeof useData>;
    const Probe = () => { current = useData(); return null; };
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    let release!: (state: typeof trainingState.value) => void;
    trainingState.load.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    await act(async () => __emitAppState('active'));
    const local = { ...base, restTimerSeconds: 80 };
    await act(async () => { await current!.updateActiveWorkout(local); });
    await act(async () => { release({ ...trainingState.value, activeWorkoutDraft: null }); });
    expect(current!.activeWorkoutDraft).toEqual(local);
    expect(current!.offlineWorkoutStatus).toBe('pending');
    await act(async () => tree!.unmount());
  });

  test('foreground adopts remote cancellation and repeated saves continue beyond three updates', async () => {
    vi.useFakeTimers();
    const base = { version: 1 as const, owner: 'rodaja', attemptId: 'handoff', routineId: 'routine-1', startedAtMs: 1, restTimerSeconds: 30, completedSets: {}, setValues: {}, routineSnapshot: library().routines[0] };
    storage.data.set('gymbro:offline-workout:v1:rodaja', JSON.stringify({ version: 1, owner: 'rodaja', sequence: 0, acknowledged: 0, base, draft: base }));
    trainingState.load.mockResolvedValue({ ...trainingState.value, activeWorkoutDraft: base });
    offlineRpc.mockImplementation(async (name?: string, input?: any) => name === 'offline_workout_capability' ? { data: 1, error: null } : { data: { status: 'saved', draft: input.next_draft }, error: null });
    let current: ReturnType<typeof useData>;
    const Probe = () => { current = useData(); return null; };
    let tree: TestRenderer.ReactTestRenderer;
    try {
      await act(async () => { tree = TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
      for (let index = 0; index < 5; index += 1) {
        await act(async () => { await current!.updateActiveWorkout({ ...base, restTimerSeconds: 40 + index }); });
        await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
        expect(current!.offlineWorkoutStatus).toBe('saved');
      }
      expect(offlineRpc.mock.calls.filter(([name]) => name === 'sync_offline_workout')).toHaveLength(5);
      trainingState.load.mockResolvedValue({ ...trainingState.value, activeWorkoutDraft: null });
      await act(async () => __emitAppState('active'));
      expect(current!.activeWorkoutDraft).toBeNull();
      expect(current!.activeWorkoutRemoteRevision).toBeGreaterThan(0);
    } finally {
      await act(async () => tree!.unmount());
      vi.useRealTimers();
    }
  });

  test('start adopts the canonical existing attempt rather than the requested draft', async () => {
    const requested = { version: 1 as const, owner: 'rodaja', attemptId: 'new', routineId: 'routine-1', startedAtMs: 1, restTimerSeconds: 30, completedSets: {}, setValues: {}, routineSnapshot: library().routines[0] };
    const canonical = { ...requested, attemptId: 'remote-existing', restTimerSeconds: 95 };
    trainingState.start.mockResolvedValueOnce(canonical);
    let current: ReturnType<typeof useData>;
    const Probe = () => { current = useData(); return null; };
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await act(async () => { expect(await current!.startActiveWorkout(requested)).toEqual(canonical); });
    expect(current!.activeWorkoutDraft).toEqual(canonical);
    expect(trainingState.save).not.toHaveBeenCalled();
    await act(async () => tree!.unmount());
  });

  test('late start response from another account cannot seed or display its draft', async () => {
    const requested = { version: 1 as const, owner: 'rodaja', attemptId: 'late-start', routineId: 'routine-1', startedAtMs: 1, restTimerSeconds: 30, completedSets: {}, setValues: {}, routineSnapshot: library().routines[0] };
    let release!: (draft: typeof requested) => void;
    trainingState.start.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    let current: ReturnType<typeof useData>;
    const Probe = () => { current = useData(); return null; };
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    let start!: Promise<unknown>;
    await act(async () => { start = current!.startActiveWorkout(requested).catch((error) => error); });
    authState.user = 'brisas';
    await act(async () => tree!.update(React.createElement(DataProvider, null, React.createElement(Probe))));
    await act(async () => { release(requested); expect(await start).toBeInstanceOf(Error); });
    expect(current!.activeWorkoutDraft).toBeNull();
    expect(storage.data.has('gymbro:offline-workout:v1:brisas')).toBe(false);
    await act(async () => tree!.unmount());
  });

  test('acknowledges solo edits before claiming, then associates and saves through online CAS', async () => {
    const base = { version: 1 as const, owner: 'rodaja', attemptId: 'online', routineId: 'routine-1', startedAtMs: 1, restTimerSeconds: 30, completedSets: {}, setValues: {}, routineSnapshot: library().routines[0] };
    storage.data.set('gymbro:offline-workout:v1:rodaja', JSON.stringify({ version: 1, owner: 'rodaja', sequence: 0, acknowledged: 0, base, draft: base }));
    trainingState.load.mockResolvedValue({ ...trainingState.value, activeWorkoutDraft: base });
    offlineRpc.mockImplementation(async (name: string, input?: any) => {
      if (name === 'offline_workout_capability') return { data: 1, error: null };
      if (name === 'claim_online_workout') return { data: { status: 'claimed', draft: { ...input.expected_draft, transportMode: 'online' } }, error: null };
      return { data: { status: 'saved', draft: input.next_draft }, error: null };
    });
    let current: ReturnType<typeof useData>;
    const Probe = () => { current = useData(); return null; };
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await act(async () => { await current!.updateActiveWorkout({ ...base, restTimerSeconds: 60 }); });
    await act(async () => { await current!.prepareOnlineWorkout(); });
    const calls = offlineRpc.mock.calls.map(([name]) => name);
    expect(calls.indexOf('sync_offline_workout')).toBeLessThan(calls.indexOf('claim_online_workout'));
    expect(current!.activeWorkoutDraft).toMatchObject({ transportMode: 'online', restTimerSeconds: 60 });
    await act(async () => { await current!.associateActiveWorkoutJoint('rodaja', 'online', 'canonical'); });
    expect(offlineRpc).toHaveBeenLastCalledWith('sync_online_workout', expect.objectContaining({ next_draft: expect.objectContaining({ jointWorkoutId: 'canonical', transportMode: 'online' }) }));
    expect(trainingState.save).not.toHaveBeenCalled();
    await act(async () => tree!.unmount());
  });

  test.each(['claim', 'cancel'] as const)('projects a retried ambiguous online %s only after acknowledgment', async (command) => {
    const base = { version: 1 as const, owner: 'rodaja', attemptId: 'online-retry', routineId: 'routine-1', startedAtMs: 1, restTimerSeconds: 30, completedSets: {}, setValues: {}, routineSnapshot: library().routines[0], ...(command === 'cancel' ? { transportMode: 'online' as const } : {}) };
    storage.data.set('gymbro:offline-workout:v1:rodaja', JSON.stringify({ version: 1, owner: 'rodaja', sequence: 0, acknowledged: 0, base, draft: base, transport: command === 'cancel' ? 'online' : 'offline' }));
    trainingState.load.mockResolvedValue({ ...trainingState.value, activeWorkoutDraft: base });
    let fail = true;
    offlineRpc.mockImplementation(async (name: string, input?: any) => {
      if (name === 'offline_workout_capability') return { data: 1, error: null };
      if (fail) { fail = false; throw new TypeError('Failed to fetch'); }
      if (name === 'claim_online_workout') return { data: { status: 'claimed', draft: { ...input.expected_draft, transportMode: 'online' } }, error: null };
      return { data: { status: 'saved', draft: null, cancelled: true }, error: null };
    });
    let current: ReturnType<typeof useData>;
    const Probe = () => { current = useData(); return null; };
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await act(async () => { await expect(command === 'claim' ? current!.prepareOnlineWorkout() : current!.cancelActiveWorkout()).rejects.toThrow(); });
    expect(current!.activeWorkoutDraft).toEqual(base);
    await act(async () => { await current!.retryOfflineWorkout(); });
    if (command === 'claim') expect(current!.activeWorkoutDraft?.transportMode).toBe('online');
    else expect(current!.activeWorkoutDraft).toBeNull();
    expect(trainingState.save).not.toHaveBeenCalled();
    await act(async () => tree!.unmount());
  });

});
