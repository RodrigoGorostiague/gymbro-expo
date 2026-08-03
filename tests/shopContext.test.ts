import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const data = vi.hoisted(() => ({ attempts: [] as any[] }));
const wallet = vi.hoisted(() => ({ claim: vi.fn() }));
const themeSync = vi.hoisted(() => ({ subscribe: vi.fn(() => () => undefined), sync: vi.fn() }));
const presentation = vi.hoisted(() => ({ sync: vi.fn(async () => undefined) }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: 'uid-1' }) }));
vi.mock('../context/DataContext', () => ({ useData: () => ({ attempts: data.attempts }) }));
vi.mock('../services/rewardWallet', () => ({
  claimWelcomeGemReward: wallet.claim,
  purchaseRewardTheme: vi.fn(),
  updateRewardWalletPreferences: vi.fn(),
}));
vi.mock('../services/themeSync', () => ({
  subscribeToEquippedThemes: themeSync.subscribe,
  syncEquippedTheme: themeSync.sync,
}));
vi.mock('../services/socialGraph', () => ({ syncOwnPresentationTheme: presentation.sync }));

import { ShopProvider, useShop } from '../context/ShopContext';

const emptyWallet = { balance: 0, purchasedThemeIds: [], equippedThemeId: null, combineWithPartner: false };
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
  });

  test('refreshes the remote wallet only when finalized attempts change', async () => {
    let current: ReturnType<typeof useShop> | undefined;
    const Probe = () => { current = useShop(); return null; };
    const render = () => React.createElement(ShopProvider, null, React.createElement(Probe));
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => { renderer = TestRenderer.create(render()); });
    expect(wallet.claim).toHaveBeenCalledOnce();

    await act(async () => { renderer.update(render()); });
    expect(wallet.claim).toHaveBeenCalledOnce();

    data.attempts = [{ id: 'attempt-1' }];
    wallet.claim.mockResolvedValueOnce({ claimed: false, wallet: { ...emptyWallet, balance: 9 } });
    await act(async () => { renderer.update(render()); });

    expect(wallet.claim).toHaveBeenCalledTimes(2);
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
    await act(async () => { renderer.update(render()); });
    await act(async () => { refreshed.resolve({ claimed: false, wallet: { ...emptyWallet, balance: 9 } }); await refreshed.promise; });
    await act(async () => { initial.resolve({ claimed: false, wallet: { ...emptyWallet, balance: 1 } }); await initial.promise; });

    expect(current?.gems).toBe(9);
  });
});
