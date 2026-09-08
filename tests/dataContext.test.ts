import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CatalogLibrary } from '../types';

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
  import: vi.fn(async () => undefined),
  experience: vi.fn(async () => ({ level: 1, rank: 'Principiante', xpIntoLevel: 0, xpForNextLevel: 100, totalXp: 0 })),
}));
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
vi.mock('../services/trainingState', () => ({
  loadTrainingState: trainingState.load,
  saveTrainingState: trainingState.save,
  importLegacyCustomDefinitions: trainingState.import,
  loadExperienceProgress: trainingState.experience,
  finalizeTrainingAttempt: finalizeAttempt,
}));
vi.mock('../services/experience', () => ({
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
    storage.data.clear();
    vi.clearAllMocks();
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

  test('marks a mesocycle completed when its final eligible session is accredited', async () => {
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
});
