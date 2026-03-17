import type { StatusTone } from '@talex-touch/tuffex'

export interface PilotSession {
  sessionId: string
  status: 'idle' | 'planning' | 'executing' | 'paused_disconnect' | 'completed' | 'failed'
  title?: string | null
  notifyUnread?: boolean
  lastSeq: number
  updatedAt: string
  pauseReason?: 'client_disconnect' | 'heartbeat_timeout' | 'manual_pause' | 'system_preempted' | null
}

export interface PilotSessionRow {
  sessionId: string
  status: PilotSession['status']
  statusTone: StatusTone
  title: string
  notifyUnread: boolean
  running?: boolean
  shortId: string
  lastSeq: number
  updatedAtText: string
  titleLoading: boolean
}

export interface PilotMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  metadata?: {
    attachments?: PilotMessageAttachmentMeta[]
    [key: string]: unknown
  }
}

export interface PilotAttachment {
  id: string
  sessionId: string
  kind: 'image' | 'file'
  type?: 'image' | 'file'
  name: string
  mimeType: string
  size: number
  ref: string
  previewUrl?: string
  modelUrl?: string
  providerFileId?: string
  deliverySource?: 'id' | 'url' | 'base64'
  createdAt?: string
}

export interface PilotMessageAttachmentMeta {
  id: string
  type: 'image' | 'file'
  ref: string
  name?: string
  mimeType?: string
  previewUrl?: string
}

export interface PilotTrace {
  id: string
  seq: number
  type: string
  createdAt: string
  payload: Record<string, unknown>
}

export interface PilotComposerAttachment {
  id: string
  label: string
  kind?: string
  pending?: boolean
}

export interface StreamEvent {
  type: string
  event?: string
  phase?: string
  sessionId?: string
  session_id?: string
  turnId?: string
  turn_id?: string
  seq?: number
  delta?: string
  message?: string
  request_id?: string
  queue_pos?: number
  code?: string
  status_code?: number
  status?: string
  reason?: string
  detail?: Record<string, unknown>
  envelope?: Record<string, unknown>
  payload?: Record<string, unknown>
  replay?: boolean
  timestamp?: number
}

export interface SessionMessagesResponse {
  messages: PilotMessage[]
  attachments: PilotAttachment[]
}

export interface SessionTraceResponse {
  traces: PilotTrace[]
}

export interface SessionTitleResponse {
  title: string
  generated: boolean
  source: 'stored' | 'ai' | 'fallback' | 'empty'
}

export interface SessionNotification {
  sessionId: string
  unread: boolean
}

export interface SessionNotificationsResponse {
  notifications: SessionNotification[]
}
