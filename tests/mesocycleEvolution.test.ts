import { describe, expect, test } from 'vitest';
import { Mesocycle, Routine } from '../types';
import { createWorkoutAttempt } from '../utils/workoutAttempts';
import { deriveMesocycleEvolution, exposureEffortLabel } from '../utils/mesocycleEvolution';

function fixture() {
  const routine: Routine = { id: 'r', name: 'Press day', createdAt: '', muscleGroups: [], exercises: [{ id: 'e', catalogExerciseId: 'press', name: 'Press', variant: 'bar', loadMode: 'external-load', loadUnit: 'kg', muscleGroups: [], sets: [{ id: 's', tipo: 1, weight: 20, reps: 8 }, { id: 'warmup', tipo: 'C', weight: 10, reps: 10 }] }] };
  const block: Mesocycle = { id: 'm', name: 'Block', goal: '', createdAt: '', status: 'completed', durationWeeks: 2, weeks: [1, 2].map((weekNumber) => ({ id: `w${weekNumber}`, weekNumber, entries: [{ id: `p${weekNumber}`, order: 1, ref: { routineId: 'r', routineName: routine.name, source: 'local' }, routineSnapshot: routine }] })) };
  const attempts = [1, 2].map((week) => createWorkoutAttempt({ id: `a${week}`, owner: 'u', routine, completedAt: `2026-09-${week === 1 ? '01' : '08'}T12:00:00Z`, durationSeconds: 60, restTimerSeconds: 90, lineage: { mesocycleId: 'm', weekNumber: week, plannedSessionId: `p${week}` }, results: { 'e:s': { performed: true, reps: week === 1 ? 8 : 10, load: week === 1 ? 20 : 25, actualEffort: { kind: 'rir', value: week === 1 ? 3 : 2 } }, 'e:warmup': { performed: true, reps: 10, load: 10, actualEffort: { kind: 'rpe', value: 6 } } } }));
  return { block, attempts };
}

describe('mesocycle evolution', () => {
  test('compares actual effective sets across weeks with effort and volume, preserving history', () => {
    const { block, attempts } = fixture(); const before = JSON.stringify(attempts);
    const groups = deriveMesocycleEvolution(block, attempts, 'u');
    expect(groups).toHaveLength(1);
    expect(groups[0].points).toMatchObject([{ weekNumber: 1, load: 20, reps: 8, sets: 1, volume: 160 }, { weekNumber: 2, load: 25, reps: 10, sets: 1, volume: 250 }]);
    expect(exposureEffortLabel(groups[0].points[1])).toBe('RIR 2 (1/1 series)');
    expect(JSON.stringify(attempts)).toBe(before);
  });
  test('uses one latest attempt per slot, excluding other owners, blocks and routines', () => {
    const { block, attempts } = fixture();
    const duplicate = { ...attempts[0], id: 'z' };
    const outsiders = [ { ...attempts[1], owner: 'other', id: 'foreign' }, { ...attempts[1], routineId: 'other' }, { ...attempts[1], lineage: { ...attempts[1].lineage!, mesocycleId: 'other' } } ];
    const groups = deriveMesocycleEvolution(block, [...attempts, duplicate, ...outsiders], 'u');
    expect(groups[0].points.map((point) => point.attemptId)).toEqual(['z', 'a2']);
    expect(deriveMesocycleEvolution(block, attempts, null)).toEqual([]);
  });
  test.each(['variant', 'unit', 'structure', 'mode'])('separates incompatible %s instead of claiming progress', (field) => {
    const { block, attempts } = fixture(); const changed = structuredClone(attempts) as any;
    const exercise = changed[1].exercises[0];
    if (field === 'variant') exercise.variant = 'dumbbell';
    if (field === 'unit') exercise.sets[0].result.performance.unit = 'lb';
    if (field === 'structure') exercise.sets[0].plan.type = 'F';
    if (field === 'mode') exercise.sets[0].result.performance = { mode: 'assisted', assistance: 15, unit: 'kg', reps: 10 };
    const groups = deriveMesocycleEvolution(block, changed, 'u');
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.points.length === 1)).toBe(true);
    if (field === 'mode') expect(groups[1].points[0]).toMatchObject({ load: 15, volume: null });
  });
  test('does not fabricate missing effort, count unperformed sets, or average scales', () => {
    const { block, attempts } = fixture(); const changed = structuredClone(attempts) as any;
    delete changed[0].exercises[0].sets[0].result.actualEffort;
    changed[1].exercises[0].sets[0].result.performed = false;
    const groups = deriveMesocycleEvolution(block, changed, 'u');
    expect(groups[0].points).toHaveLength(1);
    expect(exposureEffortLabel(groups[0].points[0])).toBe('Esfuerzo sin registrar');
    expect(exposureEffortLabel({ ...groups[0].points[0], sets: 3, efforts: [{ kind: 'rir', value: 2 }, { kind: 'rpe', value: 8 }] })).toBe('RIR 2 (1/3 series) · RPE 8 (1/3 series)');
  });
});
