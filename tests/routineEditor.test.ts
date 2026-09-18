import { describe, expect, test } from 'vitest';
import { Routine, RoutineSet } from '../types';
import {
  routineInputKey,
  seedRoutineDraft,
  editRoutineSets,
  prepareRoutineSave,
  appendRoutineExercises,
} from '../utils/routineEditor';
import { normalizeSessionSetNumbers } from '../utils/workoutDraft';
import {
  continuesDropBlock,
  moveSetBlock,
  routineSetLabels,
} from '../utils/setPrescription';
import {
  attemptToSession,
  createWorkoutAttempt,
  isValidPerformance,
} from '../utils/workoutAttempts';

const routine: Routine = {
  id: 'routine',
  name: 'Upper',
  createdAt: '2026-09-18T12:00:00Z',
  muscleGroups: ['chest'],
  exercises: [
    {
      id: 'exercise',
      name: 'Press',
      muscleGroups: ['chest'],
      variant: 'Barra',
      sets: [1, 2, 3].map((tipo) => ({
        id: `set-${tipo}`,
        tipo,
        weight: tipo * 10,
        reps: 8,
      })),
    },
  ],
};
const seed = () =>
  seedRoutineDraft('owner', routine.id, routine, 'operation', routine);

describe('routine editor prescriptions', () => {
  test('renumbers all 27 type combinations without mutating identities, effort or inputs', () => {
    for (const a of ['C', 1, 'F'] as const)
      for (const b of ['C', 1, 'F'] as const)
        for (const c of ['C', 1, 'F'] as const) {
          const before = seed();
          before.inputs[routineInputKey('exercise', 'set-2')].weight = '22,';
          const after = editRoutineSets(before, 'exercise', (sets) =>
            sets.map((set, index) => ({
              ...set,
              tipo: [a, b, c][index],
              effortTarget: { kind: 'rir', value: 2 },
            })),
          );
          let n = 0;
          expect(
            after.routine.exercises[0].sets.map((set) => set.tipo),
          ).toEqual(
            [a, b, c].map((type) => (typeof type === 'number' ? ++n : type)),
          );
          expect(after.inputs).toBe(before.inputs);
          expect(
            after.routine.exercises[0].sets.map((set) => [
              set.id,
              set.weight,
              set.reps,
              set.effortTarget,
            ]),
          ).toEqual(
            routine.exercises[0].sets.map((set) => [
              set.id,
              set.weight,
              set.reps,
              { kind: 'rir', value: 2 },
            ]),
          );
          expect(
            normalizeSessionSetNumbers(after.routine.exercises[0].sets),
          ).toEqual(after.routine.exercises[0].sets);
        }
  });
  test('deleting the last set is allowed locally and rejected only at save', () => {
    const empty = editRoutineSets(seed(), 'exercise', () => []);
    expect(empty.routine.exercises[0].sets).toEqual([]);
    expect(() => prepareRoutineSave(empty)).toThrow(
      'agrega al menos una serie',
    );
  });
  test('keeps raw decimals and seeds every inserted set, including explicit zero', () => {
    const draft = appendRoutineExercises(seed(), [
      {
        ...routine.exercises[0],
        id: 'added',
        sets: [{ id: 'zero', tipo: 1, weight: 0, reps: 10 }],
      },
    ]);
    draft.inputs[routineInputKey('exercise', 'set-1')].weight = '12,5';
    expect(prepareRoutineSave(draft).exercises[0].sets[0].weight).toBe(12.5);
    expect(draft.inputs[routineInputKey('added', 'zero')].weight).toBe('0');
    draft.inputs[routineInputKey('added', 'zero')].reps = '8abc';
    expect(() => prepareRoutineSave(draft)).toThrow('repeticiones');
  });
  test('backoff counts; drops stay independent and move atomically', () => {
    const sets: RoutineSet[] = [
      { id: 'warmup', tipo: 'C', weight: 10, reps: 8 },
      ...routine.exercises[0].sets.map((set, index) => ({
        ...set,
        ...(index === 0
          ? { backoffGroupId: 'legacy' }
          : { dropGroupId: 'drop' }),
      })),
    ];
    expect(routineSetLabels(sets)).toEqual({
      warmup: 'C',
      'set-1': '1',
      'set-2': 'D1.1',
      'set-3': 'D1.2',
    });
    expect(moveSetBlock(sets, 'set-3', -1).map((set) => set.id)).toEqual([
      'warmup',
      'set-2',
      'set-3',
      'set-1',
    ]);
    expect(continuesDropBlock({ ...routine.exercises[0], sets }, 'set-2')).toBe(
      true,
    );
    expect(continuesDropBlock({ ...routine.exercises[0], sets }, 'set-3')).toBe(
      false,
    );
    expect(continuesDropBlock({ ...routine.exercises[0], sets }, 'set-1')).toBe(
      false,
    );
    const orphan = normalizeSessionSetNumbers(
      sets.filter((set) => set.id !== 'set-2'),
    );
    expect(orphan.at(-1)).toMatchObject({ tipo: 2, dropGroupId: undefined });
    expect(orphan[1].backoffGroupId).toBe('legacy');
  });
  test('captures real seconds and unweighed bodyweight without inventing reps or effort', () => {
    const draft = editRoutineSets(seed(), 'exercise', (sets) => [
      {
        ...sets[0],
        durationSeconds: 30,
        loadBasis: 'bodyweight',
        effortTarget: { kind: 'rir', value: 2 },
      },
    ]);
    draft.inputs[routineInputKey('exercise', 'set-1')] = {
      weight: '',
      reps: '',
      durationSeconds: '45',
    };
    const saved = prepareRoutineSave(draft);
    expect(saved.exercises[0].sets[0]).toMatchObject({
      durationSeconds: 45,
      weight: 0,
      reps: 0,
    });
    const attempt = createWorkoutAttempt({
      id: 'a',
      owner: 'owner',
      routine: saved,
      completedAt: routine.createdAt,
      durationSeconds: 60,
      restTimerSeconds: 90,
      results: {
        'exercise:set-1': {
          performed: true,
          reps: 0,
          durationSeconds: 42,
          load: 0,
        },
      },
    });
    expect(attempt.completion.validSets).toBe(1);
    expect(attempt.exercises[0].sets[0].plan).toMatchObject({
      targetDurationSeconds: 45,
    });
    expect(attempt.exercises[0].sets[0].result.performance).toMatchObject({
      durationSeconds: 42,
      reps: 0,
      mode: 'bodyweight',
      bodyweightUnspecified: true,
    });
    expect(attempt.exercises[0].sets[0].result.actualEffort).toBeUndefined();
    expect(attemptToSession(attempt).exercises[0].sets[0]).toMatchObject({
      durationSeconds: 42,
      reps: 0,
    });
    expect(
      isValidPerformance({
        mode: 'bodyweight',
        reps: 8,
        bodyweight: 0,
        unit: 'kg',
      }),
    ).toBe(false);
    expect(
      isValidPerformance({
        mode: 'external-load',
        reps: 8,
        durationSeconds: 30,
        load: 0,
        unit: 'kg',
      }),
    ).toBe(false);
  });
});

test('legacy repeated set ids in different exercises never share input state', () => {
  const base = {
    ...routine,
    exercises: [routine.exercises[0], { ...routine.exercises[0], id: 'other' }],
  };
  const draft = seedRoutineDraft('owner', base.id, base, 'op', base);
  draft.inputs[routineInputKey('other', 'set-1')].weight = '99';
  const saved = prepareRoutineSave(draft);
  expect(saved.exercises[0].sets[0].weight).toBe(10);
  expect(saved.exercises[1].sets[0].weight).toBe(99);
});
