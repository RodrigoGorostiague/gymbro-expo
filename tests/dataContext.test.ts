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

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: 'rodaja' }) }));
vi.mock('../services/catalog', () => ({
  loadCatalogExercises: vi.fn(async () => [{ id: 'EX-0001', name: 'Press banca', muscleGroups: ['GM-101'], variant: 'Barra', defaultSets: [] }]),
  loadCatalogMuscleGroups: vi.fn(async () => [{ id: 'GM-101', name: 'Pectoral mayor', displayName: 'Pectoral mayor', type: 'Músculo', level: 3, visibleInFilters: true, path: 'Cuerpo > Pecho > Pectoral mayor' }]),
  filterCatalogExercises: vi.fn(),
}));
vi.mock('../services/trainingLibrary', () => ({
  loadTrainingLibrary: vi.fn(async () => ({ routines: [], mesocycles: [] })),
  saveTrainingRoutines: vi.fn(async () => undefined),
  saveTrainingMesocycles: vi.fn(async () => undefined),
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
    storage.data.set('@gymbro/catalog-library/v2/rodaja', JSON.stringify(library()));
    storage.data.set('@gymbro/catalog-library/v2/brisas', JSON.stringify({ ...library(), owner: 'brisas' }));
  });

  test('resets the legacy owner library and publishes the remote normalized catalog', async () => {
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });

    expect(current?.dataState).toBe('ready');
    expect(current?.definitions).toEqual([]);
    expect(current?.exercises[0]).toMatchObject({ id: 'EX-0001', muscleGroups: ['GM-101'] });
    expect(current?.catalogMuscleGroups).toHaveLength(1);
    expect(current?.routines).toEqual([]);
  });

  test('rejects a recipient-mismatched import before it can publish state', async () => {
    let current: ReturnType<typeof useData> | undefined;
    const Probe = () => { current = useData(); return null; };
    await act(async () => { TestRenderer.create(React.createElement(DataProvider, null, React.createElement(Probe))); });

    await expect(current!.importCatalogContent({ recipient: 'brisas', definitions: [], routines: [], mesocycles: [] }))
      .rejects.toThrow('perfil activo');
    expect(current?.routines).toHaveLength(0);
  });
});
