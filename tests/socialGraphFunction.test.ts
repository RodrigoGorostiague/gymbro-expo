import { describe, expect, test } from 'vitest';
import { executeGraphCommand } from '../supabase/functions/social-graph/commands';
import { graphCommandFailure } from '../supabase/functions/social-graph/errors';
import { createGraphRequestHandler } from '../supabase/functions/social-graph/handler';

const targetId = '123e4567-e89b-42d3-a456-426614174000';

function request(body: unknown) {
  return new Request('https://example.test/social-graph', {
    method: 'POST',
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('social-graph Edge Function error contract', () => {
  test.each([
    ['request already pending', 'graph_request_pending', 'Ya hay una solicitud pendiente entre ustedes.', 409],
    ['relationship transition unavailable', 'graph_transition_unavailable', 'Esta transición de relación no está disponible.', 409],
    ['graph action blocked', 'graph_action_blocked', 'No podés realizar esta acción con este perfil.', 403],
  ])('maps known domain rejection %s to a safe response', (message, code, safeMessage, status) => {
    expect(graphCommandFailure({ message })).toEqual({ code, message: safeMessage, status });
  });

  test('maps unknown database failures to a generic safe response', () => {
    expect(graphCommandFailure({ message: 'duplicate key value violates unique constraint "relationships_pkey"' })).toEqual({
      code: 'graph_command_failed',
      message: 'No se pudo completar la acción. Inténtalo de nuevo.',
      status: 500,
    });
  });

  test('accepts a request through the deployed RPC argument contract', async () => {
    const summary = { targetId, relationshipKind: 'bro' };
    const rpc = async (functionName: string, args: Record<string, unknown>) => {
      calls.push([functionName, args]);
      return functionName === 'graph_summary' ? { data: summary, error: null } : { error: null };
    };
    const calls: Array<[string, Record<string, unknown>]> = [];

    await expect(executeGraphCommand({ rpc }, {
      command: 'respondRequest',
      targetId,
      accepted: true,
    })).resolves.toEqual({ summary });

    expect(calls).toEqual([
      ['graph_respond_request', { requester_input: targetId, accepted: true }],
      ['graph_summary', { target: targetId }],
    ]);
  });

  test.each([true, false])('returns a JSON summary for a valid %s request response', async (accepted) => {
    const summary = { targetId, incomingRequest: false };
    const calls: Array<[string, Record<string, unknown>]> = [];
    const handler = createGraphRequestHandler(() => ({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      rpc: async (functionName, args) => {
        calls.push([functionName, args]);
        return functionName === 'graph_summary' ? { data: summary, error: null } : { error: null };
      },
    }));

    const response = await handler(request({ command: 'respondRequest', targetId, accepted }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ summary });
    expect(calls).toEqual([
      ['graph_respond_request', { requester_input: targetId, accepted }],
      ['graph_summary', { target: targetId }],
    ]);
  });

  test('returns a safe JSON error for malformed requests before creating a client', async () => {
    const handler = createGraphRequestHandler(() => { throw new Error('client should not be created'); });

    const response = await handler(request({ command: 'respondRequest', targetId }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'invalid_graph_command',
      message: 'Comando de relación no válido.',
    });
  });
});
