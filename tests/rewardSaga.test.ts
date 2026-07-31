import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ShopState, WORKOUT_ATTEMPT_VERSION, WorkoutAttempt } from '../types';

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  const failures = new Map<string, number>();
  return {
    data,
    failures,
    getItem: vi.fn(async (key: string) => data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      const remaining = failures.get(key) ?? 0;
      if (remaining > 0) {
        failures.set(key, remaining - 1);
        throw new Error(`write failed: ${key}`);
      }
      data.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => { data.delete(key); }),
  };
});

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../context/DataContext', () => ({ useData: vi.fn() }));
vi.mock('../services/themeSync', () => ({
  subscribeToEquippedThemes: vi.fn(),
  syncEquippedTheme: vi.fn(),
}));

import {
  loadAttempts,
  loadShop,
  mutateAttempts,
  mutateShop,
  recoverPendingAttemptRewards,
  saveAttempts,
} from '../utils/storage';
import { getWorkoutsInWeek } from '../utils/gems';
import { applyThemePurchase, loadRecoveredShop } from '../context/ShopContext';

const attemptKey = (profile: string) => `@gymbro/attempts/v1/${profile}`;
const shopKey = (profile: string) => `@gymbro/shop/${profile}`;
const now = '2026-07-24T12:00:00.000Z';

function attempt(
  id: string,
  owner: 'rodaja' | 'brisas' = 'rodaja',
  status: WorkoutAttempt['completion']['status'] = 'fully-completed',
): WorkoutAttempt {
  const reward = status === 'partial'
    ? { setGems: 2, completionGems: 0, fullCompletionBonus: 0, totalGems: 2, qualifiesForCompletion: false }
    : { setGems: 7, completionGems: 5, fullCompletionBonus: 3, totalGems: 15, qualifiesForCompletion: true };
  return {
    version: WORKOUT_ATTEMPT_VERSION,
    id,
    owner,
    routineId: 'routine-1',
    recordedRoutineName: 'Routine',
    completedAt: now,
    durationSeconds: 60,
    restTimerSeconds: 30,
    exercises: [],
    completion: {
      validSets: status === 'partial' ? 2 : 7,
      plannedSets: 7,
      adherence: status === 'partial' ? 2 / 7 : 1,
      displayPercent: status === 'partial' ? 29 : 100,
      status,
    },
    reward,
    rewardApplication: { id: `${owner}:${id}:v1`, state: 'pending' },
  };
}

function shop(profile: 'rodaja' | 'brisas'): ShopState {
  return JSON.parse(storage.data.get(shopKey(profile)) ?? 'null') as ShopState;
}

beforeEach(() => {
  storage.data.clear();
  storage.failures.clear();
  vi.clearAllMocks();
});

