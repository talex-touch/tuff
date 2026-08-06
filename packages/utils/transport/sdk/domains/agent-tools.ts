import type { ITuffTransport } from '../../types'
import { defineEvent } from '../../event/builder'

export type AgentToolRisk = 'read' | 'write' | 'execute'

/**
 * Marks a tool result as a renderable chart rather than text. Lives here
 * because both sides read it: the main-process tool writes it, the renderer
 * detects it.
 */
export const CHART_RESULT_PREFIX = 'tuff:chart:'

/**
 * Marks a tool result as an interactive form. Same two-sided contract as the
 * chart prefix: the main-process tool writes it, the renderer detects it.
 */
export const FORM_RESULT_PREFIX = 'tuff:form:'

/** Field kinds a rendered form can ask for; each maps onto one tuffex input. */
export type FormFieldType = 'text' | 'textarea' | 'number' | 'select' | 'checkbox'

/** What one answered field carries back into the conversation. */
export type FormFieldValue = string | number | boolean

export interface FormField {
  /** Names the answer in the submitted values; unique within one form. */
  key: string
  label: string
  type: FormFieldType
  /** Choices for `select`, which cannot render without them. */
  options?: string[]
  required?: boolean
  placeholder?: string
  default?: FormFieldValue
}

/**
 * A model-proposed form, validated in the main process before it reaches the
 * renderer. Declarative on purpose — the model describes fields, never code.
 */
export interface FormSpec {
  title?: string
  description?: string
  fields: FormField[]
  submitLabel?: string
}

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
