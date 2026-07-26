import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  changeText,
  findButton,
  findInputs,
  findText,
  findTextsContaining,
  press,
  render,
  resetRuntimeHarness,
  setMockData,
  setMockParams,
} from './helpers/runtimeHarness';
import ExerciseFormScreen from '../app/exercise/create';
import ExercisesScreen from '../app/(tabs)/exercises/index';
import EditRoutineScreen from '../app/routine/[id]';
import { Exercise } from '../types';
import { normalizeDecimalInput } from '../utils/decimalInput';

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

const findPressableByText = (root: any, text: string) => root.find(
  (node: any) => (node.type as any) === 'HapticPressable'
    && node.findAll(
      (child: any) => (child.type as any) === 'Text' && child.children.join('') === text,
    ).length > 0,
);

const findByTestId = (root: any, testID: string) => root.find((node: any) => node.props?.testID === testID);

beforeEach(() => {
  storage.data.clear();
  storage.failures.clear();
  vi.clearAllMocks();
  resetRuntimeHarness();
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

  test('normalizes decimal weight drafts and persists numeric kilograms on commit', async () => {
    expect(normalizeDecimalInput('2.5')).toBe(2.5);
    expect(normalizeDecimalInput('2,5')).toBe(2.5);
    expect(normalizeDecimalInput('2.')).toBe(2);
    expect(normalizeDecimalInput('.5')).toBe(0.5);
    expect(normalizeDecimalInput('')).toBeNull();

    await loadExerciseCatalog();
    const created = await addCatalogExercise({
      name: 'Weighted Press',
      variant: 'libre',
      muscleGroups: ['pecho'],
      defaultSets: [{ id: 'set-1', tipo: 1, weight: normalizeDecimalInput('2,5')!, reps: 8 }],
    });

    await updateCatalogExercise({
      ...created.result,
      defaultSets: [{ ...created.result.defaultSets[0], weight: normalizeDecimalInput('.5')!, reps: 10 }],
    });

    expect((await loadExerciseCatalog()).exercises[0].defaultSets[0].weight).toBe(0.5);
  });

  test('keeps decimal draft text visible in the exercise editor until save', async () => {
    const updateExercise = vi.fn(async () => undefined);
    setMockParams({ exerciseId: 'exercise-1' });
    setMockData({
      addExercise: vi.fn(),
      createVariant: vi.fn(),
      deleteVariant: vi.fn(),
      getExercise: vi.fn(() => ({
        id: 'exercise-1',
        name: 'Weighted Press',
        variant: 'libre',
        muscleGroups: ['pecho'],
        attribution: { primary: 'pecho', secondary: [] },
        defaultSets: [{ id: 'set-1', tipo: 1, weight: 2.5, reps: 8 }],
      })),
      renameVariant: vi.fn(),
      updateExercise,
      variants: ['libre'],
    });

    const screen = render(React.createElement(ExerciseFormScreen));
    const [weightInput] = findInputs(screen.root, (node) => node.props.keyboardType === 'decimal-pad');
    expect(weightInput.props.value).toBe('2.5');

    changeText(weightInput, '2.');
    const [draftInput] = findInputs(screen.root, (node) => node.props.keyboardType === 'decimal-pad');
    expect(draftInput.props.value).toBe('2.');

    changeText(draftInput, '.5');
    const saveButton = findButton(screen.root, 'Guardar cambios');
    await Promise.resolve(saveButton.props.onPress());

    expect(updateExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultSets: [expect.objectContaining({ weight: 0.5 })],
      }),
    );
    screen.unmount();
  });

  test('creates an exercise from decimal draft kilograms through the runtime form flow', async () => {
    const addExercise = vi.fn(async (payload) => ({ id: 'created-exercise', ...payload }));

    setMockParams({ muscleGroups: 'pecho' });
    setMockData({
      addExercise,
      createVariant: vi.fn(),
      deleteVariant: vi.fn(),
      getExercise: vi.fn(),
      renameVariant: vi.fn(),
      updateExercise: vi.fn(),
      variants: ['libre'],
    });

    const screen = render(React.createElement(ExerciseFormScreen));

    const [nameInput] = findInputs(screen.root, (node) => node.props.placeholder === 'Ej.: Press de banca');
    changeText(nameInput, 'Weighted Press');
    press(findPressableByText(screen.root, 'Pecho'));
    press(findPressableByText(screen.root, '+ Serie'));

    const [weightInput] = findInputs(screen.root, (node) => node.props.keyboardType === 'decimal-pad');
    changeText(weightInput, '2,5');

    const saveButton = findButton(screen.root, 'Crear ejercicio');
    await Promise.resolve(saveButton.props.onPress());

    expect(addExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Weighted Press',
        muscleGroups: ['pecho'],
        attribution: expect.objectContaining({ primary: 'pecho', secondary: [] }),
        defaultSets: [expect.objectContaining({ tipo: 1, weight: 2.5, reps: 0 })],
      }),
    );
    screen.unmount();
  });

  test('keeps routine draft decimals visible until save and commits normalized kilograms', async () => {
    const updateRoutine = vi.fn();
    const routine = {
      id: 'routine-1',
      name: 'Upper A',
      muscleGroups: ['pecho'],
      createdAt: '2026-07-26T10:00:00.000Z',
      exercises: [{
        id: 'routine-ex-1',
        catalogExerciseId: 'exercise-1',
        name: 'Weighted Press',
        muscleGroups: ['pecho'],
        variant: 'libre',
        sets: [{ id: 'set-1', tipo: 1, weight: 2.5, reps: 8 }],
      }],
    };

    setMockParams({ id: 'routine-1' });
    setMockData({
      exercises: [],
      getExercise: vi.fn(),
      getRoutine: vi.fn(() => routine),
      updateRoutine,
    });

    const screen = render(React.createElement(EditRoutineScreen));
    const [weightInput] = findInputs(screen.root, (node) => node.props.keyboardType === 'decimal-pad');
    expect(weightInput.props.value).toBe('2.5');

    changeText(weightInput, '2.');
    const [draftInput] = findInputs(screen.root, (node) => node.props.keyboardType === 'decimal-pad');
    expect(draftInput.props.value).toBe('2.');

    changeText(draftInput, '.5');
    const saveButton = findButton(screen.root, 'Guardar rutina');
    await Promise.resolve(saveButton.props.onPress());

    expect(updateRoutine).toHaveBeenCalledWith(
      expect.objectContaining({
        exercises: [expect.objectContaining({
          sets: [expect.objectContaining({ weight: 0.5 })],
        })],
      }),
    );
    screen.unmount();
  });

  test('keeps the add-exercise CTA reachable for empty and dense routine layouts', () => {
    setMockParams({ id: 'routine-1' });
    setMockData({
      exercises: [],
      getExercise: vi.fn(),
      getRoutine: vi.fn(() => ({
        id: 'routine-1',
        name: 'Empty routine',
        muscleGroups: ['pecho'],
        createdAt: '2026-07-26T10:00:00.000Z',
        exercises: [],
      })),
      updateRoutine: vi.fn(),
    });

    const emptyScreen = render(React.createElement(EditRoutineScreen));
    expect(findText(emptyScreen.root, 'Todavía no agregaste ejercicios')).toBeTruthy();
    expect(findButton(emptyScreen.root, '+ Agregar ejercicio')).toBeTruthy();
    expect(findButton(emptyScreen.root, 'Guardar rutina')).toBeTruthy();
    emptyScreen.unmount();

    setMockData({
      exercises: [],
      getExercise: vi.fn(),
      getRoutine: vi.fn(() => ({
        id: 'routine-1',
        name: 'Dense routine',
        muscleGroups: ['pecho'],
        createdAt: '2026-07-26T10:00:00.000Z',
        exercises: Array.from({ length: 6 }, (_, index) => ({
          id: `exercise-${index + 1}`,
          catalogExerciseId: `catalog-${index + 1}`,
          name: `Exercise ${index + 1}`,
          muscleGroups: ['pecho'],
          variant: 'libre',
          sets: [{ id: `set-${index + 1}`, tipo: 1, weight: 10 + index, reps: 8 }],
        })),
      })),
      updateRoutine: vi.fn(),
    });

    const denseScreen = render(React.createElement(EditRoutineScreen));
    expect(findTextsContaining(denseScreen.root, 'Exercise 6')).toHaveLength(1);
    expect(findButton(denseScreen.root, '+ Agregar ejercicio')).toBeTruthy();
    expect(findButton(denseScreen.root, 'Guardar rutina')).toBeTruthy();
    denseScreen.unmount();
  });

  test('collapses the exercises tab filters until requested and keeps the active state visible', () => {
    const deleteExercise = vi.fn();
    const renderScreen = (exercises: Exercise[]) => {
      setMockData({ exercises, deleteExercise });
      return render(React.createElement(ExercisesScreen));
    };

    const emptyScreen = renderScreen([]);
    const emptyTrigger = findByTestId(emptyScreen.root, 'exercise-filter-trigger');
    expect(emptyTrigger.props.accessibilityState).toEqual({ expanded: false });
    expect(findTextsContaining(emptyScreen.root, 'Todos los grupos')).toHaveLength(1);
    expect(emptyScreen.root.findAll((node: any) => node.props?.testID === 'exercise-filter-strip')).toHaveLength(0);
    expect(findText(emptyScreen.root, 'No hay ejercicios todavía')).toBeTruthy();

    press(emptyTrigger);

    const emptyExpandedTrigger = findByTestId(emptyScreen.root, 'exercise-filter-trigger');
    const emptyStrip = findByTestId(emptyScreen.root, 'exercise-filter-strip');
    expect(emptyExpandedTrigger.props.accessibilityState).toEqual({ expanded: true });
    expect((emptyStrip.type as any).displayName).toBe('View');
    expect(emptyStrip.props.style).toEqual(expect.objectContaining({
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
    }));
    expect(emptyScreen.root.findAll((node: any) => node.type === 'ScrollView' && node.props.horizontal)).toHaveLength(0);
    emptyScreen.unmount();

    const fewScreen = renderScreen([
      exercise('one', 'Press banca', 'libre'),
    ]);
    const fewTrigger = findByTestId(fewScreen.root, 'exercise-filter-trigger');
    press(fewTrigger);
    const fewStrip = findByTestId(fewScreen.root, 'exercise-filter-strip');
    expect(fewStrip.props.style).toEqual(expect.objectContaining({
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
    }));
    expect(findTextsContaining(fewScreen.root, 'Press banca')).toHaveLength(1);
    fewScreen.unmount();

    const denseScreen = renderScreen(
      Array.from({ length: 8 }, (_, index) => exercise(`exercise-${index + 1}`, `Exercise ${index + 1}`, 'libre')),
    );
    const denseTrigger = findByTestId(denseScreen.root, 'exercise-filter-trigger');
    press(denseTrigger);
    const denseStrip = findByTestId(denseScreen.root, 'exercise-filter-strip');
    expect(denseStrip.props.style).toEqual(expect.objectContaining({
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
    }));
    const pechoChip = findPressableByText(denseScreen.root, 'Pecho');
    press(pechoChip);

    expect(findTextsContaining(denseScreen.root, 'Activo: Pecho')).toHaveLength(1);
    expect(findTextsContaining(denseScreen.root, 'Exercise 8')).toHaveLength(1);

    const denseCollapseTrigger = findByTestId(denseScreen.root, 'exercise-filter-trigger');
    press(denseCollapseTrigger);

    expect(findByTestId(denseScreen.root, 'exercise-filter-trigger').props.accessibilityState).toEqual({ expanded: false });
    expect(findTextsContaining(denseScreen.root, 'Activo: Pecho')).toHaveLength(1);
    expect(denseScreen.root.findAll((node: any) => node.props?.testID === 'exercise-filter-strip')).toHaveLength(0);

    press(findByTestId(denseScreen.root, 'exercise-filter-trigger'));
    const todosChip = findPressableByText(denseScreen.root, 'Todos');
    expect(todosChip.props.style[0]).toEqual(expect.objectContaining({
      alignSelf: 'flex-start',
      borderRadius: 999,
    }));
    press(todosChip);
    expect(findTextsContaining(denseScreen.root, 'Todos los grupos')).toHaveLength(1);
    denseScreen.unmount();
  });
});
