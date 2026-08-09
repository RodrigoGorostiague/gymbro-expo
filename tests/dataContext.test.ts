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
  value: { routines: [] as any[], mesocycles: [] as any[] },
  saveMesocycles: vi.fn(async () => undefined),
  saveRoutines: vi.fn(async () => undefined),
}));
const trainingState = vi.hoisted(() => ({
  value: { definitions: [] as any[], attempts: [] as any[], sessions: [] as any[], activeWorkoutDraft: null as any },
  load: vi.fn(async () => trainingState.value),
  save: vi.fn(async () => undefined),
  import: vi.fn(async () => undefined),
  experience: vi.fn(async () => ({ level: 1, rank: 'Principiante', xpIntoLevel: 0, xpForNextLevel: 100, totalXp: 0 })),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: 'rodaja' }) }));
vi.mock('../services/catalog', () => ({
  loadCatalogExercises: vi.fn(async () => [{ id: 'EX-0001', name: 'Press banca', muscleGroups: ['GM-101'], variant: 'Barra', defaultSets: [] }]),
  loadCatalogMuscleGroups: vi.fn(async () => [{ id: 'GM-101', name: 'Pectoral mayor', displayName: 'Pectoral mayor', type: 'Músculo', level: 3, visibleInFilters: true, path: 'Cuerpo > Pecho > Pectoral mayor' }]),
  filterCatalogExercises: vi.fn(),
}));
vi.mock('../services/trainingLibrary', () => ({
  loadTrainingLibrary: vi.fn(async () => trainingLibrary.value),
  saveTrainingLibrary: vi.fn(async () => undefined),
  saveTrainingRoutines: trainingLibrary.saveRoutines,
  saveTrainingMesocycles: trainingLibrary.saveMesocycles,
}));
vi.mock('../services/trainingState', () => ({
  loadTrainingState: trainingState.load,
  saveTrainingState: trainingState.save,
  importLegacyCustomDefinitions: trainingState.import,
  loadExperienceProgress: trainingState.experience,
  finalizeTrainingAttempt: vi.fn(),
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
    trainingLibrary.value = { routines: [], mesocycles: [] };
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

    expect(trainingLibrary.saveMesocycles).toHaveBeenCalledWith([]);
    expect(current?.mesocycles).toEqual([]);
    expect(current?.dataState).toBe('ready');
    expect(current?.isLoading).toBe(false);
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

  test('exposes a retryable error when remote training hydration fails without local fallback', async () => {
    storage.data.clear();
    storage.data.set('@gymbro/catalog-library/v2/rodaja', JSON.stringify(library()));
    trainingState.load.mockRejectedValueOnce(new Error('offline'));
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });

    expect(current?.dataState).toBe('error');
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
});
