import { beforeEach, describe, expect, test, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../services/supabase', () => ({ supabase: { rpc }, supabaseConfigurationError: null }));

import { acknowledgeReleaseUpdates, claimPendingReleaseGemRewards, claimPendingReleaseUpdates, claimWelcomeGemReward, loadRewardWallet, purchaseRewardFrame, purchaseRewardTheme, receiptTotal, updateRewardWalletPreferences } from '../services/rewardWallet';

const wallet = { balance: 25, purchasedThemeIds: ['white'], purchasedFrameIds: [], purchasedTitleIds: [], purchasedBackgroundIds: [], equippedThemeId: 'white', equippedBackgroundId: null, combineWithPartner: false };

describe('remote reward wallet boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  test('loads the authenticated wallet without AsyncStorage recovery', async () => {
    rpc.mockResolvedValueOnce({ data: wallet, error: null });
    await expect(loadRewardWallet()).resolves.toEqual(wallet);
    expect(rpc).toHaveBeenCalledWith('load_reward_wallet', {});
  });

  test('uses the server catalog purchase RPC without a client price', async () => {
    rpc.mockResolvedValueOnce({ data: { ...wallet, balance: 13, purchasedThemeIds: ['white', 'black'] }, error: null });
    await expect(purchaseRewardTheme('black')).resolves.toMatchObject({ balance: 13 });
    expect(rpc).toHaveBeenCalledWith('purchase_reward_theme', { theme_id_input: 'black' });
  });

  test('uses the separate server-owned frame inventory purchase RPC', async () => {
    rpc.mockResolvedValueOnce({ data: { ...wallet, balance: 13, purchasedFrameIds: ['shop-heavy-duty'] }, error: null });
    await expect(purchaseRewardFrame('shop-heavy-duty')).resolves.toMatchObject({ purchasedFrameIds: ['shop-heavy-duty'] });
    expect(rpc).toHaveBeenCalledWith('purchase_reward_profile_frame', { frame_id_input: 'shop-heavy-duty' });
  });

  test('persists presentation preferences remotely', async () => {
    rpc.mockResolvedValueOnce({ data: { ...wallet, combineWithPartner: true }, error: null });
    await updateRewardWalletPreferences('white', true);
    expect(rpc).toHaveBeenCalledWith('update_reward_wallet_preferences', {
      equipped_theme_id_input: 'white', combine_with_partner_input: true,
    });
  });

  test('claims the launch reward through the idempotent server RPC', async () => {
    rpc.mockResolvedValueOnce({ data: { claimed: true, wallet: { ...wallet, balance: 275 } }, error: null });
    await expect(claimWelcomeGemReward()).resolves.toEqual({ claimed: true, wallet: { ...wallet, balance: 275 } });
    expect(rpc).toHaveBeenCalledWith('claim_welcome_gem_reward', {});
  });

  test('claims all pending release rewards through one server-owned RPC', async () => {
    rpc.mockResolvedValueOnce({ data: { claimed: true, wallet: { ...wallet, balance: 225 } }, error: null });
    await expect(claimPendingReleaseGemRewards()).resolves.toEqual({ claimed: true, wallet: { ...wallet, balance: 225 } });
    expect(rpc).toHaveBeenCalledWith('claim_pending_release_gem_rewards', {});
  });

  test('loads the server-owned release digest after crediting pending rewards', async () => {
    const updates = { claimed: true, wallet, releases: [{ version: '0.5.0', title: 'Release', message: 'Message', features: ['Feature'], fixes: ['Fix'], rewardGems: 50, rewardClaimed: true }] };
    rpc.mockResolvedValueOnce({ data: updates, error: null });
    await expect(claimPendingReleaseUpdates(6)).resolves.toEqual(updates);
    expect(rpc).toHaveBeenCalledWith('claim_pending_release_updates', { max_release_sequence: 6 });
  });

  test('acknowledges release updates remotely after they are presented', async () => {
    rpc.mockResolvedValueOnce({ error: null });
    await expect(acknowledgeReleaseUpdates(['0.4.1', '0.5.0'])).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('acknowledge_release_updates', { versions: ['0.4.1', '0.5.0'] });
  });

  test('totals only positive server receipt entries', () => {
    expect(receiptTotal({ balance: 12, weekly: {}, entries: [
      { kind: 'valid_sets', amount: 5, breakdown: {} }, { kind: 'theme_purchase', amount: -3, breakdown: {} },
    ] })).toBe(5);
  });
});
