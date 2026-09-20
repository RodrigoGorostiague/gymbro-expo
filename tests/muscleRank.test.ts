import { describe, expect, test } from 'vitest';
import { deriveMuscleRanks, rankFromDays } from '../utils/muscleRank';
import { MUSCLE_RANKS, muscleRankIndex } from '../constants/muscleRanks';
import { projectRankBody } from '../utils/bodyMapProjection';
import { volumeAttempt, volumeCases, volumeNow, volumeSubject } from './fixtures/muscleVolume';
const DAY = 86400000;
const rank = (days: { day: string; equivalents: Record<string, number> }[], now = '2026-09-18T12:00:00Z', pauses: { start: string; end: string | null }[] = []) => rankFromDays(days, volumeSubject, Date.parse(now), pauses);
const event = (day: string, chest: number) => ({ day, equivalents: { chest } });
describe('muscle rank balance', () => {
  test('eight ranks have increasing costs, independent of global subdivisions', () => {
    expect(MUSCLE_RANKS.map(r => muscleRankIndex(r.xp))).toEqual([0,1,2,3,4,5,6,7]);
    expect(muscleRankIndex(99)).toBe(0); expect(muscleRankIndex(299)).toBe(1);
    const costs = MUSCLE_RANKS.slice(1).map((r,i) => r.xp - MUSCLE_RANKS[i].xp);
    expect(costs.every((c,i) => i === 0 || c > costs[i-1])).toBe(true);
  });
  test('reuses volume validation, deduplication and indirect attribution', () => {
    const a = volumeAttempt('a',5);
    const ranks = deriveMuscleRanks([a,a],volumeSubject,volumeNow);
    expect(ranks.axes[0].xp).toBe(50); expect(ranks.axes.find(a=>a.id==='triceps')!.xp).toBe(25);
    const invalid = volumeCases().find(c=>c.name==='warmups skipped invalid and timed')!;
    expect(deriveMuscleRanks(invalid.attempts,volumeSubject,volumeNow).axes[0].lastActivity).toBeNull();
  });
  test('daily cap is shared across sessions; weekly cap rolls rather than resets on Monday', () => {
    const a=volumeAttempt('a',6), b=volumeAttempt('b',6);
    expect(deriveMuscleRanks([a,b],volumeSubject,volumeNow).axes[0].xp).toBe(60);
    const days=[event('2026-09-11',6),event('2026-09-12',6),event('2026-09-13',6),event('2026-09-18',6)];
    const chest=rank(days).axes[0]; expect(chest.xp).toBe(180);expect(chest.earnedToday).toBe(60);expect(chest.earnedSevenDays).toBe(120);
  });
  test('seven protected days, first deduction on day eight, no rounding promotion', () => {
    const days=[event('2026-09-01',6)];
    expect(rank(days,'2026-09-08T23:59:59Z').axes[0].xp).toBe(60);
    expect(rank(days,'2026-09-09T00:00:00Z').axes[0].xp).toBe(59);
    expect(rank(days,'2026-10-09T00:00:00Z').axes[0].peakXp).toBe(60);
  });
  test('single series does not reset protection, two equivalents do even with capped XP', () => {
    expect(rank([event('2026-09-01',6),event('2026-09-07',1)],'2026-09-09T12:00:00Z').axes[0].protectionDays).toBe(0);
    expect(rank([event('2026-09-01',6),event('2026-09-02',6),event('2026-09-07',2)],'2026-09-09T12:00:00Z').axes[0].protectionDays).toBe(5);
  });
  test('pause excludes points and freezes decay, resumes without retroactive loss', () => {
    const days=[event('2026-09-01',6),event('2026-09-12',6)];
    const pauses=[{start:'2026-09-03',end:'2026-09-17'}];
    const chest=rank(days,undefined,pauses).axes[0];expect(chest.xp).toBe(60);expect(chest.lastActivity).toBe('2026-09-01');expect(chest.protectionDays).toBe(4);
    expect(rank(days,'2026-09-12T12:00:00Z',pauses).paused).toBe(true);
  });
  test('long-term activity reaches Sigma but cannot bank unlimited protection', () => {
    const start=Date.parse('2024-01-01T12:00:00Z');
    const days=Array.from({length:800},(_,i)=>event(new Date(start+i*DAY).toISOString().slice(0,10),6));
    const chest=rank(days,new Date(start+800*DAY).toISOString()).axes[0];expect(chest.xp).toBe(11000);expect(muscleRankIndex(chest.xp)).toBe(7);
  });
  test('overlapping geometry chooses a deterministic rank; unmapped muscle stays in list', () => {
    const ranks=rank([{day:'2026-09-17',equivalents:{glutes:2,abductors:6,hipFlexors:2}},{day:'2026-09-18',equivalents:{abductors:6}}]);
    const projection=projectRankBody(ranks);const glute=projection.entries.find(e=>e.id==='gluteal')!;
    expect(glute.rankAxisId).toBe('abductors');expect(glute.rankColor).toBe(MUSCLE_RANKS[1].color);expect(projection.unmapped).toContain('Flexores de cadera');
    expect(projection.entries.find(e=>e.id==='chest')!.rankColor).toBeUndefined();
  });
});
