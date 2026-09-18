import { beforeEach, expect, test, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../services/supabase', () => ({ supabase: { rpc } }));
import { getRecordGemRewards } from '../services/recordRewards';
beforeEach(() => vi.clearAllMocks());
test('reads only immutable server awards without submitting a client count', async () => {
  const award = { amount: 25, recordType: 'volume', exerciseId: 'e', variant: 'Barra', unit: 'kg' };
  rpc.mockResolvedValue({ data: [award], error: null });
  expect(await getRecordGemRewards('a')).toEqual([award]);
  expect(rpc).toHaveBeenCalledWith('get_record_gem_rewards', { attempt_id_input: 'a' });
});
test.each([null, {}, [{ amount: 100, recordType: 'load' }], [{ amount: 25, recordType: 'fake' }]])('does not treat malformed awards as confirmed: %j', async (data) => {
  rpc.mockResolvedValue({ data, error: null });
  await expect(getRecordGemRewards('a')).rejects.toThrow();
});
test('missing deployment or network error stays unknown, not zero awarded', async () => {
  const error = { code: 'PGRST202' }; rpc.mockResolvedValue({ data: null, error });
  await expect(getRecordGemRewards('a')).rejects.toBe(error);
});
