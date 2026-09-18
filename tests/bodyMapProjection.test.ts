import { describe, expect, test } from 'vitest';
import { BODY_CATALOG_LABELS } from '../constants/bodyMap/catalogLabels';
import { bodyRegionsForMuscle } from '../constants/bodyMapMapping';
import { bodyFront } from '../constants/bodyMap/bodyFront';
import { bodyBack } from '../constants/bodyMap/bodyBack';
import { bodyFemaleFront } from '../constants/bodyMap/bodyFemaleFront';
import { bodyFemaleBack } from '../constants/bodyMap/bodyFemaleBack';
import { BodyMapProjection, bodyColorLevel, bodyMetricValue, projectAttemptsBody, projectExerciseBody, projectMesocycleBody, projectRecapBody, projectRoutineBody, projectSharedBody, projectVolumeBody } from '../utils/bodyMapProjection';
import type { Exercise, Mesocycle, Routine, WorkoutAttempt } from '../types';
const now = Date.parse('2026-09-18T12:00:00Z');
const exercise: Exercise = { id: 'press', name: 'Press', variant: 'Barra', defaultSets: [], muscleGroups: ['GM-101'], catalog: { movementPattern: 'Empuje', equipment: 'Barra', muscleParticipations: [
  { muscleGroupId: 'GM-101', role: 'Principal', relevance: 1, originalLabel: '' },
  { muscleGroupId: 'GM-102', role: 'Principal', relevance: 0.8, originalLabel: '' },
  { muscleGroupId: 'GM-146', role: 'Secundario', relevance: 0.45, originalLabel: '' },
] } };
const routine: Routine = { id: 'r', name: 'Upper', muscleGroups: [], createdAt: '', exercises: [{ ...exercise, sets: [
  { id: 'warm', tipo: 'C', reps: 10, weight: 10 },
  { id: 's1', tipo: 1, reps: 10, weight: 30, effortTarget: { kind: 'rir', value: 1 } },
  { id: 's2', tipo: 2, reps: 10, weight: 30 },
  { id: 'd1', tipo: 3, reps: 8, weight: 30, dropGroupId: 'drop' },
  { id: 'd2', tipo: 4, reps: 8, weight: 20, dropGroupId: 'drop' },
] }] };
function attempt(overrides: Partial<WorkoutAttempt> = {}): WorkoutAttempt {
  return { version: 1, id: 'a', owner: 'owner', routineId: 'r', recordedRoutineName: 'Upper', completedAt: '2026-09-17T12:00:00Z', durationSeconds: 100, restTimerSeconds: 0,
    completion: { validSets: 4, plannedSets: 5, adherence: 0.8, displayPercent: 80, status: 'partial' }, reward: { setGems: 0, completionGems: 0, fullCompletionBonus: 0, totalGems: 0, qualifiesForCompletion: true }, rewardApplication: { id: 'a', state: 'pending' },
    exercises: [{ exerciseId: exercise.id, recordedName: exercise.name, attribution: null, catalog: exercise.catalog, sets: routine.exercises[0].sets.map((set) => ({
      plan: { id: set.id, type: set.tipo, dropGroupId: set.dropGroupId, effortTarget: set.effortTarget },
      result: { setId: set.id, performed: set.id !== 's2', performance: { mode: 'external-load', load: 30, unit: 'kg', reps: 10 }, ...(set.id === 's1' ? { actualEffort: { kind: 'rir' as const, value: 0 as const } } : {}) },
    })) }], ...overrides };
}
const entry = (projection: BodyMapProjection, id: string) => projection.entries.find((item) => item.id === id)!;

