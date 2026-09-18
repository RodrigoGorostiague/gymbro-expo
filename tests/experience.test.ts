import { beforeEach, describe, expect, test, vi } from 'vitest';
import { experienceProgressPercent, trainingRank, xpForNextLevel } from '../utils/experience';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../services/supabase', () => ({ supabase: { rpc }, supabaseConfigurationError: null }));

import { getCommunityActivities, loadExperienceProgress } from '../services/experience';

describe('training XP progression', () => {
  beforeEach(() => vi.clearAllMocks());

  test('uses the approved nonlinear curve and rank boundaries', () => {
    expect(xpForNextLevel(1)).toBe(100);
    expect(xpForNextLevel(2)).toBe(Math.ceil(80 + 20 * 2 ** 1.45));
    expect([1, 5, 10, 20, 35, 50, 70, 85].map(trainingRank)).toEqual(['Principiante', 'Intermedio', 'Avanzado', 'GymBro', 'GymRat', 'G-Boom', 'Alfa', 'Sigma']);
  });

  test('bounds visible progress to the current level', () => {
    expect(experienceProgressPercent({ level: 2, rank: 'Principiante', xpIntoLevel: 200, xpForNextLevel: 100, totalXp: 200 })).toBe(100);
  });

  test('loads only a server-owned XP projection', async () => {
    rpc.mockResolvedValueOnce({ data: { level: 5, rank: 'Intermedio', xp_into_level: 3, xp_for_next_level: 300, total_xp: 999 }, error: null });
    await expect(loadExperienceProgress()).resolves.toMatchObject({ level: 5, rank: 'Intermedio', totalXp: 999 });
    expect(rpc).toHaveBeenCalledWith('load_experience_progress');
  });

  test('maps known server milestone projections without accepting malformed payloads', async () => {
    rpc.mockResolvedValueOnce({ data: { activities: [
      { id: 'rank-1', kind: 'rank_up', author_alias: 'Bro', author_avatar_id: 'capybara-athlete', author_theme_id: 'blue', payload: { level: 5, rank: 'Intermedio' }, created_at: '2026-08-02T00:00:00Z' },
      { id: 'pr-1', kind: 'personal_record', author_alias: 'Bro', author_avatar_id: 'capybara-athlete', author_theme_id: 'blue', payload: { exercise_name: 'Press banca', best_score: 800, ignored: { private: true } }, created_at: '2026-08-03T00:00:00Z' },
      { id: 'bad', kind: 'rank_up', payload: {} },
    ], next_cursor: 'next' }, error: null });
    await expect(getCommunityActivities()).resolves.toEqual(expect.objectContaining({ activities: [
      expect.objectContaining({ rank: 'Intermedio', authorAlias: 'Bro' }),
      expect.objectContaining({ kind: 'personal_record', payload: { exercise_name: 'Press banca', best_score: 800 } }),
    ], nextCursor: 'next' }));
    expect(rpc).toHaveBeenCalledWith('list_community_activities', { cursor: null, page_size: 20 });
  });
});
