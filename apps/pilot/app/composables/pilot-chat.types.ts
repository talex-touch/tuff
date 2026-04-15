import type { StatusTone } from '@talex-touch/tuffex'
import type {
  PilotDerivedToolCall,
  PilotStreamEvent as PilotWireStreamEvent,
  PilotSystemMessageMetadata,
} from '@talex-touch/tuff-intelligence/pilot'

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
  } & Partial<PilotSystemMessageMetadata> & Record<string, unknown>
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

export type PilotToolCall = PilotDerivedToolCall

export interface PilotComposerAttachment {
  id: string
  label: string
  kind?: string
  pending?: boolean
}

export interface PilotStageItem {
  key: string
  label: string
  status: 'pending' | 'running' | 'done' | 'skipped'
  detail?: string
}

export interface PilotRuntimeStatusSnapshot {
  intentLabel: string
  intentDetail: string
  requestModelLabel: string
  websearchLabel: string
  memoryLabel: string
  thinkingLabel: string
  stages: PilotStageItem[]
}

export type StreamEvent = PilotWireStreamEvent & {
  event?: string
  phase?: string
  session_id?: string
  turn_id?: string
  name?: string
  data?: string
  request_id?: string
  queue_pos?: number
  code?: string
  status_code?: number
  status?: string
  confidence?: number
  providerModel?: string
  modelId?: string
  channelId?: string
  routeComboId?: string
  selectionSource?: string
  selectionReason?: string
  source?: string
  sourceReason?: string
  sourceCount?: number
  enabled?: boolean
  memoryEnabled?: boolean
  memoryHistoryMessageCount?: number
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
