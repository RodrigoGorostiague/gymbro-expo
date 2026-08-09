import { describe, expect, test } from 'vitest';
import { ANTHROPOMETRICS, anthropometricByType } from '../constants/anthropometrics';
import { AVATARS, avatarsForSex } from '../constants/avatars';

describe('anthropometric catalog', () => {
  test('defines private bodybuilding measurements with their canonical units', () => {
    expect(anthropometricByType.body_weight.unit).toBe('kg');
    expect(anthropometricByType.height.unit).toBe('cm');
    expect(ANTHROPOMETRICS.map(({ type }) => type)).toEqual(expect.arrayContaining(['chest', 'biceps_flexed', 'thigh', 'calf']));
  });

  test('renders only the selected sex avatar group', () => {
    const female = avatarsForSex('female');
    const male = avatarsForSex('male');
    expect(female).not.toEqual([]);
    expect(male).not.toEqual([]);
    expect(female.every((id) => AVATARS[id].sex === 'female')).toBe(true);
    expect(male.every((id) => AVATARS[id].sex === 'male')).toBe(true);
  });
});
