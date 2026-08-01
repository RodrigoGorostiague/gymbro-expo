import { beforeEach, describe, expect, test, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../services/supabase', () => ({
  supabase: { rpc },
  supabaseConfigurationError: null,
}));

import { loadTrainingLibrary, saveTrainingLibrary } from '../services/trainingLibrary';

const routine = {
  id: 'routine-1', name: 'Upper', muscleGroups: ['GM-100'], exercises: [], createdAt: '2026-08-01T00:00:00.000Z',
};

describe('training library RPC boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns a server-sanitized empty library', async () => {
    rpc.mockResolvedValueOnce({ data: { routines: [], mesocycles: [] }, error: null });

    await expect(loadTrainingLibrary()).resolves.toEqual({ routines: [], mesocycles: [] });
  });

  test('rejects malformed remote content so DataContext can show a retryable error', async () => {
    rpc.mockResolvedValueOnce({ data: { routines: [routine], mesocycles: [{ id: 'broken' }] }, error: null });

    await expect(loadTrainingLibrary()).rejects.toThrow('contenido inválido');
  });

  test('rejects routine exercises that do not satisfy the server contract', async () => {
    rpc.mockResolvedValueOnce({ data: { routines: [{ ...routine, exercises: [{ id: 'exercise-1', name: 'Press', muscleGroups: [] }] }], mesocycles: [] }, error: null });

    await expect(loadTrainingLibrary()).rejects.toThrow('contenido inválido');
  });

  test('rejects mesocycle entries with an incomplete routine reference', async () => {
    rpc.mockResolvedValueOnce({ data: { routines: [routine], mesocycles: [{
      id: 'mesocycle-1', name: 'Block', status: 'draft', durationWeeks: 1,
      createdAt: '2026-08-01T00:00:00.000Z', weeks: [{ id: 'week-1', weekNumber: 1, entries: [{ id: 'entry-1', ref: { routineId: routine.id, source: 'local' } }] }],
    }] }, error: null });

    await expect(loadTrainingLibrary()).rejects.toThrow('contenido inválido');
  });

  test('sends only explicit partial updates to the RPC', async () => {
    rpc.mockResolvedValueOnce({ error: null });

    await saveTrainingLibrary({ routines: [routine] });

    expect(rpc).toHaveBeenCalledWith('save_training_library', {
      routines_input: [routine],
      mesocycles_input: null,
    });
  });
});
