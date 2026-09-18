import { beforeEach, describe, expect, test, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../services/supabase', () => ({
  supabase: { rpc },
  supabaseConfigurationError: null,
}));

import {
  acceptPrivatePlanShareRequest,
  createPrivatePlanShareRequest,
  getProfilePlanLibrary,
  listReceivedPrivatePlanShareRequests,
  rejectPrivatePlanShareRequest,
} from '../services/privatePlanSharing';

describe('private plan sharing service', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test('maps profile library and creates a server-owned request', async () => {
    rpc.mockResolvedValueOnce({ data: { routines: [{ id: 'routine-1', name: 'Upper', muscleGroups: ['chest'], exercises: [], createdAt: '2026-08-02T00:00:00.000Z' }], mesocycles: [] }, error: null })
      .mockResolvedValueOnce({ data: 'share-1', error: null });

    await expect(getProfilePlanLibrary('member-2')).resolves.toMatchObject({ routines: [{ id: 'routine-1' }], mesocycles: [] });
    await expect(createPrivatePlanShareRequest('member-2', 'routine', 'routine-1')).resolves.toBe('share-1');
    expect(rpc).toHaveBeenNthCalledWith(1, 'get_profile_plan_library', { source_profile_id: 'member-2' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'create_private_plan_share_request', { target_profile_id: 'member-2', content_kind_input: 'routine', content_id: 'routine-1' });
  });

  test('maps pending requests and accepts or rejects only through RPC commands', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: 'share-1', senderAlias: 'Alex', senderAvatarId: 'capigirl', senderThemeId: 'moon', contentKind: 'mesocycle', createdAt: '2026-08-02T00:00:00.000Z', snapshot: { routines: [], mesocycle: { id: 'mesocycle-1', name: 'Block', durationWeeks: 4, weeks: [], status: 'draft', goal: '', createdAt: '2026-08-02T00:00:00.000Z' } } }], error: null })
      .mockResolvedValueOnce({ data: { routineIds: ['routine-copy'], mesocycleId: 'mesocycle-copy' }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(listReceivedPrivatePlanShareRequests()).resolves.toMatchObject([{ senderAlias: 'Alex', senderAvatarId: 'capigirl', senderThemeId: 'moon', snapshot: { mesocycle: { id: 'mesocycle-1' } } }]);
    await expect(acceptPrivatePlanShareRequest('share-1')).resolves.toEqual({ routineIds: ['routine-copy'], mesocycleId: 'mesocycle-copy' });
    await expect(rejectPrivatePlanShareRequest('share-2')).resolves.toBeUndefined();
    expect(rpc).toHaveBeenNthCalledWith(1, 'list_received_private_plan_share_requests');
    expect(rpc).toHaveBeenNthCalledWith(2, 'accept_private_plan_share_request', { request_id: 'share-1' });
    expect(rpc).toHaveBeenNthCalledWith(3, 'reject_private_plan_share_request', { request_id: 'share-2' });
  });

  test('normalizes absent sender presentation metadata to safe client defaults', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: 'share-1', senderAlias: 'Alex', senderAvatarId: 'unknown-avatar', contentKind: 'routine', createdAt: '2026-08-02T00:00:00.000Z', snapshot: { routines: [] } }], error: null });

    await expect(listReceivedPrivatePlanShareRequests()).resolves.toMatchObject([{
      senderAvatarId: 'capybara-athlete',
      senderThemeId: null,
    }]);
  });
});
