import { describe, expect, test } from 'vitest';
import { RoutineExercise } from '../types';
import { applyLoadToRemaining, copyPreviousSeries } from '../utils/quickLogging';

const exercise: RoutineExercise = { id: 'e', name: 'Press', variant: 'bar', muscleGroups: [], loadMode: 'external-load', loadUnit: 'kg', sets: [1, 2, 3, 4].map((tipo) => ({ id: String(tipo), tipo, weight: 20, reps: 8 })) };
const values = { 'e-1': { weight: '25.5', reps: '10' }, 'e-2': { weight: '22', reps: '8' }, 'e-3': { weight: '15', reps: '12' }, 'e-4': { weight: '', reps: '' }, 'other-1': { weight: '100', reps: '3' } };

describe('quick logging runtime values', () => {
  test('copies only load/reps from the immediately previous series, even if completed', () => {
    const before = JSON.stringify({ exercise, values });
    expect(copyPreviousSeries(exercise, '2', values, { 'e-1': true })).toEqual({ ...values, 'e-2': values['e-1'] });
    expect(JSON.stringify({ exercise, values })).toBe(before);
    expect(copyPreviousSeries(exercise, '1', values, {})).toBeNull();
    expect(copyPreviousSeries(exercise, '2', values, { 'e-2': true })).toBeNull();
  });
  test('applies only load to later unfinished sets, leaving reps and other exercises intact', () => {
    expect(applyLoadToRemaining(exercise, '2', values, { 'e-3': true })).toEqual({ ...values, 'e-4': { weight: '22', reps: '' } });
    expect(applyLoadToRemaining(exercise, '4', values, {})).toBeNull();
    expect(applyLoadToRemaining(exercise, '2', values, { 'e-2': true })).toBeNull();
  });
  test.each(['', ' ', 'NaN', 'Infinity', '-1', '20kg', '20,5'])('rejects invalid source load %j', (weight) => {
    const input = { ...values, 'e-1': { weight, reps: '8' } };
    expect(copyPreviousSeries(exercise, '2', input, {})).toBeNull();
    expect(applyLoadToRemaining(exercise, '1', input, {})).toBeNull();
  });
  test.each(['', '0', '-1', '8x', '2.5'])('rejects invalid previous reps %j', (reps) => {
    expect(copyPreviousSeries(exercise, '2', { ...values, 'e-1': { weight: '20', reps } }, {})).toBeNull();
  });
  test.each(['C', 'F', 'backoff'] as const)('does not flatten %s prescriptions', (kind) => {
    const modified = structuredClone(exercise);
    modified.sets[1] = { ...modified.sets[1], ...(kind === 'backoff' ? { backoffGroupId: 'b' } : { tipo: kind }) };
    expect(copyPreviousSeries(modified, '2', values, {})).toBeNull();
    expect(copyPreviousSeries(modified, '3', values, {})).toBeNull();
    expect(applyLoadToRemaining(modified, '2', values, {})).toBeNull();
    expect(applyLoadToRemaining(modified, '1', values, {})?.['e-2']).toEqual(values['e-2']);
  });
  test('validates bodyweight and preserves legacy completion flags', () => {
    const bodyweight = { ...exercise, loadMode: 'bodyweight' as const };
    expect(applyLoadToRemaining(bodyweight, '1', { ...values, 'e-1': { weight: '0', reps: '8' } }, {})).toBeNull();
    expect(applyLoadToRemaining(exercise, '1', values, { 'e:2': true })?.['e-2']).toEqual(values['e-2']);
  });
  test('does not share mutable value objects or carry effort and set-type metadata', () => {
    const current = structuredClone(exercise); current.sets[1].effortTarget = { kind: 'rir', value: 4 };
    const before = JSON.stringify(current); const next = copyPreviousSeries(current, '2', values, {})!;
    expect(next['e-2']).not.toBe(values['e-1']);
    expect(Object.keys(next['e-2'])).toEqual(['weight', 'reps']);
    expect(JSON.stringify(current)).toBe(before);
    const completed = structuredClone(exercise); completed.sets[1].completed = true;
    expect(applyLoadToRemaining(completed, '1', values, {})?.['e-2']).toEqual(values['e-2']);
  });

});
