import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../services/supabase', () => ({ supabase: { rpc } }));
import { deleteBodyMeasurements, loadBodyEvolution, saveBodyDay } from '../services/bodyEvolution';
import { localDay } from '../utils/bodyEvolution';
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: [], error: null }); });
describe('body evolution persistence', () => {
  it('saves a complete numeric batch atomically with calendar context', async () => {
    const values = [{ metricType: 'body_weight' as const, value: 70 }, { metricType: 'waist' as const, value: 82 }];
    await saveBodyDay(localDay(), values);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('save_body_day', { day_input: localDay(), timezone_input: 'America/New_York', measurements_input: values });
  });
  it('rejects invalid/empty entries and backdating before the network', async () => {
    await expect(saveBodyDay(localDay(), [])).rejects.toThrow();
    await expect(saveBodyDay(localDay(), [{ metricType: 'body_weight', value: NaN }])).rejects.toThrow();
    await expect(saveBodyDay('2000-01-01', [{ metricType: 'body_weight', value: 70 }])).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('surfaces remote failure without reporting success', async () => {
    rpc.mockResolvedValue({ error: { message: 'Offline' } });
    await expect(saveBodyDay(localDay(), [{ metricType: 'body_weight', value: 70 }])).rejects.toThrow('Offline');
  });
  it('retains stable day keys and numeric values', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'a', metric_type: 'body_weight', value: '70', unit: 'kg', record_day: '2026-09-17', measured_at: '2026-09-18T01:00:00Z', source: 'manual' }] });
    expect((await loadBodyEvolution('alice'))[0]).toMatchObject({ owner: 'alice', value: 70, day: '2026-09-17' });
  });
  it('skips the network when deleting photo-only entries', async () => {
    await deleteBodyMeasurements([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
