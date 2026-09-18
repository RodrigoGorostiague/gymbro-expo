import { beforeEach, describe, expect, test, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../services/supabase', () => ({ supabase: { rpc }, supabaseConfigurationError: null }));

import { getCommunityBadgeCounts } from '../services/communityBadge';

describe('community badge boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  test('loads the server-owned aggregate instead of paginated client lists', async () => {
    const counts = { incomingRequests: 1, unreadNotifications: 2, jointInvitations: 1, planShareRequests: 3, total: 7 };
    rpc.mockResolvedValue({ data: counts, error: null });
    await expect(getCommunityBadgeCounts()).resolves.toEqual(counts);
    expect(rpc).toHaveBeenCalledWith('get_community_badge_counts');
  });
});
