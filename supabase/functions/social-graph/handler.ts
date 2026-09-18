import { executeGraphCommand, GraphCommand, GraphRpcClient, isGraphCommandName } from './commands.ts';
import { graphCommandFailure, GraphCommandFailure } from './errors.ts';

type CommandInput = GraphCommand;
type GraphClient = GraphRpcClient & {
  auth: {
    getUser: () => Promise<{ data: { user: unknown | null }; error: unknown | null }>;
  };
};

type GraphClientFactory = (authorization: string) => GraphClient;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure({ code, message, status }: GraphCommandFailure) {
  return Response.json({ code, message }, { status });
}

function unexpectedFailure(context: string, error: unknown) {
  console.error('social-graph unexpected failure', {
    context,
    errorType: error instanceof Error ? error.name : typeof error,
  });
  return failure({
    code: 'graph_command_failed',
    message: 'No se pudo completar la acción. Inténtalo de nuevo.',
    status: 500,
  });
}

function isCommandInput(value: unknown): value is CommandInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  if ('actorId' in input || 'callerId' in input || 'userId' in input) return false;
  if (!isGraphCommandName(input.command) || typeof input.targetId !== 'string') return false;
  if (input.command === 'sendRequest') {
    return input.accepted === undefined && (input.relationshipKind === 'bro' || input.relationshipKind === 'partner');
  }
  if (input.command === 'respondRequest') return typeof input.accepted === 'boolean' && input.relationshipKind === undefined;
  return input.accepted === undefined && input.relationshipKind === undefined;
}

export function createGraphRequestHandler(createClient: GraphClientFactory) {
  return async (request: Request) => {
    if (request.method !== 'POST') return failure({ code: 'method_not_allowed', message: 'Método no permitido.', status: 405 });

    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return failure({ code: 'authentication_required', message: 'Autenticación requerida.', status: 401 });

    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return failure({ code: 'invalid_graph_command', message: 'Comando de relación no válido.', status: 400 });
    }
    if (!isCommandInput(input) || !uuidPattern.test(input.targetId)) {
      return failure({ code: 'invalid_graph_command', message: 'Comando de relación no válido.', status: 400 });
    }

    try {
      const client = createClient(authorization);
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || !userData.user) return failure({ code: 'authentication_required', message: 'Autenticación requerida.', status: 401 });

      const { commandError, summaryError, summary } = await executeGraphCommand(client, input);
      if (commandError) {
        const commandFailure = graphCommandFailure(commandError);
        if (commandFailure.code === 'graph_command_failed') {
          console.error('social-graph command RPC failed', {
            command: input.command,
            rpcCode: typeof commandError.code === 'string' ? commandError.code : undefined,
          });
        }
        return failure(commandFailure);
      }

      if (summaryError) {
        console.error('social-graph summary RPC failed', {
          command: input.command,
          rpcCode: typeof summaryError.code === 'string' ? summaryError.code : undefined,
        });
        return failure({ code: 'graph_command_failed', message: 'No se pudo completar la acción. Inténtalo de nuevo.', status: 500 });
      }
      return Response.json({ summary });
    } catch (error) {
      return unexpectedFailure('request_handler', error);
    }
  };
}