describe('idempotent reward saga', () => {
  test('does not grant when attempt persistence fails', async () => {
    storage.failures.set(attemptKey('rodaja'), 1);
    await expect(saveAttempts('rodaja', [attempt('a')])).rejects.toThrow('write failed');

    await expect(loadShop('rodaja')).resolves.toMatchObject({ gems: 0, rewardReceiptIds: [] });
  });

  test('leaves a recoverable pending reward when the shop write fails', async () => {
    await saveAttempts('rodaja', [attempt('a')]);
    storage.failures.set(shopKey('rodaja'), 1);

    await expect(recoverPendingAttemptRewards('rodaja', now)).rejects.toThrow('write failed');
    expect((await loadAttempts('rodaja'))[0].rewardApplication.state).toBe('pending');
    await expect(recoverPendingAttemptRewards('rodaja', now)).resolves.toMatchObject({ shop: { gems: 15 } });
  });

  test('shows persisted shop state after recovery rejection and retries deterministically', async () => {
    await mutateShop('rodaja', (current) => ({ ...current, gems: 4 }));
    await saveAttempts('rodaja', [{
      ...attempt('a'),
      rewardApplication: { id: 'invalid', state: 'pending' },
    }]);

    await expect(loadRecoveredShop('rodaja')).resolves.toMatchObject({ gems: 4 });
    expect((await loadAttempts('rodaja'))[0].rewardApplication.state).toBe('pending');

    await saveAttempts('rodaja', [attempt('a')]);
    await expect(loadRecoveredShop('rodaja')).resolves.toMatchObject({ gems: 19 });
    expect((await loadAttempts('rodaja'))[0].rewardApplication.state).toBe('applied');
  });

  test('grants valid-set gems but no completion reward for a partial attempt', async () => {
    await saveAttempts('rodaja', [attempt('partial', 'rodaja', 'partial')]);

    const recovered = await recoverPendingAttemptRewards('rodaja', now);

    expect(recovered.shop).toMatchObject({ gems: 2, rewardReceiptIds: ['rodaja:partial:v1'] });
  });

  test('receipt prevents a duplicate grant when attempt marking fails', async () => {
    await saveAttempts('rodaja', [attempt('a')]);
    storage.failures.set(attemptKey('rodaja'), 1);

    await expect(recoverPendingAttemptRewards('rodaja', now)).rejects.toThrow('write failed');
    expect(shop('rodaja')).toMatchObject({ gems: 15, rewardReceiptIds: ['rodaja:a:v1'] });

    const recovered = await recoverPendingAttemptRewards('rodaja', now);
    expect(recovered.shop.gems).toBe(15);
    expect(recovered.attempts[0].rewardApplication).toEqual({ id: 'rodaja:a:v1', state: 'applied', appliedAt: now });
  });

  test('normalizes a pre-receipt shop before applying a pending reward exactly once', async () => {
    storage.data.set(shopKey('rodaja'), JSON.stringify({
      gems: 9,
      purchasedThemeIds: ['white', 'legacy-theme'],
      equippedThemeId: 'legacy-theme',
      combineWithPartner: true,
      weeklyGoal: { bonusWeekKey: '2026-W29', lastWeekWorkouts: 3 },
    }));
    await saveAttempts('rodaja', [attempt('legacy')]);

    await recoverPendingAttemptRewards('rodaja', now);
    await recoverPendingAttemptRewards('rodaja', now);

    expect(shop('rodaja')).toMatchObject({
      gems: 24,
      rewardReceiptIds: ['rodaja:legacy:v1'],
      equippedThemeId: 'legacy-theme',
      combineWithPartner: true,
      weeklyGoal: { bonusWeekKey: '2026-W29', lastWeekWorkouts: 3 },
    });
    expect(shop('rodaja').purchasedThemeIds).toContain('legacy-theme');
  });

  test('replaces and persists an invalid reward receipt collection', async () => {
    storage.data.set(shopKey('rodaja'), JSON.stringify({ gems: 7, rewardReceiptIds: null }));

    await expect(loadShop('rodaja')).resolves.toMatchObject({ gems: 7, rewardReceiptIds: [] });
    expect(shop('rodaja')).toMatchObject({ gems: 7, rewardReceiptIds: [] });
  });

  test('serializes rewards by profile and never grants duplicate retries', async () => {
    await saveAttempts('rodaja', [attempt('a'), attempt('b')]);
    await saveAttempts('brisas', [attempt('c', 'brisas')]);

    await Promise.all([
      recoverPendingAttemptRewards('rodaja', now),
      recoverPendingAttemptRewards('rodaja', now),
      recoverPendingAttemptRewards('brisas', now),
    ]);
    await recoverPendingAttemptRewards('rodaja', now);

    expect(shop('rodaja')).toMatchObject({ gems: 30, rewardReceiptIds: ['rodaja:a:v1', 'rodaja:b:v1'] });
    expect(shop('brisas')).toMatchObject({ gems: 15, rewardReceiptIds: ['brisas:c:v1'] });
  });

  test('exposes a shop persistence failure to the mutation caller', async () => {
    storage.failures.set(shopKey('rodaja'), 1);
    await expect(mutateShop('rodaja', (current) => ({ ...current, gems: current.gems + 1 })))
      .rejects.toThrow('write failed');
  });

  test('serializes reward grants with other shop persistence', async () => {
    await saveAttempts('rodaja', [attempt('a')]);

    await Promise.all([
      recoverPendingAttemptRewards('rodaja', now),
      mutateShop('rodaja', (current) => ({ ...current, gems: current.gems + 1 })),
    ]);

    expect(shop('rodaja')).toMatchObject({ gems: 16, rewardReceiptIds: ['rodaja:a:v1'] });
  });

  test('revalidates affordability and ownership inside serialized purchases', async () => {
    await mutateShop('rodaja', (current) => ({ ...current, gems: 15 }));

    await Promise.all([
      mutateShop('rodaja', (current) => applyThemePurchase(current, 'theme-a', 10)),
      mutateShop('rodaja', (current) => applyThemePurchase(current, 'theme-b', 10)),
      mutateShop('rodaja', (current) => applyThemePurchase(current, 'theme-a', 10)),
    ]);

    expect(shop('rodaja').gems).toBe(5);
    expect(shop('rodaja').purchasedThemeIds.filter((id) => id.startsWith('theme-'))).toHaveLength(1);
  });

  test('rejects a receipt outside the profile-attempt-version identity', async () => {
    await saveAttempts('rodaja', [{ ...attempt('a'), rewardApplication: { id: 'rodaja:a:v2', state: 'pending' } }]);

    await expect(recoverPendingAttemptRewards('rodaja', now)).rejects.toThrow('La identidad del comprobante');
    expect(storage.data.has(shopKey('rodaja'))).toBe(false);
  });

  test('weekly completion counts exclude partial attempts', () => {
    vi.setSystemTime(new Date(now));
    expect(getWorkoutsInWeek([attempt('partial', 'rodaja', 'partial'), attempt('full')], 0)).toBe(1);
    vi.useRealTimers();
  });

  test('does not count legacy session-only activity after attempt capture ships', () => {
    vi.setSystemTime(new Date(now));
    expect(getWorkoutsInWeek([], 0)).toBe(0);
    vi.useRealTimers();
  });

  test('serializes attempt marking with other profile mutations', async () => {
    await saveAttempts('rodaja', [attempt('a')]);
    await Promise.all([
      recoverPendingAttemptRewards('rodaja', now),
      mutateAttempts('rodaja', (current) => [...current, attempt('b')]),
    ]);

    expect((await loadAttempts('rodaja')).map(({ id }) => id).sort()).toEqual(['a', 'b']);
  });
});
