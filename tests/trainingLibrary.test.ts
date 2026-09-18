import { beforeEach, describe, expect, test, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../services/supabase', () => ({
  supabase: { rpc },
  supabaseConfigurationError: null,
}));

import {
  loadTrainingLibrary,
  saveTrainingMesocycles,
  saveTrainingRoutines,
  TrainingLibraryConflictError,
} from '../services/trainingLibrary';

const routine = {
  id: 'routine-1', name: 'Upper', muscleGroups: ['GM-100'], exercises: [], createdAt: '2026-08-01T00:00:00.000Z',
};
const mesocycle = {
  id: 'mesocycle-1', name: 'Block', goal: '', status: 'draft' as const, durationWeeks: 1,
  createdAt: '2026-08-01T00:00:00.000Z', weeks: [{ id: 'week-1', weekNumber: 1, entries: [] }],
};

describe('training library V2 RPC boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  test('maps canonical collections and their independent revisions', async () => {
    rpc
      .mockResolvedValueOnce({ data: { revision: 4, items: [routine] }, error: null })
      .mockResolvedValueOnce({ data: { revision: 9, items: [mesocycle] }, error: null });

    await expect(loadTrainingLibrary()).resolves.toEqual({
      routines: [routine], mesocycles: [mesocycle], routinesRevision: 4, mesocyclesRevision: 9,
    });
    expect(rpc.mock.calls).toEqual([
      ['load_routines_v2'],
      ['load_mesocycles_v2'],
    ]);
  });

  test('rejects malformed remote content so DataContext can show a retryable error', async () => {
    rpc
      .mockResolvedValueOnce({ data: { revision: 0, items: [routine] }, error: null })
      .mockResolvedValueOnce({ data: { revision: 0, items: [{ id: 'broken' }] }, error: null });

    await expect(loadTrainingLibrary()).rejects.toThrow('contenido inválido');
  });

  test('preserves V2-permitted legacy plans and repairs incomplete paused metadata', async () => {
    rpc
      .mockResolvedValueOnce({ data: { revision: 1, items: [] }, error: null })
      .mockResolvedValueOnce({ data: { revision: 2, items: [
        { ...mesocycle, id: 'legacy', status: 'archived', durationWeeks: 60, weeks: [] },
        { ...mesocycle, id: 'stranded', status: 'paused' },
      ] }, error: null });

    const loaded = await loadTrainingLibrary();
    expect(loaded.mesocycles).toEqual([
      expect.objectContaining({ id: 'legacy', durationWeeks: 60 }),
      expect.objectContaining({ id: 'stranded', status: 'active' }),
    ]);
  });

  test('sends each collection its own expected revision', async () => {
    rpc
      .mockResolvedValueOnce({ data: { status: 'saved', collection: { revision: 8, items: [routine] } }, error: null })
      .mockResolvedValueOnce({ data: { status: 'saved', collection: { revision: 3, items: [mesocycle] } }, error: null });

    await saveTrainingRoutines({ expectedRevision: 7, items: [routine] });
    await saveTrainingMesocycles({ expectedRevision: 2, items: [mesocycle] });

    expect(rpc.mock.calls).toEqual([
      ['save_routines_v2', { input: { expectedRevision: 7, items: [routine] } }],
      ['save_mesocycles_v2', { input: { expectedRevision: 2, items: [mesocycle] } }],
    ]);
  });

  test('returns canonical server content and revision after a save', async () => {
    const canonical = { ...routine, name: 'Server canonical' };
    rpc.mockResolvedValueOnce({
      data: { status: 'saved', collection: { revision: 12, items: [canonical] } }, error: null,
    });

    await expect(saveTrainingRoutines({ expectedRevision: 11, items: [routine] }))
      .resolves.toEqual({ revision: 12, items: [canonical] });
  });

  test.each([
    ['routines' as const, saveTrainingRoutines, routine],
    ['mesocycles' as const, saveTrainingMesocycles, mesocycle],
  ])('represents a stale %s save distinctly without retrying', async (collection, save, draft) => {
    const current = { revision: 6, items: [{ ...draft, name: 'Newer server value' }] };
    rpc.mockResolvedValueOnce({ data: { status: 'conflict', current }, error: null });

    const error = await save({ expectedRevision: 5, items: [draft] } as never).catch((reason) => reason);

    expect(error).toBeInstanceOf(TrainingLibraryConflictError);
    expect(error).toMatchObject({ collection, expectedRevision: 5, attemptedItems: [draft], current });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
