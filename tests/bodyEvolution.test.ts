import { describe, expect, it } from 'vitest';
import { assertToday, BODY_POSES, elapsedDays, groupBodyHistory, localDay } from '../utils/bodyEvolution';
import { BodyMetric } from '../types';

describe('body evolution daily records', () => {
  it('uses the device calendar date rather than UTC', () => {
    expect(localDay(new Date('2026-09-18T01:00:00Z'))).toBe('2026-09-17');
  });
  it('counts calendar days across daylight saving boundaries', () => {
    expect(elapsedDays('2026-03-07', '2026-03-09')).toBe(2);
    expect(elapsedDays('2026-09-17', '2026-09-17')).toBe(0);
  });
  it('rejects retroactive and future capture confirmation', () => {
    const now = new Date(2026, 8, 17, 12);
    expect(() => assertToday('2026-09-17', now)).not.toThrow();
    expect(() => assertToday('2026-09-16', now)).toThrow();
    expect(() => assertToday('2026-09-18', now)).toThrow();
  });
  it('preserves legacy duplicates and groups photos with numeric entries', () => {
    const metric = { id: 'a', measuredAt: '2026-09-17T16:00:00Z', value: 70 } as BodyMetric;
    const groups = groupBodyHistory([metric, { ...metric, id: 'b' }], [{ id: 'p', day: '2026-09-17', pose: 'back', uri: 'file://photo', capturedAt: metric.measuredAt }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].metrics).toHaveLength(2);
    expect(groups[0].photos).toHaveLength(1);
    expect(BODY_POSES).toHaveLength(4);
  });
});
