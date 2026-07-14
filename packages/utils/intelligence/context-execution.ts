import type {
  IntelligenceChatPayload,
  IntelligenceContextExecutionRequest,
  IntelligenceContextMode,
  IntelligenceInvokeOptions,
  ContextScope,
  ContextSession,
} from '../types/intelligence'

export interface IntelligenceContextEntrypointPolicy {
  entrypointId: string
  owner: ContextSession['owner']
  mode: IntelligenceContextMode
  sessionId?: string
  scope?: Exclude<ContextScope, 'none'>
  objective?: string
  tokenBudget?: number
  traceId?: string
}

export interface CreateIntelligenceContextExecutionRequestInput {
  capabilityId: string
  input: string
  payload: IntelligenceChatPayload
  options?: IntelligenceInvokeOptions
  policy: IntelligenceContextEntrypointPolicy
}

function trimmed(value?: string): string | undefined {
  const normalized = value?.trim()
  return normalized || undefined
}

/**
 * Maps an entrypoint invocation onto the host-owned context execution contract.
 * Callers provide current input and policy only; trusted history is assembled by the host.
 */
export function createIntelligenceContextExecutionRequest(
  request: CreateIntelligenceContextExecutionRequestInput,
): IntelligenceContextExecutionRequest {
  const entrypointId = request.policy.entrypointId.trim()
  if (!entrypointId) {
    throw new Error('CONTEXT_ENTRYPOINT_ID_REQUIRED')
  }

  return {
    capabilityId: request.capabilityId,
    input: request.input,
    payload: request.payload,
    options: {
      ...(request.options ?? {}),
      metadata: {
        ...(request.options?.metadata ?? {}),
        contextEntrypoint: {
          id: entrypointId,
          owner: request.policy.owner,
          mode: request.policy.mode,
        },
      },
    },
    context: {
      mode: request.policy.mode,
      owner: request.policy.owner,
      sessionId: trimmed(request.policy.sessionId),
      scope: request.policy.scope,
      objective: trimmed(request.policy.objective),
      tokenBudget: request.policy.tokenBudget,
      traceId: trimmed(request.policy.traceId),
    },
  }
}
