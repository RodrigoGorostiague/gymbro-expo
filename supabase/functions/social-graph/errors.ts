type RpcError = { message?: unknown };

export type GraphCommandFailure = {
  code: string;
  message: string;
  status: number;
};

const knownFailures: Record<string, GraphCommandFailure> = {
  'relationship already exists': {
    code: 'graph_transition_unavailable',
    message: 'Esta transición de relación no está disponible.',
    status: 409,
  },
  'relationship transition unavailable': {
    code: 'graph_transition_unavailable',
    message: 'Esta transición de relación no está disponible.',
    status: 409,
  },
  'request already pending': {
    code: 'graph_request_pending',
    message: 'Ya hay una solicitud pendiente entre ustedes.',
    status: 409,
  },
  'request unavailable': {
    code: 'graph_request_unavailable',
    message: 'La solicitud ya no está disponible.',
    status: 409,
  },
  'partner relationship unavailable': {
    code: 'graph_relationship_unavailable',
    message: 'La relación ya no está disponible.',
    status: 409,
  },
  'block unavailable': {
    code: 'graph_block_unavailable',
    message: 'El bloqueo ya no está disponible.',
    status: 409,
  },
  'graph action blocked': {
    code: 'graph_action_blocked',
    message: 'No podés realizar esta acción con este perfil.',
    status: 403,
  },
  'profile unavailable': {
    code: 'graph_profile_unavailable',
    message: 'Este perfil ya no está disponible.',
    status: 404,
  },
  'self graph actions are not allowed': {
    code: 'graph_action_invalid',
    message: 'Esta acción no está disponible.',
    status: 400,
  },
  'self block is not allowed': {
    code: 'graph_action_invalid',
    message: 'Esta acción no está disponible.',
    status: 400,
  },
};

export function graphCommandFailure(error: RpcError): GraphCommandFailure {
  const knownFailure = typeof error.message === 'string' ? knownFailures[error.message] : undefined;
  return knownFailure ?? {
    code: 'graph_command_failed',
    message: 'No se pudo completar la acción. Inténtalo de nuevo.',
    status: 500,
  };
}
