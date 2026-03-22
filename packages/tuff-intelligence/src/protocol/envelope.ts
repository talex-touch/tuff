export type AgentEnvelopeSource =
  | 'user'
  | 'assistant'
  | 'runtime'
  | 'capability'
  | 'view'
  | 'plugin'

export type AgentEventType =
  | 'user.message'
  | 'thinking.delta'
  | 'thinking.final'
  | 'assistant.delta'
  | 'assistant.final'
  | 'capability.call'
  | 'capability.result'
  | 'view.render'
  | 'view.patch'
  | 'view.dispose'
  | 'approval.request'
  | 'approval.response'
  | 'error'

export interface AgentEnvelope<T = unknown> {
  version: 'aep/1'
  id: string
  sessionId: string
  turnId: string
  correlationId?: string
  source: AgentEnvelopeSource
  type: AgentEventType
  ts: string
  payload: T
  meta?: Record<string, unknown>
}

export interface AgentErrorPayload {
  code: string
  message: string
  detail?: unknown
}
