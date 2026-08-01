import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ExerciseDefinition } from '../types';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../services/supabase', () => ({
  supabase: { rpc },
  supabaseConfigurationError: null,
}));

import { importLegacyCustomDefinitions, loadTrainingState, saveTrainingState } from '../services/trainingState';

const definition: ExerciseDefinition = {
  id: 'custom:owner:press', source: { kind: 'custom', owner: 'owner', originId: 'press' }, name: 'Press',
  muscleGroups: ['GM-100'], loadMode: 'external-load', loadUnit: 'kg', variant: 'barra', defaultSets: [],
};

describe('training state RPC boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  test('loads only a complete server-owned training state', async () => {
    rpc.mockResolvedValueOnce({ data: { definitions: [definition], attempts: [], sessions: [], activeWorkoutDraft: null }, error: null });
    await expect(loadTrainingState()).resolves.toMatchObject({ definitions: [definition] });
  });

  test('rejects malformed remote state instead of falling back to AsyncStorage', async () => {
    rpc.mockResolvedValueOnce({ data: { definitions: [{ id: 'bad' }], attempts: [], sessions: [], activeWorkoutDraft: null }, error: null });
    await expect(loadTrainingState()).rejects.toThrow('contenido inválido');
  });

  test('persists an active draft explicitly, including a null cancellation', async () => {
    rpc.mockResolvedValue({ error: null });
    await saveTrainingState({ activeWorkoutDraft: null });
    expect(rpc).toHaveBeenCalledWith('save_training_state', expect.objectContaining({ active_workout_draft_input: null, active_workout_draft_supplied: true }));
  });

  test('does not issue a remote write for invalid client state', async () => {
    await expect(saveTrainingState({ definitions: [{ id: 'broken' }] as any })).rejects.toThrow('no son válidas');
    expect(rpc).not.toHaveBeenCalled();
  });

  test('imports only preserved legacy custom definitions', async () => {
    rpc.mockResolvedValueOnce({ error: null });
    await importLegacyCustomDefinitions([definition]);
    expect(rpc).toHaveBeenCalledWith('import_legacy_custom_definitions', { definitions_input: [definition] });
  });

  test('zeros client-controlled reward values before sending attempts to the server', async () => {
    rpc.mockResolvedValueOnce({ error: null });
    await saveTrainingState({ attempts: [{
      version: 1, id: 'attempt', owner: 'owner', routineId: null, recordedRoutineName: 'Routine',
      completedAt: '2026-08-01T00:00:00.000Z', durationSeconds: 0, restTimerSeconds: 0,
      exercises: [], completion: {}, reward: { totalGems: 999999 }, rewardApplication: { id: 'forged', state: 'pending' },
    } as any] });
    expect(rpc).toHaveBeenCalledWith('save_training_state', expect.objectContaining({
      attempts_input: [expect.objectContaining({
        reward: { setGems: 0, completionGems: 0, fullCompletionBonus: 0, totalGems: 0, qualifiesForCompletion: false },
        rewardApplication: { id: 'owner:attempt:v1', state: 'applied' },
      })],
    }));
  });
});