describe('body map projection', () => {
  test('maps stable IDs and legacy accents, keeping unlocatable groups explicit', () => {
    expect(bodyRegionsForMuscle('GM-102')).toEqual(['chest']);
    expect(bodyRegionsForMuscle('bíceps')).toEqual(['biceps']);
    expect(bodyRegionsForMuscle('GM-310')).toEqual([]);
    expect(bodyRegionsForMuscle('fullBody')).toEqual([]);
    const allowedUnmapped = ['GM-001','GM-010','GM-020','GM-115','GM-116','GM-117','GM-118','GM-133','GM-160','GM-161','GM-162','GM-305','GM-310'];
    expect(Object.keys(BODY_CATALOG_LABELS).filter((id) => !bodyRegionsForMuscle(id).length)).toEqual(allowedUnmapped);
    const geometrySlugs = new Set([...bodyFront,...bodyBack,...bodyFemaleFront,...bodyFemaleBack].map((part) => part.slug));
    for (const id of Object.keys(BODY_CATALOG_LABELS)) for (const region of bodyRegionsForMuscle(id)) expect(geometrySlugs.has(region)).toBe(true);
  });
  test('resolves participation once per region while retaining all source labels', () => {
    const result = projectExerciseBody(exercise);
    expect(entry(result, 'chest').value).toBe(1);
    expect(entry(result, 'chest').sources).toHaveLength(2);
    expect(entry(result, 'triceps')).toMatchObject({ value: 0.45, role: 'Secundario' });
  });
  test('counts planned work sets, groups drops and deduplicates IDs', () => {
    const result = projectRoutineBody({ exercises: [{ ...routine.exercises[0], sets: [...routine.exercises[0].sets, routine.exercises[0].sets[1]] }] });
    expect(result.totalSets).toBe(3);
    expect(entry(result, 'chest')).toMatchObject({ value: 3, direct: 3 });
    expect(entry(result, 'triceps').value).toBeCloseTo(1.35);
  });
  test('uses recorded effort only, excludes warmups/omissions and preserves zero RIR', () => {
    const result = projectAttemptsBody([attempt()], [], { owner: 'owner', now });
    expect(result.totalSets).toBe(2);
    expect(entry(result, 'chest')).toMatchObject({ value: 2, rir: { total: 0, count: 1 }, effortSets: 3 });
    expect(bodyMetricValue(entry(result, 'chest'), 'rir')).toBe(0);
    expect(bodyMetricValue(entry(result, 'chest'), 'rpe')).toBeNull();
  });
  test('filters owner, future/invalid/expired dates, duplicated attempts and invalid results', () => {
    const invalid = attempt({ id: 'invalid', exercises: [{ ...attempt().exercises[0], sets: [{ plan: { id: 's', type: 1 }, result: { setId: 'different', performed: true, performance: { mode: 'external-load', unit: 'kg', load: 1, reps: 10 } } }] }] });
    const result = projectAttemptsBody([attempt(), attempt(), attempt({ id: 'foreign', owner: 'other' }), attempt({ id: 'future', completedAt: '2027-01-01' }), attempt({ id: 'bad', completedAt: 'bad' }), attempt({ id: 'old', completedAt: '2026-01-01' }), invalid], [], { owner: 'owner', now, days: 7 });
    expect(result.totalSets).toBe(2);
    expect(entry(result, 'chest').days).toHaveLength(1);
  });
  test('unknown IDs never masquerade as no activity or full-body activation', () => {
    const result = projectExerciseBody({ ...exercise, catalog: undefined, muscleGroups: ['fullBody','unknown'] });
    expect(result.unmapped).toEqual(['fullBody', 'unknown']);
    expect(result.entries.every((item) => item.value === 0)).toBe(true);
  });
  test('supports empty catalog fallback attribution without promoting secondary to primary', () => {
    const result = projectExerciseBody({ ...exercise, catalog: { ...exercise.catalog!, muscleParticipations: [] }, attribution: { primary: 'pecho', secondary: ['tríceps'] } });
    expect(entry(result, 'triceps')).toMatchObject({ role: 'Secundario', value: 0.5 });
  });
  test('zero relevance remains zero', () => {
    const result = projectExerciseBody({ ...exercise, catalog: { ...exercise.catalog!, muscleParticipations: [{ muscleGroupId: 'GM-101', role: 'Principal', relevance: 0, originalLabel: '' }] } });
    expect(entry(result, 'chest').value).toBe(0);
  });
  test('mesocycle counts repeated sessions with frozen prescriptions, excludes cancelled/replaced slots, reports missing routines', () => {
    const mesocycle: Mesocycle = { id: 'm', name: 'Block', goal: '', status: 'active', createdAt: '', durationWeeks: 2, weeks: [
      { id: 'w1', weekNumber: 1, entries: [{ id: 's1', order: 1, ref: { routineId: 'r', routineName: '', source: 'local' }, routineSnapshot: routine }, { id: 's2', order: 2, ref: { routineId: 'r', routineName: '', source: 'local' } }, { id: 'rest', kind: 'rest' }] },
      { id: 'w2', weekNumber: 2, entries: [{ id: 'cancel', order: 1, planningState: 'cancelled', ref: { routineId: 'r', routineName: '', source: 'local' } }, { id: 'replaced', order: 2, planningState: 'rescheduled', ref: { routineId: 'r', routineName: '', source: 'local' } }, { id: 'missing', order: 3, ref: { routineId: 'missing', routineName: '', source: 'local' } }] },
    ] };
    const changed = { ...routine, exercises: [{ ...routine.exercises[0], sets: routine.exercises[0].sets.slice(0, 2) }] };
    const result = projectMesocycleBody(mesocycle, [changed]);
    expect(result.totalSets).toBe(4); expect(result.missingSessions).toBe(1);
    expect(projectMesocycleBody(mesocycle, [changed], [], 1).missingSessions).toBe(0);
    expect(projectAttemptsBody([attempt({ lineage: { mesocycleId: 'm', weekNumber: 1, plannedSessionId: 's1' } }), attempt({ id: 'other', lineage: { mesocycleId: 'x', weekNumber: 1, plannedSessionId: 's1' } })], [], { owner: 'owner', now, mesocycleId: 'm', weekNumber: 2 }).totalSets).toBe(0);
  });
  test('shared snapshots never invent roles, set types or muscle attribution', () => {
    const result = projectRecapBody([{ name: 'Press', muscleGroupIds: ['GM-101','GM-102'], sets: [{ completed: true, weight: 30, reps: 8 }, { completed: false, weight: 40, reps: 8 }] }]);
    expect(result.mode).toBe('shared-sets');
    expect(entry(result, 'chest')).toMatchObject({ value: 1, direct: 0, indirect: 0, unspecified: 1 });
  });
  test('overlapping public aggregates use maximum instead of adding or reconstructing sets', () => {
    const result = projectSharedBody([{ id: 'GM-120', value: 3 }, { id: 'GM-122', value: 2 }, { id: 'GM-121', value: 2 }]);
    expect(entry(result, 'upper-back').value).toBe(3);
    expect(result.totalSets).toBe(0); expect(result.mode).toBe('distribution');
  });
  test('scales are monotonic, bounded and handle missing effort separately from zero', () => {
    expect([0,1,3,5,8].map((value) => bodyColorLevel(value, 'volume', 8))).toEqual([0,1,2,3,4]);
    expect(bodyColorLevel(null, 'rir', 5)).toBe(0);
    expect(bodyColorLevel(0, 'rir', 5)).toBe(4);
    expect(bodyColorLevel(5, 'rir', 5)).toBe(1);
  });
});


