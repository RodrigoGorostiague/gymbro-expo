import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Mesocycle, WORKOUT_ATTEMPT_VERSION, WorkoutAttempt } from '../types';

const dataContextSource = readFileSync(resolve(import.meta.dirname, '../context/DataContext.tsx'), 'utf8');

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
  loadSessionQuarantine,
  getStorageMigrationError,
  loadAttempts,
  loadMesocycles,
  loadRoutines,
  loadSessions,
  mutateAttempts,
  resolveSessionQuarantine,
  rollbackSessionMigration,
  saveCapturedAttempt,
  saveAttempts,
  saveMesocycles,
  updateAttempt,
} from '../utils/storage';

const attempt = (id: string, owner: 'rodaja' | 'brisas' = 'rodaja'): WorkoutAttempt => ({
  version: WORKOUT_ATTEMPT_VERSION,
  id,
  owner,
  routineId: 'routine-1',
  recordedRoutineName: 'Routine',
  completedAt: '2026-07-24T10:00:00.000Z',
  durationSeconds: 60,
  restTimerSeconds: 30,
  exercises: [{
    exerciseId: 'exercise-1',
    recordedName: 'Exercise',
    attribution: { primary: 'pecho', secondary: [] },
    sets: [{
      plan: { id: 'set-1', type: 1, targetReps: 8 },
      result: { setId: 'set-1', performed: true, performance: { mode: 'external-load', reps: 8, load: 20, unit: 'kg' } },
    }],
  }],
  completion: { validSets: 1, plannedSets: 1, adherence: 1, displayPercent: 100, status: 'fully-completed' },
  reward: { setGems: 1, completionGems: 5, fullCompletionBonus: 2, totalGems: 8, qualifiesForCompletion: true },
  rewardApplication: { id: `${owner}:${id}:v1`, state: 'pending' },
});

const mesocycle = (overrides: Partial<Mesocycle> = {}): Mesocycle => ({
  id: 'mesocycle-1',
  name: 'Hypertrophy Block',
  goal: 'Build work capacity',
  status: 'draft',
  durationWeeks: 2,
  createdAt: '2026-07-25T12:00:00.000Z',
  weeks: [
    {
      id: 'week-1',
      weekNumber: 1,
      sessions: [
        {
          id: 'session-1',
          ref: {
            routineId: 'routine-1',
            routineName: 'Upper A',
            source: 'local',
          },
          order: 1,
          dayLabel: 'Monday',
          progressionNote: 'Add one rep to compounds',
        },
      ],
    },
    {
      id: 'week-2',
      weekNumber: 2,
      sessions: [
        {
          id: 'session-2',
          ref: {
            routineId: 'routine-1',
            routineName: 'Upper A',
            source: 'local',
          },
          order: 1,
          dayLabel: 'Monday',
          note: 'Repeat with the same template',
        },
        {
          id: 'session-3',
          ref: {
            routineId: 'shared-share-1',
            routineName: 'Partner Lower',
            source: 'shared',
            shareId: 'share-1',
          },
          order: 2,
        },
      ],
    },
  ],
  ...overrides,
});

beforeEach(async () => {
  storage.data.clear();
  storage.failures.clear();
  vi.clearAllMocks();
  await rollbackSessionMigration();
  vi.clearAllMocks();
});

