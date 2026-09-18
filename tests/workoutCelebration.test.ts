import { expect, test } from 'vitest';
import { celebrationFrame, celebrationRankChanged, celebrationSteps } from '../utils/workoutCelebration';
import { xpForNextLevel } from '../utils/experience';
import type { ExperienceReceipt } from '../types';
const receipt = (level: number, xp: number, earnedXp: number): ExperienceReceipt => ({ attemptId: 'a', earnedXp, entries: [], progress: { level, rank: level >= 5 ? 'Intermedio' : 'Principiante', xpIntoLevel: xp, xpForNextLevel: xpForNextLevel(level), totalXp: 9999 } });
test('animates from previous XP and finishes exactly at the receipt', () => {
 const steps = celebrationSteps(receipt(2, 60, 25));
 expect(celebrationFrame(steps, 0)).toMatchObject({ level: 2, xp: 35 });
 expect(celebrationFrame(steps, 1)).toMatchObject({ level: 2, xp: 60 });
 expect(celebrationRankChanged(steps)).toBe(false);
});
test('fills the prior level, increments the number and carries remaining XP', () => {
 const steps = celebrationSteps(receipt(5, 20, 50));
 expect(steps[0]).toMatchObject({ level: 4, from: xpForNextLevel(4) - 30, to: xpForNextLevel(4) });
 expect(celebrationFrame(steps, 0.5)).toMatchObject({ level: 5, xp: 0 });
 expect(celebrationFrame(steps, 1)).toMatchObject({ level: 5, xp: 20 });
 expect(celebrationRankChanged(steps)).toBe(true);
});
test('handles exact boundaries, zero rewards, multiple levels and bounded progress', () => {
 const exact = celebrationSteps(receipt(2, 0, 20));
 expect(celebrationFrame(exact, 1)).toMatchObject({ level: 2, xp: 0, percent: 0 });
 const zero = celebrationSteps(receipt(1, 0, 0));
 expect(celebrationFrame(zero, -1).percent).toBe(0);
 const multi = celebrationSteps(receipt(3, 10, 10 + xpForNextLevel(1) + xpForNextLevel(2)));
 expect(multi.map((step) => step.level)).toEqual([1, 2, 3]);
 expect(celebrationFrame(multi, 2)).toMatchObject({ level: 3, xp: 10 });
});
