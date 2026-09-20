import { describe, expect, test } from 'vitest';
import { Routine } from '../types';
import { isGuidanceRoutineUsable, newGuidancePreferences, selectFunctionalGuidance } from '../utils/functionalGuidance';
import { volumeAttempt, volumeNow, volumeSubject } from './fixtures/muscleVolume';

const routine = { id: 'r', name: 'Press', muscleGroups: ['chest'], createdAt: '', exercises: [{ id: 'e', name: 'Press', muscleGroups: ['chest'], sets: [{ id: 's', tipo: 1, weight: 0, reps: 8 }] }] } as Routine;
const base = () => ({ owner: volumeSubject, ready: true, busy: false, preferences: newGuidancePreferences(), routines: [] as Routine[], attempts: [] as ReturnType<typeof volumeAttempt>[], sessionIds: [] as string[], now: volumeNow });
describe('functional guidance derives learning from persisted evidence', () => {
  test('new users start preparation; opting in is required for ongoing guidance', () => {
    expect(selectFunctionalGuidance(base())).toMatchObject({ visible: true, prepared: false, recorded: false, next: { type: 'create' } });
    const input = base(); input.preferences.invitation = 'dismissed';
    expect(selectFunctionalGuidance(input).visible).toBe(false);
  });
  test('loading, unknown ownership, and recovery cannot navigate or announce milestones', () => {
    for (const patch of [{ ready: false }, { owner: null }, { busy: true }]) {
      expect(selectFunctionalGuidance({ ...base(), ...patch })).toMatchObject({ visible: false, next: { type: 'blocked' } });
    }
  });
  test('uses actual editor validation, including zero-load and timed prescriptions', () => {
    expect(isGuidanceRoutineUsable(routine)).toBe(true);
    expect(isGuidanceRoutineUsable({ ...routine, exercises: [] })).toBe(false);
    expect(isGuidanceRoutineUsable({ ...routine, name: '' })).toBe(false);
    const timed = structuredClone(routine); timed.exercises[0].sets[0] = { id: 's', tipo: 1, weight: 0, reps: 0, durationSeconds: 30, loadBasis: 'bodyweight' };
    expect(isGuidanceRoutineUsable(timed)).toBe(true);
    timed.exercises[0].sets[0].durationSeconds = 0;
    expect(isGuidanceRoutineUsable(timed)).toBe(false);
  });
  test('incomplete routines stay editable and multiple usable routines need explicit selection', () => {
    const input = base(); input.routines = [{ ...routine, exercises: [] }];
    expect(selectFunctionalGuidance(input).next).toEqual({ type: 'edit', id: 'r' });
    input.routines = [routine, { ...routine, id: 'second' }];
    expect(selectFunctionalGuidance(input).next).toEqual({ type: 'select' });
    input.preferences.selectedRoutineId = 'second';
    expect(selectFunctionalGuidance(input).next).toEqual({ type: 'train', id: 'second' });
    input.routines = [];
    expect(selectFunctionalGuidance(input).next).toEqual({ type: 'create' });
  });
  test('existing confirmed history suppresses invitation; explicit help resumes at the recap', () => {
    const input = base(); input.attempts = [volumeAttempt()]; input.sessionIds = ['a'];
    expect(selectFunctionalGuidance(input)).toMatchObject({ visible: false, recorded: true, next: { type: 'recap', id: 'a' } });
    input.preferences.invitation = 'accepted';
    expect(selectFunctionalGuidance(input).visible).toBe(true);
    input.sessionIds = [];
    expect(selectFunctionalGuidance(input).next).toEqual({ type: 'blocked' });
  });
  test('pending, future, foreign, zero-set and invalid performances never complete recording', () => {
    const pending = { ...volumeAttempt(), rewardApplication: { id: 'pending', state: 'pending' as const } };
    const invalid = structuredClone(volumeAttempt()); (invalid.exercises[0].sets[0].result as any).setId = 'wrong';
    for (const attempt of [pending, { ...volumeAttempt(), owner: 'other' }, { ...volumeAttempt(), completedAt: '2099-01-01' }, volumeAttempt('empty', 0), invalid]) {
      expect(selectFunctionalGuidance({ ...base(), attempts: [attempt], sessionIds: [attempt.id] }).recorded).toBe(false);
    }
  });
  test('partial performed work qualifies; opening a valid recap completes the guide, not rewards', () => {
    const attempt = volumeAttempt(); (attempt.completion as any).status = 'partial';
    const input = { ...base(), attempts: [attempt], sessionIds: ['a'] };
    input.preferences.invitation = 'accepted';
    expect(selectFunctionalGuidance(input).recorded).toBe(true);
    input.preferences.reviewedResultId = 'other';
    expect(selectFunctionalGuidance(input).reviewed).toBe(false);
    input.preferences.reviewedResultId = 'a';
    expect(selectFunctionalGuidance(input)).toMatchObject({ visible: false, reviewed: true, next: { type: 'complete' } });
  });
});
