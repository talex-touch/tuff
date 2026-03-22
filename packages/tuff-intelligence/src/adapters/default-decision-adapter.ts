import type { DecisionAdapter } from './engine'
import type { AgentDecision, CapabilityCall, ViewIntent } from '../protocol/decision'
import type { TurnState } from '../protocol/session'

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

function extractThinkingText(value: unknown, depth = 0): string {
  if (depth > 3 || value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    const chunks = value
      .map(item => extractThinkingText(item, depth + 1))
      .filter(Boolean)
    return chunks.join('\n').trim()
  }
  if (typeof value !== 'object') {
    return ''
  }

  const row = asRecord(value)
  const directCandidates = [
    row.text,
    row.content,
    row.summary,
    row.reasoning_text,
    row.thinking_text,
    row.output_text,
  ]
  for (const candidate of directCandidates) {
    const text = asText(candidate).trim()
    if (text) {
      return text
    }
  }

  const nestedCandidates = [
    row.delta,
    row.reasoning,
    row.thinking,
    row.analysis,
    row.message,
    row.payload,
  ]
  for (const candidate of nestedCandidates) {
    const nested = extractThinkingText(candidate, depth + 1)
    if (nested) {
      return nested
    }
  }

  return ''
}

function normalizeThinkingDone(row: Record<string, unknown>): boolean | undefined {
  if (typeof row.thinkingDone === 'boolean') {
    return row.thinkingDone
  }
  if (typeof row.reasoningDone === 'boolean') {
    return row.reasoningDone
  }
  if (typeof row.thinking_done === 'boolean') {
    return row.thinking_done
  }
  if (typeof row.reasoning_done === 'boolean') {
    return row.reasoning_done
  }
  return undefined
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

    const thinkingText = extractThinkingText(
      row.thinking
      ?? row.reasoning
      ?? row.analysis
      ?? row.thinkingText
      ?? row.reasoningText,
    )
    const thinkingDone = normalizeThinkingDone(row)

    return {
      thinkingText: thinkingText || undefined,
      thinkingDone,
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
