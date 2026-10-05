// SPDX-License-Identifier: LGPL-3.0-only
//
// Copyright (C) vastsa and PI-Desktop contributors.
// Derived from vastsa/PI-Desktop @ 3b036cc7810e18b3ef7689a2b93385125a8d0a3f:
//   packages/shared/src/types/messages.ts (UiMessage, MessageUsage)
//   packages/shared/src/types/agent.ts    (AgentEvent "message_update", AgentEventEnvelope)
//
// Tuff adaptation (LGPL-3.0-only derivative, not MPL): only the fields that
// `message-stream.ts` and `context-usage.ts` read are kept. Upstream-only
// payloads (model system blocks, voice/session origins, tool rows, plan and
// permission events) are dropped because Tuff carries them in its own DTOs;
// `hostedSearch` is kept opaque. `host` is the one added field: the Tuff host
// projection a snapshot carries and a delta preserves untouched.

export type UiMessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface MessageUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
  totalTokens: number
  providerId?: string
  modelId?: string
}

export interface UiMessage {
  id: string
  role: UiMessageRole
  content: string
  /** Model reasoning kept separate from the answer text. */
  thinking?: string
  createdAt: string
  status?: 'streaming' | 'complete' | 'error' | 'aborted'
  modelId?: string
  providerId?: string
  parentToolCallId?: string
  agentName?: string
  hostedSearch?: unknown
  usage?: MessageUsage
  /**
   * Tuff adaptation: the host-owned message body (parts, meta, error, attachment
   * refs). Replaced whole by a snapshot update and carried through a delta.
   */
  host?: unknown
}

export interface MessageUpdateEvent {
  type: 'message_update'
  message: UiMessage
  deltaText?: string
  deltaThinking?: string
  /**
   * Append-only streaming frame. Growing `content` / `thinking` are omitted
   * from `message`; apply `deltaText` / `deltaThinking` onto the live row.
   * Snapshot replacements omit this field and still carry a full `message`.
   */
  stream?: 'delta'
  resetText?: boolean
  resetThinking?: boolean
}

/**
 * The other upstream event kinds, payloads dropped: the stream helpers only
 * compare their discriminant, never read them.
 */
export interface OtherAgentEvent {
  type:
    | 'agent_start'
    | 'agent_end'
    | 'turn_start'
    | 'usage'
    | 'turn_end'
    | 'message_start'
    | 'message_end'
    | 'user_message_persisted'
    | 'tool_start'
    | 'tool_update'
    | 'tool_end'
    | 'planning_state'
    | 'tool_permission_request'
    | 'asktool_request'
    | 'compaction_start'
    | 'compaction_end'
    | 'error'
    | 'status'
}

export type AgentEvent = MessageUpdateEvent | OtherAgentEvent

export interface AgentEventEnvelope {
  sessionId: string
  turnId?: string
  ts: number
  event: AgentEvent
  parentToolCallId?: string
  nestedParentToolCallId?: string
  agentName?: string
}
