import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Exercise } from '../types';

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  const failures = new Map<string, number>();
  return {
    data,
    failures,
    getItem: vi.fn(async (key: string) => data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      const remaining = failures.get(key) ?? 0;
      if (remaining > 0) {
        failures.set(key, remaining - 1);
        throw new Error(`write failed: ${key}`);
      }
      data.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => { data.delete(key); }),
  };
});

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));

import {
  addCatalogExercise,
  assertRoutineMutationReady,
  createCatalogVariant,
  deleteCatalogVariant,
  loadExerciseCatalog,
  loadCatalogWithRoutines,
  renameCatalogVariant,
  updateCatalogExercise,
} from '../utils/storage';

const CATALOG_KEY = '@gymbro/exercise-catalog/v1';
const LEGACY_KEY = '@gymbro/exercises';

const exercise = (id: string, name: string, variant: string): Exercise => ({
  id,
  name,
  variant,
  muscleGroups: ['pecho'],
  defaultSets: [],
});

beforeEach(() => {
  storage.data.clear();
  storage.failures.clear();
  vi.clearAllMocks();
});

describe('global exercise variant catalog', () => {
  test('loads routines independently and blocks mutation before routine initialization', async () => {
    const routines = [{ id: 'routine', name: 'Saved routine', exercises: [] }];
    storage.data.set(CATALOG_KEY, '{"version":1,"variants":[],"exercises":[]}');
    storage.data.set('@gymbro/routines', JSON.stringify(routines));

    const loaded = await loadCatalogWithRoutines();

    expect(loaded.catalog).toBeNull();
    expect(loaded.catalogError).toBeInstanceOf(Error);
    expect(loaded.routines).toEqual([{ ...routines[0], muscleGroups: [] }]);
    expect(() => assertRoutineMutationReady(false)).toThrow('aún no terminaron de cargar');
    expect(storage.setItem).not.toHaveBeenCalledWith('@gymbro/routines', expect.anything());
  });

  test('bootstraps defaults and discovered legacy variants without changing the legacy key', async () => {
    const legacy = JSON.stringify([
      exercise('one', 'Press', 'barra'),
      exercise('two', 'Machine press', '  máquina   guiada  '),
    ]);
    storage.data.set(LEGACY_KEY, legacy);

    const catalog = await loadExerciseCatalog();

    expect(catalog.variants).toEqual(['barra', 'mancuernas', 'polea', 'libre', 'máquina guiada']);
    expect(catalog.exercises.map(({ variant }) => variant)).toEqual(['barra', 'máquina guiada']);
    expect(storage.data.get(LEGACY_KEY)).toBe(legacy);
    expect(JSON.parse(storage.data.get(CATALOG_KEY)!)).toEqual(catalog);
  });

  test('does not reinsert defaults after the versioned catalog exists', async () => {
    storage.data.set(CATALOG_KEY, JSON.stringify({
      version: 1,
      variants: ['personalizada'],
      exercises: [],
    }));

    await expect(loadExerciseCatalog()).resolves.toEqual({
      version: 1,
      variants: ['personalizada'],
      exercises: [],
    });
  });

  test('normalizes names, rejects duplicate collisions, and permits case-only rename', async () => {
    await loadExerciseCatalog();
    await expect(createCatalogVariant('   ')).rejects.toThrow('no puede estar vacío');
    await expect(createCatalogVariant('x'.repeat(41))).rejects.toThrow('40 caracteres');
    await expect(createCatalogVariant('  Ma\u0301quina   guiada  '))
      .resolves.toMatchObject({ result: 'Máquina guiada' });
    await expect(createCatalogVariant('máquina GUIADA')).rejects.toThrow('ya existe');

    await addCatalogExercise({
      name: 'Press',
      variant: 'barra',
      muscleGroups: ['pecho'],
      defaultSets: [],
    });
    const renamed = await renameCatalogVariant('barra', 'BARRA');

    expect(renamed.result).toBe('BARRA');
    expect(renamed.catalog.exercises[0].variant).toBe('BARRA');
    await expect(renameCatalogVariant('barra', 'otra')).rejects.toThrow('ya no existe');
  });

  test('renames catalog exercises atomically without rewriting routine snapshots', async () => {
    const routineSnapshot = JSON.stringify([{
      id: 'routine',
      exercises: [{ id: 'snapshot', name: 'Press', variant: 'barra', sets: [] }],
    }]);
    storage.data.set(LEGACY_KEY, JSON.stringify([exercise('one', 'Press', 'barra')]));
    storage.data.set('@gymbro/routines', routineSnapshot);

    await renameCatalogVariant('barra', 'barra olímpica');
    const persisted = JSON.parse(storage.data.get(CATALOG_KEY)!);

    expect(persisted.variants).toContain('barra olímpica');
    expect(persisted.exercises[0].variant).toBe('barra olímpica');
    expect(storage.data.get('@gymbro/routines')).toBe(routineSnapshot);
    expect(storage.setItem).not.toHaveBeenCalledWith('@gymbro/routines', expect.anything());
  });

  test('blocks in-use and final variant deletion with actionable details', async () => {
    storage.data.set(LEGACY_KEY, JSON.stringify([
      exercise('one', 'Press banca', 'barra'),
      exercise('two', 'Sentadilla', 'barra'),
    ]));
    await loadExerciseCatalog();

    await expect(deleteCatalogVariant('barra'))
      .rejects.toThrow('la usan 2 ejercicios (Press banca, Sentadilla)');

    storage.data.set(CATALOG_KEY, JSON.stringify({
      version: 1,
      variants: ['única'],
      exercises: [],
    }));
    await expect(deleteCatalogVariant('única')).rejects.toThrow('al menos una variante');
  });

  test('deletes an unused non-final variant', async () => {
    await loadExerciseCatalog();
    const deleted = await deleteCatalogVariant('polea');

    expect(deleted.catalog.variants).not.toContain('polea');
    await expect(loadExerciseCatalog()).resolves.toEqual(deleted.catalog);
  });

  test('serializes queued mutations and recovers after a failed write', async () => {
    await loadExerciseCatalog();
    const first = createCatalogVariant('primera');
    const second = createCatalogVariant('segunda');
    await Promise.all([first, second]);
    expect((await loadExerciseCatalog()).variants).toEqual(expect.arrayContaining(['primera', 'segunda']));

    const latestCheck = createCatalogVariant('cola única');
    const collidingLatestCheck = createCatalogVariant('COLA ÚNICA');
    await expect(latestCheck).resolves.toMatchObject({ result: 'cola única' });
    await expect(collidingLatestCheck).rejects.toThrow('ya existe');

    storage.failures.set(CATALOG_KEY, 1);
    await expect(createCatalogVariant('perdida')).rejects.toThrow('write failed');
    expect((await loadExerciseCatalog()).variants).not.toContain('perdida');
    await expect(createCatalogVariant('recuperada')).resolves.toMatchObject({ result: 'recuperada' });
  });

  test('preserves malformed stored bytes instead of overwriting them', async () => {
    const malformedCatalog = '{"version":1,"variants":[],"exercises":[]}';
    storage.data.set(CATALOG_KEY, malformedCatalog);
    await expect(loadExerciseCatalog()).rejects.toThrow('no es válido');
    expect(storage.data.get(CATALOG_KEY)).toBe(malformedCatalog);

    storage.data.delete(CATALOG_KEY);
    const malformedLegacy = '{not-json';
    storage.data.set(LEGACY_KEY, malformedLegacy);
    await expect(loadExerciseCatalog()).rejects.toThrow();
    expect(storage.data.get(LEGACY_KEY)).toBe(malformedLegacy);
    expect(storage.data.has(CATALOG_KEY)).toBe(false);
  });

  test('rejects unknown variants on exercise creation and update', async () => {
    await loadExerciseCatalog();
    await expect(addCatalogExercise({
      name: 'Unknown',
      variant: 'inexistente',
      muscleGroups: ['pecho'],
      defaultSets: [],
    })).rejects.toThrow('no existe');

    const created = await addCatalogExercise({
      name: 'Known',
      variant: 'libre',
      muscleGroups: ['pecho'],
      defaultSets: [],
    });
    await expect(updateCatalogExercise({ ...created.result, variant: 'inexistente' }))
      .rejects.toThrow('no existe');
    expect((await loadExerciseCatalog()).exercises[0].variant).toBe('libre');
  });
});
