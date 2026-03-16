import type { AgentEnvelope } from './envelope'
import type { IntelligenceMessage } from '../types/intelligence'

export interface UserMessageAttachment {
  id: string
  type: 'image' | 'file'
  ref: string
  name?: string
  mimeType?: string
  previewUrl?: string
  modelUrl?: string
  providerFileId?: string
  deliverySource?: 'id' | 'url' | 'base64'
  dataUrl?: string
  size?: number
}

export interface UserMessageInput {
  sessionId?: string
  message: string
  attachments?: UserMessageAttachment[]
  metadata?: Record<string, unknown>
}

export interface ViewEventInput {
  sessionId: string
  turnId?: string
  viewId: string
  event: string
  payload?: unknown
}

export interface ApprovalInput {
  sessionId: string
  turnId?: string
  approvalId: string
  approved: boolean
  reason?: string
  payload?: unknown
}

export interface SessionSnapshot {
  sessionId: string
  status: 'idle' | 'planning' | 'executing' | 'paused_disconnect' | 'completed' | 'failed'
  messages: IntelligenceMessage[]
  lastTurnId?: string
  lastSeq: number
  updatedAt: string
}

export interface TurnState {
  sessionId: string
  turnId: string
  done: boolean
  seq: number
  messages: IntelligenceMessage[]
  events: AgentEnvelope[]
  attachments?: UserMessageAttachment[]
  metadata?: Record<string, unknown>
}
