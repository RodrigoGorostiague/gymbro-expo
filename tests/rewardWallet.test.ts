import { beforeEach, describe, expect, test, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../services/supabase', () => ({ supabase: { rpc }, supabaseConfigurationError: null }));

import { claimWelcomeGemReward, loadRewardWallet, purchaseRewardTheme, receiptTotal, updateRewardWalletPreferences } from '../services/rewardWallet';

const wallet = { balance: 25, purchasedThemeIds: ['white'], equippedThemeId: 'white', combineWithPartner: false };

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

  test('totals only positive server receipt entries', () => {
    expect(receiptTotal({ balance: 12, weekly: {}, entries: [
      { kind: 'valid_sets', amount: 5, breakdown: {} }, { kind: 'theme_purchase', amount: -3, breakdown: {} },
    ] })).toBe(5);
  });
});