test('profile map preserves weekly units, recorded effort, period and overlapping public axes', () => {
  const axis = { id: 'glutes', label: 'Glúteos', direct: 8, indirect: 8, equivalent: 12, days: 3, effortCount: 2, rirCount: 2, rirSum: 0, rpeCount: 0, rpeSum: 0 };
  const period = { start: '2026-08-21T00:00:00Z', end: '2026-09-18T00:00:00Z', axes: [axis, { ...axis, id: 'abductors', label: 'Abductores', equivalent: 4 }, { ...axis, id: 'hipFlexors', label: 'Flexores de cadera' }], eligibleSets: 16, unclassifiedSets: 1, unsupportedSets: 0, effortCount: 2 };
  const volume: import('../utils/muscleVolume').MuscleVolume = { metricVersion: 2, taxonomyVersion: 1, subjectId: 'public-subject', asOf: period.end, days: 28, coverage: 'unknown', current: period, previous: { ...period, axes: [] }, goals: {}, shareGoals: false };
  const result = projectVolumeBody(volume);
  expect(result.unit).toBe('Series equivalentes / semana');
  expect(entry(result, 'gluteal').value).toBe(3);
  expect(entry(result, 'gluteal').sources).toEqual(['Glúteos', 'Abductores']);
  expect(bodyMetricValue(entry(result, 'gluteal'), 'frequency')).toBe(3);
  expect(bodyMetricValue(entry(result, 'gluteal'), 'rir')).toBe(0);
  expect(bodyMetricValue(entry(result, 'gluteal'), 'rpe')).toBeNull();
  expect(result.unmapped).toEqual(['Flexores de cadera', '1 series sin clasificación completa']);
  expect(projectVolumeBody(volume, true).entries.every(item => item.value === 0)).toBe(true);
});
