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

export type AiMessagePart = AiTextPart | AiReasoningPart | AiToolCallPart | AiAttachmentPart

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
