import type { AgentEnvelope } from '../protocol/envelope'
import type { SessionSnapshot, TurnState, UserMessageInput } from '../protocol/session'

export interface SessionRecord extends SessionSnapshot {
  userId: string
  createdAt: string
  heartbeatAt?: string
  title?: string | null
  notifyUnread?: boolean
  pauseReason?: 'client_disconnect' | 'heartbeat_timeout' | 'manual_pause' | 'system_preempted' | null
}

export interface SessionNotificationRecord {
  sessionId: string
  unread: boolean
}

export interface MessageRecord {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface TraceRecord {
  id: string
  sessionId: string
  seq: number
  type: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface AttachmentRecord {
  id: string
  sessionId: string
  kind: 'image' | 'file'
  name: string
  mimeType: string
  size: number
  ref: string
  createdAt: string
}

export interface RuntimeStoreAdapter {
  ensureSchema(): Promise<void>
  createSession(input: UserMessageInput): Promise<SessionRecord>
  getSession(sessionId: string): Promise<SessionRecord | null>
  listSessions(limit?: number): Promise<SessionRecord[]>
  saveMessage(record: MessageRecord): Promise<void>
  listMessages(sessionId: string): Promise<MessageRecord[]>
  appendTrace(record: Omit<TraceRecord, 'id' | 'createdAt'>): Promise<TraceRecord>
  listTrace(sessionId: string, fromSeq?: number, limit?: number): Promise<TraceRecord[]>
  saveCheckpoint(sessionId: string, turn: TurnState): Promise<void>
  loadCheckpoint(sessionId: string): Promise<TurnState | null>
  touchHeartbeat(sessionId: string): Promise<void>
  pauseSession(sessionId: string, reason: SessionRecord['pauseReason']): Promise<void>
  completeSession(sessionId: string, status: SessionRecord['status']): Promise<void>
  setSessionTitle(sessionId: string, title: string): Promise<void>
  setSessionNotification(sessionId: string, unread: boolean): Promise<void>
  listSessionNotifications(limit?: number): Promise<SessionNotificationRecord[]>
  clearSessionMemory(sessionId: string): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  saveAttachment(record: AttachmentRecord): Promise<void>
  listAttachments(sessionId: string): Promise<AttachmentRecord[]>
}

export interface StoreAdapter {
  runtime: RuntimeStoreAdapter
  emit?: (event: AgentEnvelope) => Promise<void>
}
