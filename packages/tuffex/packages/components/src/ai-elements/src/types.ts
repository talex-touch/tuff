export type AiElementMessageRole = 'user' | 'assistant' | 'system' | 'tool'

// ---------------------------------------------------------------------------
// Message parts. A message may carry a `parts` sequence for heterogeneous
// content (text, reasoning, tool calls, attachments); `content` stays as the
// plain-text summary/fallback so existing consumers keep working unchanged.
// ---------------------------------------------------------------------------

export interface AiTextPart {
  type: 'text'
  text: string
}

export interface AiReasoningPart {
  type: 'reasoning'
  text: string
  done?: boolean
  durationMs?: number
}

export interface AiToolCallPart {
  type: 'tool-call'
  id: string
  name: string
  status: 'pending' | 'running' | 'done' | 'error'
  /** One-line summary shown in the collapsed header. */
  summary?: string
  /** Serialized input summary. */
  input?: string
  /** Result text — the fallback rendering when no widget surface is mounted. */
  output?: string
  error?: string
  /** Streaming log region while running. */
  logs?: string
  /**
   * Set once an interactive result (a rendered form) has been answered.
   * Lives on the part rather than in host session state so it persists with
   * the conversation — a reloaded thread must not re-offer a spent form.
   */
  submitted?: boolean
}

export interface AiAttachmentImage {
  kind: 'image'
  id: string
  url: string
  name?: string
  width?: number
  height?: number
}

export interface AiAttachmentFile {
  kind: 'file'
  id: string
  name: string
  size?: number
  mime?: string
}

export type AiAttachment = (AiAttachmentImage | AiAttachmentFile) & {
  /** 0–1; only meaningful while uploading. */
  progress?: number
  uploading?: boolean
}

/** One tray per part: a message's attachments display as a group. */
export interface AiAttachmentPart {
  type: 'attachment'
  attachments: AiAttachment[]
}

export interface AiSourceItem {
  id: string
  url: string
  title?: string
  favicon?: string
}

/** References backing an answer — web results, MCP resources, cited files. */
export interface AiSourcesPart {
  type: 'sources'
  sources: AiSourceItem[]
}

export type AiMessagePart = AiTextPart | AiReasoningPart | AiToolCallPart | AiAttachmentPart | AiSourcesPart

/** A follow-up the user can tap to send — rendered after a settled reply. */
export interface AiSuggestion {
  id: string
  text: string
}

/**
 * One step of a multi-step reasoning/tool sequence, derived by the consumer
 * from a message's parts (a thinking span or a tool call each become a step).
 */
export interface AiChainStep {
  id: string
  kind: 'thinking' | 'tool'
  title: string
  body?: string
  status: 'active' | 'done' | 'error'
  /** Wall time the step took; settled thinking steps render it as a quiet suffix. */
  durationMs?: number
}

export interface AiElementMessage {
  id: string
  role: AiElementMessageRole
  content: string
  createdAt?: number | string | Date
  name?: string
  avatar?: string
  status?: 'pending' | 'streaming' | 'complete' | 'error'
  /** When present, the content area renders these in order instead of `content`. */
  parts?: AiMessagePart[]
}

export interface AiMessageProps {
  message: AiElementMessage
  markdown?: boolean
  compact?: boolean
  showAvatar?: boolean
}

export interface AiConversationProps {
  messages: AiElementMessage[]
  markdown?: boolean
  compact?: boolean
  emptyText?: string
  showAvatar?: boolean
}
