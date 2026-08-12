import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const data = vi.hoisted(() => ({ attempts: [] as any[] }));
const wallet = vi.hoisted(() => ({ acknowledge: vi.fn(), claim: vi.fn(), claimUpdates: vi.fn(), load: vi.fn(), purchaseFrame: vi.fn() }));
const themeSync = vi.hoisted(() => ({ subscribe: vi.fn(() => () => undefined), sync: vi.fn() }));
const presentation = vi.hoisted(() => ({ sync: vi.fn(async () => undefined) }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: 'uid-1' }) }));
vi.mock('../context/DataContext', () => ({ useData: () => ({ attempts: data.attempts }) }));
vi.mock('../services/rewardWallet', () => ({
  claimWelcomeGemReward: wallet.claim,
  acknowledgeReleaseUpdates: wallet.acknowledge,
  claimPendingReleaseUpdates: wallet.claimUpdates,
  loadRewardWallet: wallet.load,
  purchaseRewardTheme: vi.fn(),
  purchaseRewardFrame: wallet.purchaseFrame,
  updateRewardWalletPreferences: vi.fn(),
}));
vi.mock('../services/themeSync', () => ({
  subscribeToEquippedThemes: themeSync.subscribe,
  syncEquippedTheme: themeSync.sync,
}));
vi.mock('../services/socialGraph', () => ({ syncOwnPresentationTheme: presentation.sync }));

import { ShopProvider, useShop } from '../context/ShopContext';

const emptyWallet = { balance: 0, purchasedThemeIds: [], purchasedFrameIds: [], purchasedTitleIds: [], equippedThemeId: null, combineWithPartner: false };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('ShopProvider reward wallet refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    data.attempts = [];
    wallet.claim.mockResolvedValue({ claimed: false, wallet: emptyWallet });
    wallet.claimUpdates.mockResolvedValue({ claimed: false, wallet: emptyWallet, releases: [] });
    wallet.load.mockResolvedValue(emptyWallet);
  });

  test('refreshes the remote wallet only when finalized attempts change', async () => {
    let current: ReturnType<typeof useShop> | undefined;
    const Probe = () => { current = useShop(); return null; };
    const render = () => React.createElement(ShopProvider, null, React.createElement(Probe));
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => { renderer = TestRenderer.create(render()); });
    expect(wallet.claim).toHaveBeenCalledOnce();
    expect(wallet.claimUpdates).toHaveBeenCalledWith(7);
    expect(wallet.load).not.toHaveBeenCalled();

    await act(async () => { renderer.update(render()); });
    expect(wallet.claim).toHaveBeenCalledOnce();
    expect(wallet.claimUpdates).toHaveBeenCalledOnce();
    expect(wallet.load).not.toHaveBeenCalled();

    data.attempts = [{ id: 'attempt-1' }];
    wallet.claim.mockResolvedValueOnce({ claimed: false, wallet: { ...emptyWallet, balance: 9 } });
    wallet.claimUpdates.mockResolvedValueOnce({ claimed: false, wallet: { ...emptyWallet, balance: 9 }, releases: [] });
    await act(async () => { renderer.update(render()); });

    expect(wallet.claim).toHaveBeenCalledTimes(2);
    expect(wallet.claimUpdates).toHaveBeenCalledTimes(2);
    expect(wallet.load).not.toHaveBeenCalled();
    expect(current?.gems).toBe(9);
  });

  test('ignores an older wallet response after an attempt-triggered refresh', async () => {
    const initial = deferred<{ claimed: boolean; wallet: typeof emptyWallet }>();
    const refreshed = deferred<{ claimed: boolean; wallet: typeof emptyWallet }>();
    wallet.claim.mockReturnValueOnce(initial.promise).mockReturnValueOnce(refreshed.promise);
    let current: ReturnType<typeof useShop> | undefined;
    const Probe = () => { current = useShop(); return null; };
    const render = () => React.createElement(ShopProvider, null, React.createElement(Probe));
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => { renderer = TestRenderer.create(render()); });
    data.attempts = [{ id: 'attempt-1' }];
    wallet.claimUpdates.mockResolvedValueOnce({ claimed: false, wallet: { ...emptyWallet, balance: 9 }, releases: [] });
    await act(async () => { renderer.update(render()); });
    await act(async () => { refreshed.resolve({ claimed: false, wallet: { ...emptyWallet, balance: 9 } }); await refreshed.promise; });
    await act(async () => { initial.resolve({ claimed: false, wallet: { ...emptyWallet, balance: 1 } }); await initial.promise; });

    expect(current?.gems).toBe(9);
  });

  test('keeps the safe default wallet when the welcome claim is rejected', async () => {
    wallet.claim.mockRejectedValueOnce(new Error('profile missing'));
    let current: ReturnType<typeof useShop> | undefined;
    const Probe = () => { current = useShop(); return null; };

    await expect(act(async () => { TestRenderer.create(React.createElement(ShopProvider, null, React.createElement(Probe))); })).resolves.toBeUndefined();

    expect(wallet.claim).toHaveBeenCalledOnce();
    expect(current?.gems).toBe(0);
    expect(current?.isLoading).toBe(false);
    expect(current?.welcomeGemReward).toBeNull();
  });

  test('loads earned gems even when an optional release claim is unavailable', async () => {
    wallet.claimUpdates.mockRejectedValueOnce(new Error('release migration unavailable'));
    wallet.load.mockResolvedValueOnce({ ...emptyWallet, balance: 12 });
    let current: ReturnType<typeof useShop> | undefined;
    const Probe = () => { current = useShop(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(ShopProvider, null, React.createElement(Probe))); });

    expect(wallet.load).toHaveBeenCalledOnce();
    expect(current?.gems).toBe(12);
  });

  test('acknowledges presented release updates remotely and restores them if acknowledgement fails', async () => {
    const release = { version: '0.5.0', title: 'Release', message: 'Message', features: ['Feature'], fixes: ['Fix'], rewardGems: 50, rewardClaimed: true };
    wallet.claimUpdates.mockResolvedValueOnce({ claimed: true, wallet: { ...emptyWallet, balance: 50 }, releases: [release] });
    let current: ReturnType<typeof useShop> | undefined;
    const Probe = () => { current = useShop(); return null; };

    await act(async () => { TestRenderer.create(React.createElement(ShopProvider, null, React.createElement(Probe))); });
    expect(current?.releaseUpdates).toEqual([release]);

    wallet.acknowledge.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await current?.dismissReleaseUpdates(); });

    expect(wallet.acknowledge).toHaveBeenCalledWith(['0.5.0']);
    expect(current?.releaseUpdates).toEqual([release]);
  });
});
