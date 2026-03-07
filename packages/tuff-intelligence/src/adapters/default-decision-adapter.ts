import type { DecisionAdapter } from './engine'
import type { AgentDecision, CapabilityCall, ViewIntent } from '../protocol/decision'
import type { TurnState } from '../protocol/session'

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export class DefaultDecisionAdapter implements DecisionAdapter {
  readonly id = 'default'

  async normalize(raw: unknown, _state: TurnState): Promise<AgentDecision> {
    if (typeof raw === 'string') {
      return { text: raw, done: true }
    }

    const row = asRecord(raw)
    const capabilityCalls = ensureArray<Record<string, unknown>>(row.capabilityCalls).map<CapabilityCall>((call, index) => ({
      id: String(call.id || `cap_${index + 1}`),
      capabilityId: String(call.capabilityId || ''),
      input: call.input,
      metadata: asRecord(call.metadata),
    })).filter(call => Boolean(call.capabilityId))

    const viewIntents = ensureArray<Record<string, unknown>>(row.viewIntents).map<ViewIntent>((intent, index) => ({
      id: String(intent.id || `view_${index + 1}`),
      type: String(intent.type || 'render') as ViewIntent['type'],
      viewId: typeof intent.viewId === 'string' ? intent.viewId : undefined,
      viewType: typeof intent.viewType === 'string' ? intent.viewType : undefined,
      lifecycle: intent.lifecycle === 'persistent' ? 'persistent' : 'ephemeral',
      props: asRecord(intent.props),
    }))

    return {
      text: typeof row.text === 'string' ? row.text : undefined,
      capabilityCalls,
      viewIntents,
      approvalRequests: ensureArray(row.approvalRequests),
      skillRequests: ensureArray(row.skillRequests),
      subAgentTasks: ensureArray(row.subAgentTasks),
      done: row.done !== false,
    }
  }
}
