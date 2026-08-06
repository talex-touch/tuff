import type { ITuffTransport } from '../../types'
import { defineEvent } from '../../event/builder'

export type AgentToolRisk = 'read' | 'write' | 'execute'

export interface AgentToolConfirmRequest {
  requestId: string
  tool: string
  risk: AgentToolRisk
  summary: string
  /** Serialized arguments, pretty-printed for display. */
  input: string
}

export interface AgentToolConfirmDecision {
  requestId: string
  approved: boolean
  /** Only honoured for read-risk tools; the gateway enforces that. */
  remember: boolean
}

export const AgentToolEvents = {
  /** Main → renderer: a tool wants to run and needs the user's say-so. */
  confirmRequest: defineEvent('agent-tools')
    .module('api')
    .event('confirm-request')
    .define<AgentToolConfirmRequest, void>(),
  /** Renderer → main: the user's answer to a pending request. */
  confirmDecision: defineEvent('agent-tools')
    .module('api')
    .event('confirm-decision')
    .define<AgentToolConfirmDecision, { accepted: boolean }>(),
  /** Renderer → main: whether the agent may use tools at all, and which. */
  setEnabled: defineEvent('agent-tools')
    .module('api')
    .event('set-enabled')
    .define<{ enabled: boolean }, { enabled: boolean, tools: string[] }>(),
  /** Renderer → main: forget this session's remembered approvals. */
  resetApprovals: defineEvent('agent-tools')
    .module('api')
    .event('reset-approvals')
    .define<undefined, { reset: boolean }>(),
} as const

export interface AgentToolsSdk {
  decide: (decision: AgentToolConfirmDecision) => Promise<{ accepted: boolean }>
  setEnabled: (
    enabled: boolean,
  ) => Promise<{ enabled: boolean, tools: string[] }>
  resetApprovals: () => Promise<{ reset: boolean }>
}

export function createAgentToolsSdk(
  transport: Pick<ITuffTransport, 'send'>,
): AgentToolsSdk {
  return {
    decide: decision =>
      transport.send(AgentToolEvents.confirmDecision, decision),
    setEnabled: enabled =>
      transport.send(AgentToolEvents.setEnabled, { enabled }),
    resetApprovals: () =>
      transport.send(AgentToolEvents.resetApprovals, undefined),
  }
}
