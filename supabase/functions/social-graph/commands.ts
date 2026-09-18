export type GraphCommand =
  | { command: 'sendRequest'; targetId: string; relationshipKind: 'bro' | 'partner' }
  | { command: 'respondRequest'; targetId: string; accepted: boolean }
  | { command: 'cancelRequest' | 'downgradePartner' | 'block' | 'unblock'; targetId: string };

type RpcError = { code?: unknown; message?: unknown };
type RpcResult = { data?: unknown; error: RpcError | null };

export type GraphRpcClient = {
  rpc: (functionName: string, args: Record<string, unknown>) => Promise<RpcResult>;
};

const rpcByCommand = {
  sendRequest: 'graph_send_request',
  respondRequest: 'graph_respond_request',
  cancelRequest: 'graph_cancel_request',
  downgradePartner: 'graph_downgrade_partner',
  block: 'graph_block',
  unblock: 'graph_unblock',
} as const;

export function isGraphCommandName(value: unknown): value is GraphCommand['command'] {
  return typeof value === 'string' && Object.hasOwn(rpcByCommand, value);
}

function argsFor(command: GraphCommand): Record<string, unknown> {
  if (command.command === 'sendRequest') {
    return { target: command.targetId, requested_kind: command.relationshipKind };
  }
  if (command.command === 'respondRequest') {
    return { requester_input: command.targetId, accepted: command.accepted };
  }
  return { target: command.targetId };
}

export async function executeGraphCommand(client: GraphRpcClient, command: GraphCommand) {
  const { error: commandError } = await client.rpc(rpcByCommand[command.command], argsFor(command));
  if (commandError) return { commandError };

  const { data: summary, error: summaryError } = await client.rpc('graph_summary', { target: command.targetId });
  if (summaryError) return { summaryError };
  return { summary };
}