describe('routine hydration', () => {
  test('normalizes legacy array fields without changing current routines', async () => {
    const legacyExercise = {
      id: 'legacy-exercise',
      name: 'Legacy press',
      sets: [{ id: 'legacy-set', weight: 40, reps: 10 }],
    };
    const malformedExercise = {
      id: 'malformed-exercise',
      name: 'Malformed row',
      muscleGroups: 'pecho',
      sets: null,
      attribution: { profile: 'rodaja', displayName: 'Rodaja' },
    };
    const legacyWithoutMuscleGroups = {
      id: 'legacy-groups',
      name: 'Legacy groups',
      exercises: [legacyExercise, malformedExercise],
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const legacyWithoutExercises = {
      id: 'legacy-exercises',
      name: 'Legacy exercises',
      muscleGroups: ['pecho'],
      createdAt: '2026-01-02T00:00:00.000Z',
    };
    const current = {
      id: 'current',
      name: 'Current',
      muscleGroups: ['espalda'],
      exercises: [{
        id: 'exercise-1',
        catalogExerciseId: 'catalog-1',
        name: 'Row',
        muscleGroups: ['espalda'],
        loadMode: 'external-weight',
        loadUnit: 'kg',
        attribution: { profile: 'brisas', displayName: 'Brisas' },
        variant: 'barra',
        sets: [{ id: 'set-1', tipo: 1, weight: 45, reps: 8 }],
      }],
      createdAt: '2026-01-03T00:00:00.000Z',
      isShared: true,
      shareId: 'share-1',
    };
    storage.data.set('@gymbro/routines', JSON.stringify([
      legacyWithoutMuscleGroups,
      legacyWithoutExercises,
      current,
    ]));

    await expect(loadRoutines()).resolves.toEqual([
      {
        ...legacyWithoutMuscleGroups,
        muscleGroups: [],
        exercises: [
          { ...legacyExercise, muscleGroups: [] },
          { ...malformedExercise, muscleGroups: [], sets: [] },
        ],
      },
      { ...legacyWithoutExercises, exercises: [] },
      current,
    ]);
  });
});

describe('mesocycle repository', () => {
  test('restores mesocycles with week/session references, repeated routine reuse, and status updates', async () => {
    const active = mesocycle({ status: 'active' });

    await saveMesocycles('rodaja', [active]);

    await expect(loadMesocycles('rodaja')).resolves.toEqual([active]);
    expect(storage.data.get('@gymbro/mesocycles/v1/rodaja')).toBe(JSON.stringify([active]));
  });

  test('deletes mesocycles without rewriting routine storage', async () => {
    storage.data.set('@gymbro/routines', JSON.stringify([{ id: 'routine-1', name: 'Upper A', exercises: [] }]));
    await saveMesocycles('rodaja', [mesocycle()]);

    await saveMesocycles('rodaja', []);

    await expect(loadMesocycles('rodaja')).resolves.toEqual([]);
    expect(JSON.parse(storage.data.get('@gymbro/routines')!)).toEqual([{ id: 'routine-1', name: 'Upper A', exercises: [] }]);
  });

  test('isolates mesocycles per profile and does not expose another profile storage', async () => {
    const rodajaMesocycle = mesocycle({ id: 'rodaja-cycle', name: 'Rodaja block' });
    const brisasMesocycle = mesocycle({ id: 'brisas-cycle', name: 'Brisas block' });

    await saveMesocycles('rodaja', [rodajaMesocycle]);
    await saveMesocycles('brisas', [brisasMesocycle]);

    await expect(loadMesocycles('rodaja')).resolves.toEqual([rodajaMesocycle]);
    await expect(loadMesocycles('brisas')).resolves.toEqual([brisasMesocycle]);
    expect(storage.data.get('@gymbro/mesocycles/v1/rodaja')).toBe(JSON.stringify([rodajaMesocycle]));
    expect(storage.data.get('@gymbro/mesocycles/v1/brisas')).toBe(JSON.stringify([brisasMesocycle]));
  });

  test('copies legacy global mesocycles into each profile partition without deleting the legacy source', async () => {
    const legacy = mesocycle();
    storage.data.set('@gymbro/mesocycles', JSON.stringify([legacy]));

    await expect(loadMesocycles('rodaja')).resolves.toEqual([legacy]);
    await expect(loadMesocycles('brisas')).resolves.toEqual([legacy]);

    expect(storage.data.get('@gymbro/mesocycles/v1/rodaja')).toBe(JSON.stringify([legacy]));
    expect(storage.data.get('@gymbro/mesocycles/v1/brisas')).toBe(JSON.stringify([legacy]));
    expect(storage.data.get('@gymbro/mesocycles')).toBe(JSON.stringify([legacy]));
  });

  test('wires mesocycle hydration and CRUD helpers through DataContext', () => {
    expect(dataContextSource).toContain('const [mesocycles, setMesocycles] = useState<Mesocycle[]>([])');
    expect(dataContextSource).toContain('const mesocycleMutationQueueRef = useRef<Promise<void>>(Promise.resolve())');
    expect(dataContextSource).toContain('loadMesocycles(user)');
    expect(dataContextSource).toContain('addMesocycle');
    expect(dataContextSource).toContain('updateMesocycle');
    expect(dataContextSource).toContain('deleteMesocycle');
    expect(dataContextSource).toContain('getMesocycle');
    expect(dataContextSource).toContain('resolvePlannedRoutine');
    expect(dataContextSource).toContain('saveMesocycles(owner, next)');
  });
});

describe('profile attempt repository', () => {
  test('isolates profile-owned versioned attempts at stable keys', async () => {
    await saveAttempts('rodaja', [attempt('r')]);
    await saveAttempts('brisas', [attempt('b', 'brisas')]);

    await expect(loadAttempts('rodaja')).resolves.toEqual([attempt('r')]);
    await expect(loadAttempts('brisas')).resolves.toEqual([attempt('b', 'brisas')]);
    await expect(saveAttempts('rodaja', [attempt('wrong', 'brisas')])).rejects.toThrow('partición');
  });

  test('quarantines ownerless sessions and migrates only once', async () => {
    const sessions = [{ id: 'owned', owner: 'rodaja' }, { id: 'legacy' }];
    storage.data.set('@gymbro/sessions', JSON.stringify(sessions));
    storage.data.set('@gymbro/routines', 'preserved-routines');
    storage.data.set('@gymbro/exercises', 'preserved-exercises');

    await expect(loadSessions()).resolves.toEqual([sessions[0]]);
    expect(storage.data.get('@gymbro/quarantine/ownerless-sessions-v1'))
      .toBe(JSON.stringify([sessions[1]]));
    expect(storage.data.get('@gymbro/routines')).toBe('preserved-routines');
    expect(storage.data.get('@gymbro/exercises')).toBe('preserved-exercises');

    const later = [{ id: 'later', owner: 'brisas' }];
    storage.data.set('@gymbro/sessions', JSON.stringify(later));
    await expect(loadSessions()).resolves.toEqual(later);
  });

  test('aborts and remains retryable when quarantine creation fails', async () => {
    const sessions = [{ id: 'owned', owner: 'rodaja' }, { id: 'legacy' }];
    storage.data.set('@gymbro/sessions', JSON.stringify(sessions));
    storage.failures.set('@gymbro/quarantine/ownerless-sessions-v1', 1);

    await expect(loadSessions()).rejects.toThrow('write failed');
    expect(getStorageMigrationError()).toBeInstanceOf(Error);
    expect(JSON.parse(storage.data.get('@gymbro/sessions')!)).toEqual(sessions);
    expect(storage.data.has('@gymbro/migrations/profile-attempts-v1')).toBe(false);
    await expect(loadSessions()).resolves.toEqual([sessions[0]]);
    expect(getStorageMigrationError()).toBeNull();
  });

  test('rollback merges post-migration sessions with quarantined legacy data', async () => {
    const legacy = { id: 'legacy' };
    const current = { id: 'current', owner: 'brisas' };
    storage.data.set('@gymbro/quarantine/ownerless-sessions-v1', JSON.stringify([legacy]));
    storage.data.set('@gymbro/sessions', JSON.stringify([current]));

    await rollbackSessionMigration();
    expect(JSON.parse(storage.data.get('@gymbro/sessions')!)).toEqual([legacy, current]);
    expect(storage.data.has('@gymbro/migrations/profile-attempts-v1')).toBe(false);
  });

  test('rollback prefers current sessions on ID collision', async () => {
    const current = { id: 'collision', owner: 'rodaja', durationSeconds: 120 };
    storage.data.set('@gymbro/quarantine/ownerless-sessions-v1', JSON.stringify([
      { id: 'collision', durationSeconds: 60 },
    ]));
    storage.data.set('@gymbro/sessions', JSON.stringify([current]));

    await rollbackSessionMigration();
    expect(JSON.parse(storage.data.get('@gymbro/sessions')!)).toEqual([current]);
  });

  test('permanently deletes quarantine and does not offer resolution again', async () => {
    storage.data.set('@gymbro/quarantine/ownerless-sessions-v1', JSON.stringify([{ id: 'legacy' }]));
    storage.data.set('@gymbro/routines', 'untouched');

    await resolveSessionQuarantine('delete', 'rodaja');

    await expect(loadSessionQuarantine()).resolves.toEqual([]);
    expect(storage.data.has('@gymbro/quarantine/ownerless-sessions-v1')).toBe(false);
    expect(storage.data.get('@gymbro/routines')).toBe('untouched');
  });

  test('assigns quarantine once, merging safely with current-owned collision winners', async () => {
    const current = { id: 'collision', owner: 'brisas', durationSeconds: 120 };
    storage.data.set('@gymbro/sessions', JSON.stringify([current]));
    storage.data.set('@gymbro/quarantine/ownerless-sessions-v1', JSON.stringify([
      { id: 'legacy', durationSeconds: 60 }, { id: 'collision', durationSeconds: 30 },
    ]));

    await expect(resolveSessionQuarantine('assign', 'rodaja')).resolves.toEqual([
      { id: 'legacy', durationSeconds: 60, owner: 'rodaja' }, current,
    ]);
    expect(JSON.parse(storage.data.get('@gymbro/sessions')!)).toEqual([
      { id: 'legacy', durationSeconds: 60, owner: 'rodaja' }, current,
    ]);
    await expect(loadSessionQuarantine()).resolves.toEqual([]);
    await expect(resolveSessionQuarantine('assign', 'rodaja')).resolves.toEqual([
      { id: 'legacy', durationSeconds: 60, owner: 'rodaja' }, current,
    ]);
  });

  test('serializes quarantine resolution through the session mutation queue', () => {
    const resolver = dataContextSource.slice(
      dataContextSource.indexOf('const resolveQuarantine'),
      dataContextSource.indexOf('// Merge accepted shares'),
    );

    expect(resolver).toContain('sessionMutationQueueRef.current.then');
    expect(resolver).toContain('resolveSessionQuarantine(action, owner)');
    expect(resolver).toContain('sessionMutationQueueRef.current = operation.then');
  });

  test('serializes mutations and does not publish failed persistence', async () => {
    const first = mutateAttempts('rodaja', (current) => [...current, attempt('one')]);
    const second = mutateAttempts('rodaja', (current) => [...current, attempt('two')]);
    await Promise.all([first, second]);
    await expect(loadAttempts('rodaja')).resolves.toHaveLength(2);

    storage.failures.set('@gymbro/attempts/v1/rodaja', 1);
    await expect(mutateAttempts('rodaja', (current) => [...current, attempt('lost')])).rejects.toThrow('write failed');
    expect((await loadAttempts('rodaja')).map(({ id }) => id)).toEqual(['one', 'two']);
    await expect(mutateAttempts('rodaja', (current) => [...current, attempt('recovered')]))
      .resolves.toHaveLength(3);
    await saveCapturedAttempt('rodaja', attempt('capture'));
    await expect(saveCapturedAttempt('rodaja', attempt('capture'))).resolves.toHaveLength(4);
    await expect(saveCapturedAttempt('rodaja', { ...attempt('capture'), durationSeconds: 61 }))
      .rejects.toThrow('otros datos capturados');
  });

  test('persists allowed result edits but rejects structural changes', async () => {
    const original = attempt('editable');
    await saveAttempts('rodaja', [original]);
    const edited: WorkoutAttempt = {
      ...original,
      completedAt: '2026-07-25T10:00:00.000Z',
      exercises: original.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map(({ plan, result }) => ({
          plan,
          result: { ...result, performance: { mode: 'external-load', reps: 9, load: 22, unit: 'kg' } },
        })),
      })),
    };

    await updateAttempt('rodaja', edited);
    await expect(loadAttempts('rodaja')).resolves.toEqual([edited]);
    await expect(updateAttempt('rodaja', { ...edited, routineId: 'different' })).rejects.toThrow('inmutables');
    await expect(loadAttempts('rodaja')).resolves.toEqual([edited]);
  });

});
