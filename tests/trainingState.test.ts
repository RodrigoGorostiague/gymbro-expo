import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ExerciseDefinition } from '../types';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../services/supabase', () => ({
  supabase: { rpc },
  supabaseConfigurationError: null,
}));

import { classifyTrainingFinalizationError, finalizeTrainingAttempt, importLegacyCustomDefinitions, loadTrainingState, saveTrainingState } from '../services/trainingState';

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

  test('uses the finalization RPC rather than a client reward calculation', async () => {
    const attempt = {
      version: 1, id: 'attempt', owner: 'owner', routineId: null, recordedRoutineName: 'Routine', completedAt: '2026-08-01T00:00:00.000Z', durationSeconds: 0, restTimerSeconds: 0,
      exercises: [], completion: {}, reward: {}, rewardApplication: { id: 'forged', state: 'pending' },
    } as any;
    rpc.mockResolvedValueOnce({ data: { attempt, receipt: { balance: 12, entries: [], weekly: {} }, experience_receipt: { attempt_id: 'attempt', earned_xp: 12, entries: [], progress: { level: 1, rank: 'Principiante', xp_into_level: 12, xp_for_next_level: 100, total_xp: 12 } } }, error: null });
    await expect(finalizeTrainingAttempt(attempt)).resolves.toMatchObject({ receipt: { balance: 12 }, experienceReceipt: { earnedXp: 12 } });
    expect(rpc).toHaveBeenCalledWith('finalize_training_attempt', { attempt_input: attempt });
  });

  test('preserves finalization RPC metadata for safe classification and diagnostics', async () => {
    const attempt = {
      version: 1, id: 'attempt', owner: 'owner', routineId: null, recordedRoutineName: 'Routine', completedAt: '2026-08-01T00:00:00.000Z', durationSeconds: 0, restTimerSeconds: 0,
      exercises: [], completion: {}, reward: {}, rewardApplication: { id: 'forged', state: 'pending' },
    } as any;
    const error = { code: 'P0001', message: 'invalid training attempt input', details: 'server-only', hint: 'server-only' };
    rpc.mockResolvedValueOnce({ data: null, error });
    await expect(finalizeTrainingAttempt(attempt)).rejects.toBe(error);
  });
});

describe('training finalization error classification', () => {
  test.each([
    [{ message: 'invalid training attempt input' }, 'Revisá la rutina', 'La rutina debe tener ejercicios y series válidos. Revisala e intentá finalizar nuevamente.'],
    [{ details: 'invalid planned session lineage' }, 'Sesión desactualizada', 'La sesión del mesociclo ya no es válida. Actualizá o reabrí el mesociclo antes de finalizar.'],
    [{ code: '401', message: 'JWT expired' }, 'Sesión requerida', 'Volvé a iniciar sesión e intentá finalizar el entrenamiento nuevamente.'],
    [new Error('Falta la configuración pública de Supabase'), 'Servicio no disponible', 'La configuración del servicio no está disponible. Intentá nuevamente más tarde.'],
    [new TypeError('Network request failed'), 'No se pudo conectar', 'Verificá tu conexión e intentá finalizar el entrenamiento nuevamente.'],
    [new Error('unexpected failure'), 'No se pudo guardar el entrenamiento', 'No pudimos finalizar el entrenamiento. Intentá nuevamente.'],
  ])('returns a safe message for %o', (error, title, body) => {
    expect(classifyTrainingFinalizationError(error)).toEqual({ title, body });
  });
});
