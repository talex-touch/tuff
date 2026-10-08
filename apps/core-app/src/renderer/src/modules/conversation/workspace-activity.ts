import type { AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { AgentToolConfirmRequest } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { ConversationMessage, ConversationMessageStatus } from './useHomeConversation'

/**
 * The Activity tab's timeline: every assistant turn of the conversation with the tool calls it
 * made, in the order they ran, plus the approvals Main is waiting on right now.
 *
 * Identity, never content: a turn is its message id, a tool is `messageId` + its call id, a gateway
 * approval is its `requestId`, a run approval its `runId`. The same call reported twice — a replayed
 * event, a snapshot after deltas — collapses onto one row, and the call id is only ever a
 * correlation key here: approving goes through the request or run id, never through it (A12).
 *
 * Everything is read off the authoritative messages Main persisted, so a reload rebuilds the same
 * rows; a call the turn ended without answering already carries its interrupted state.
 */

export interface ActivityTool {
  key: string
  callId: string
  name: string
  status: AiToolCallPart['status']
  summary?: string
  error?: string
}

export interface ActivityTurn {
  messageId: string
  messageIndex: number
  status: ConversationMessageStatus
  provider?: string
  model?: string
  errorCode?: string
  tools: ActivityTool[]
}

/** Where a gateway confirmation came from, as Main attributed it — never as the client claims. */
export type GatewayApprovalOrigin = 'current' | 'other' | 'external'

export interface ActivityGatewayApproval {
  requestId: string
  tool: string
  risk: AgentToolConfirmRequest['risk']
  summary: string
  origin: GatewayApprovalOrigin
}

/** One-line digest of a call's arguments: its first string field, the way the work log reads. */
function summarize(tool: AiToolCallPart): string | undefined {
  if (tool.summary) return tool.summary
  if (!tool.input) return undefined
  try {
    const parsed: unknown = JSON.parse(tool.input)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) return value.trim().split('\n')[0]
    }
  } catch {
    // An argument stream cut off mid-JSON still names its tool; the row just has no digest.
  }
  return undefined
}

/**
 * Assistant turns after the opening: an assistant message ahead of the first user message is the
 * Home opening, which never ran a model turn and has nothing to show here.
 */
export function buildActivityTurns(messages: readonly ConversationMessage[]): ActivityTurn[] {
  const firstUser = messages.findIndex((message) => message.role === 'user')
  if (firstUser === -1) return []
  const turns: ActivityTurn[] = []
  for (let index = firstUser + 1; index < messages.length; index += 1) {
    const message = messages[index]
    if (!message || message.role !== 'assistant') continue
    const byCall = new Map<string, ActivityTool>()
    for (const part of message.parts ?? []) {
      if (part.type !== 'tool-call') continue
      const key = `${message.id}:${part.id}`
      // A later report of the same call is the newer state of that call, not another call.
      byCall.set(part.id, {
        key,
        callId: part.id,
        name: part.name,
        status: part.status,
        summary: summarize(part),
        error: part.status === 'error' ? part.error : undefined
      })
    }
    turns.push({
      messageId: message.id,
      messageIndex: index,
      status: message.status,
      provider: message.meta?.provider,
      model: message.meta?.model,
      errorCode: message.error?.code,
      tools: [...byCall.values()]
    })
  }
  return turns
}

/**
 * A pending gateway confirmation as the current conversation sees it. Without a Main-attributed
 * origin the call came from outside any conversation (the local MCP server, a plugin): it is shown
 * as external, never adopted as this conversation's.
 */
export function toGatewayApproval(
  request: AgentToolConfirmRequest,
  conversationId: string | null
): ActivityGatewayApproval {
  const origin: GatewayApprovalOrigin = !request.origin
    ? 'external'
    : request.origin.conversationId === conversationId
      ? 'current'
      : 'other'
  return {
    requestId: request.requestId,
    tool: request.tool,
    risk: request.risk,
    summary: request.summary,
    origin
  }
}
