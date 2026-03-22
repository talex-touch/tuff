import type { D1Database } from '@cloudflare/workers-types'
import type { TurnState } from '../protocol/session'
import type {
  AttachmentRecord,
  MessageRecord,
  RuntimeStoreAdapter,
  SessionNotificationRecord,
  SessionRecord,
  TraceRecord,
} from './store-adapter'

const SESSIONS_TABLE = 'pilot_chat_sessions'
const MESSAGES_TABLE = 'pilot_chat_messages'
const TRACE_TABLE = 'pilot_chat_trace'
const CHECKPOINTS_TABLE = 'pilot_chat_checkpoints'
const ATTACHMENTS_TABLE = 'pilot_chat_attachments'

function nowIso() {
  return new Date().toISOString()
}

function randomId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function stringify(value: unknown): string {
  return JSON.stringify(value ?? {})
}

function isDuplicateColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const maybePgCode = (error as { code?: unknown }).code
  if (typeof maybePgCode === 'string' && maybePgCode.trim() === '42701') {
    return true
  }

  const message = error instanceof Error
    ? error.message
    : String((error as { message?: unknown }).message || '')

  return /duplicate column name|column\s+['"]?[\w$]+['"]?\s+of relation\s+['"]?[\w$]+['"]?\s+already exists/i.test(message)
}

export class D1RuntimeStoreAdapter implements RuntimeStoreAdapter {
  constructor(private readonly db: D1Database, private readonly userId: string) {}

  async ensureSchema(): Promise<void> {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS ${SESSIONS_TABLE} (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        title TEXT,
        last_seq INTEGER NOT NULL DEFAULT 0,
        heartbeat_at TEXT,
        pause_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `).run()

    try {
      await this.db.prepare(`
        ALTER TABLE ${SESSIONS_TABLE}
        ADD COLUMN title TEXT
      `).run()
    } catch (error) {
      if (!isDuplicateColumnError(error)) {
        throw error
      }
    }

    try {
      await this.db.prepare(`
        ALTER TABLE ${SESSIONS_TABLE}
        ADD COLUMN notify_unread INTEGER NOT NULL DEFAULT 0
      `).run()
    } catch (error) {
      if (!isDuplicateColumnError(error)) {
        throw error
      }
    }

    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_pilot_chat_sessions_user_updated
      ON ${SESSIONS_TABLE}(user_id, updated_at DESC);
    `).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS ${MESSAGES_TABLE} (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );
    `).run()

    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_pilot_chat_messages_session_created
      ON ${MESSAGES_TABLE}(session_id, created_at ASC);
    `).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS ${TRACE_TABLE} (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `).run()

    await this.db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pilot_chat_trace_session_seq
      ON ${TRACE_TABLE}(session_id, seq);
    `).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS ${CHECKPOINTS_TABLE} (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `).run()

    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_pilot_chat_checkpoints_session_seq
      ON ${CHECKPOINTS_TABLE}(session_id, seq DESC);
    `).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS ${ATTACHMENTS_TABLE} (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        ref TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `).run()

    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_pilot_chat_attachments_session_created
      ON ${ATTACHMENTS_TABLE}(session_id, created_at DESC);
    `).run()
  }

  async createSession(input: { sessionId?: string; message: string }): Promise<SessionRecord> {
    const sessionId = input.sessionId?.trim() || randomId('session')
    const now = nowIso()
    const row: SessionRecord = {
      sessionId,
      status: 'executing',
      userId: this.userId,
      title: null,
      notifyUnread: false,
      lastSeq: 0,
      createdAt: now,
      updatedAt: now,
      heartbeatAt: now,
      pauseReason: null,
      messages: [],
      lastTurnId: undefined,
    }

    await this.db.prepare(`
      INSERT INTO ${SESSIONS_TABLE} (session_id, user_id, status, title, notify_unread, last_seq, heartbeat_at, pause_reason, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      ON CONFLICT(session_id) DO UPDATE SET
        status = excluded.status,
        heartbeat_at = excluded.heartbeat_at,
        pause_reason = excluded.pause_reason,
        updated_at = excluded.updated_at
    `).bind(sessionId, this.userId, row.status, null, 0, 0, now, null, now, now).run()

    return row
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const row = await this.db.prepare(`
      SELECT session_id, user_id, status, title, notify_unread, last_seq, heartbeat_at, pause_reason, created_at, updated_at
      FROM ${SESSIONS_TABLE}
      WHERE session_id = ?1 AND user_id = ?2
      LIMIT 1
    `).bind(sessionId, this.userId).first<{
      session_id: string
      user_id: string
      status: SessionRecord['status']
      title: string | null
      notify_unread: number | null
      last_seq: number
      heartbeat_at: string | null
      pause_reason: SessionRecord['pauseReason']
      created_at: string
      updated_at: string
    }>()

    if (!row) {
      return null
    }

    return {
      sessionId: row.session_id,
      userId: row.user_id,
      status: row.status,
      title: row.title || null,
      notifyUnread: Number(row.notify_unread || 0) > 0,
      lastSeq: Number(row.last_seq || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      heartbeatAt: row.heartbeat_at || undefined,
      pauseReason: row.pause_reason,
      messages: [],
      lastTurnId: undefined,
    }
  }

  async listSessions(limit = 20): Promise<SessionRecord[]> {
    const bounded = Math.min(Math.max(limit, 1), 200)
    const { results } = await this.db.prepare(`
      SELECT session_id, user_id, status, title, notify_unread, last_seq, heartbeat_at, pause_reason, created_at, updated_at
      FROM ${SESSIONS_TABLE}
      WHERE user_id = ?1
      ORDER BY updated_at DESC
      LIMIT ?2
    `).bind(this.userId, bounded).all<{
      session_id: string
      user_id: string
      status: SessionRecord['status']
      title: string | null
      notify_unread: number | null
      last_seq: number
      heartbeat_at: string | null
      pause_reason: SessionRecord['pauseReason']
      created_at: string
      updated_at: string
    }>()

    return (results || []).map(row => ({
      sessionId: row.session_id,
      userId: row.user_id,
      status: row.status,
      title: row.title || null,
      notifyUnread: Number(row.notify_unread || 0) > 0,
      lastSeq: Number(row.last_seq || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      heartbeatAt: row.heartbeat_at || undefined,
      pauseReason: row.pause_reason,
      messages: [],
      lastTurnId: undefined,
    }))
  }

  async saveMessage(record: MessageRecord): Promise<void> {
    await this.db.prepare(`
      INSERT OR REPLACE INTO ${MESSAGES_TABLE}
      (id, session_id, user_id, role, content, metadata_json, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `).bind(
      record.id,
      record.sessionId,
      this.userId,
      record.role,
      record.content,
      record.metadata ? stringify(record.metadata) : null,
      record.createdAt,
    ).run()
  }

  async listMessages(sessionId: string): Promise<MessageRecord[]> {
    const { results } = await this.db.prepare(`
      SELECT id, session_id, role, content, metadata_json, created_at
      FROM ${MESSAGES_TABLE}
      WHERE session_id = ?1 AND user_id = ?2
      ORDER BY created_at ASC
    `).bind(sessionId, this.userId).all<{
      id: string
      session_id: string
      role: MessageRecord['role']
      content: string
      metadata_json: string | null
      created_at: string
    }>()

    return (results || []).map(row => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      metadata: parseJson(row.metadata_json, {}),
      createdAt: row.created_at,
    }))
  }

  async appendTrace(record: Omit<TraceRecord, 'id' | 'createdAt'>): Promise<TraceRecord> {
    const id = randomId('trace')
    const now = nowIso()
    const insertTraceStatement = this.db.prepare(`
      INSERT INTO ${TRACE_TABLE} (id, session_id, user_id, seq, type, payload_json, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `).bind(
      id,
      record.sessionId,
      this.userId,
      record.seq,
      record.type,
      stringify(record.payload),
      now,
    )
    const updateSessionStatement = this.db.prepare(`
      UPDATE ${SESSIONS_TABLE}
      SET last_seq = ?1, updated_at = ?2
      WHERE session_id = ?3 AND user_id = ?4
    `).bind(record.seq, now, record.sessionId, this.userId)

    await this.db.batch([insertTraceStatement, updateSessionStatement])

    return {
      id,
      sessionId: record.sessionId,
      seq: record.seq,
      type: record.type,
      payload: record.payload,
      createdAt: now,
    }
  }

  async listTrace(sessionId: string, fromSeq = 1, limit = 200): Promise<TraceRecord[]> {
    const bounded = Math.min(Math.max(limit, 1), 2000)
    const { results } = await this.db.prepare(`
      SELECT id, session_id, seq, type, payload_json, created_at
      FROM ${TRACE_TABLE}
      WHERE session_id = ?1 AND user_id = ?2 AND seq >= ?3
      ORDER BY seq ASC
      LIMIT ?4
    `).bind(sessionId, this.userId, fromSeq, bounded).all<{
      id: string
      session_id: string
      seq: number
      type: string
      payload_json: string
      created_at: string
    }>()

    return (results || []).map(row => ({
      id: row.id,
      sessionId: row.session_id,
      seq: Number(row.seq || 0),
      type: row.type,
      payload: parseJson(row.payload_json, {}),
      createdAt: row.created_at,
    }))
  }

  async saveCheckpoint(sessionId: string, turn: TurnState): Promise<void> {
    await this.db.prepare(`
      INSERT INTO ${CHECKPOINTS_TABLE} (id, session_id, user_id, seq, state_json, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `).bind(randomId('checkpoint'), sessionId, this.userId, turn.seq, stringify(turn), nowIso()).run()
  }

  async loadCheckpoint(sessionId: string): Promise<TurnState | null> {
    const row = await this.db.prepare(`
      SELECT state_json
      FROM ${CHECKPOINTS_TABLE}
      WHERE session_id = ?1 AND user_id = ?2
      ORDER BY seq DESC, created_at DESC
      LIMIT 1
    `).bind(sessionId, this.userId).first<{ state_json: string }>()

    if (!row) {
      return null
    }
    return parseJson<TurnState | null>(row.state_json, null)
  }

  async touchHeartbeat(sessionId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE ${SESSIONS_TABLE}
      SET heartbeat_at = ?1, updated_at = ?1
      WHERE session_id = ?2 AND user_id = ?3
    `).bind(nowIso(), sessionId, this.userId).run()
  }

  async pauseSession(sessionId: string, reason: SessionRecord['pauseReason']): Promise<void> {
    await this.db.prepare(`
      UPDATE ${SESSIONS_TABLE}
      SET status = 'paused_disconnect', pause_reason = ?1, updated_at = ?2
      WHERE session_id = ?3 AND user_id = ?4
    `).bind(reason || 'manual_pause', nowIso(), sessionId, this.userId).run()
  }

  async completeSession(sessionId: string, status: SessionRecord['status']): Promise<void> {
    await this.db.prepare(`
      UPDATE ${SESSIONS_TABLE}
      SET status = ?1, updated_at = ?2, pause_reason = NULL
      WHERE session_id = ?3 AND user_id = ?4
    `).bind(status, nowIso(), sessionId, this.userId).run()
  }

  async setSessionTitle(sessionId: string, title: string): Promise<void> {
    const normalized = title.trim().slice(0, 80)
    if (!normalized) {
      return
    }

    await this.db.prepare(`
      UPDATE ${SESSIONS_TABLE}
      SET title = ?1, updated_at = ?2
      WHERE session_id = ?3 AND user_id = ?4
    `).bind(normalized, nowIso(), sessionId, this.userId).run()
  }

  async setSessionNotification(sessionId: string, unread: boolean): Promise<void> {
    await this.db.prepare(`
      UPDATE ${SESSIONS_TABLE}
      SET notify_unread = ?1
      WHERE session_id = ?2 AND user_id = ?3
    `).bind(unread ? 1 : 0, sessionId, this.userId).run()
  }

  async listSessionNotifications(limit = 200): Promise<SessionNotificationRecord[]> {
    const bounded = Math.min(Math.max(limit, 1), 500)
    const { results } = await this.db.prepare(`
      SELECT session_id, notify_unread
      FROM ${SESSIONS_TABLE}
      WHERE user_id = ?1
      ORDER BY updated_at DESC
      LIMIT ?2
    `).bind(this.userId, bounded).all<{
      session_id: string
      notify_unread: number | null
    }>()

    return (results || []).map(row => ({
      sessionId: row.session_id,
      unread: Number(row.notify_unread || 0) > 0,
    }))
  }

  async clearSessionMemory(sessionId: string): Promise<void> {
    await this.db.prepare(`
      DELETE FROM ${TRACE_TABLE}
      WHERE session_id = ?1 AND user_id = ?2
    `).bind(sessionId, this.userId).run()

    await this.db.prepare(`
      DELETE FROM ${MESSAGES_TABLE}
      WHERE session_id = ?1 AND user_id = ?2
    `).bind(sessionId, this.userId).run()

    await this.db.prepare(`
      DELETE FROM ${CHECKPOINTS_TABLE}
      WHERE session_id = ?1 AND user_id = ?2
    `).bind(sessionId, this.userId).run()

    await this.db.prepare(`
      DELETE FROM ${ATTACHMENTS_TABLE}
      WHERE session_id = ?1 AND user_id = ?2
    `).bind(sessionId, this.userId).run()

    await this.db.prepare(`
      UPDATE ${SESSIONS_TABLE}
      SET status = 'idle',
          notify_unread = 0,
          last_seq = 0,
          pause_reason = NULL,
          updated_at = ?1
      WHERE session_id = ?2 AND user_id = ?3
    `).bind(nowIso(), sessionId, this.userId).run()
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.prepare(`
      DELETE FROM ${TRACE_TABLE}
      WHERE session_id = ?1 AND user_id = ?2
    `).bind(sessionId, this.userId).run()

    await this.db.prepare(`
      DELETE FROM ${MESSAGES_TABLE}
      WHERE session_id = ?1 AND user_id = ?2
    `).bind(sessionId, this.userId).run()

    await this.db.prepare(`
      DELETE FROM ${CHECKPOINTS_TABLE}
      WHERE session_id = ?1 AND user_id = ?2
    `).bind(sessionId, this.userId).run()

    await this.db.prepare(`
      DELETE FROM ${ATTACHMENTS_TABLE}
      WHERE session_id = ?1 AND user_id = ?2
    `).bind(sessionId, this.userId).run()

    await this.db.prepare(`
      DELETE FROM ${SESSIONS_TABLE}
      WHERE session_id = ?1 AND user_id = ?2
    `).bind(sessionId, this.userId).run()
  }

  async saveAttachment(record: AttachmentRecord): Promise<void> {
    await this.db.prepare(`
      INSERT OR REPLACE INTO ${ATTACHMENTS_TABLE}
      (id, session_id, user_id, kind, name, mime_type, size, ref, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    `).bind(
      record.id,
      record.sessionId,
      this.userId,
      record.kind,
      record.name,
      record.mimeType,
      record.size,
      record.ref,
      record.createdAt,
    ).run()
  }

  async listAttachments(sessionId: string): Promise<AttachmentRecord[]> {
    const { results } = await this.db.prepare(`
      SELECT id, session_id, kind, name, mime_type, size, ref, created_at
      FROM ${ATTACHMENTS_TABLE}
      WHERE session_id = ?1 AND user_id = ?2
      ORDER BY created_at ASC
    `).bind(sessionId, this.userId).all<{
      id: string
      session_id: string
      kind: AttachmentRecord['kind']
      name: string
      mime_type: string
      size: number
      ref: string
      created_at: string
    }>()

    return (results || []).map(row => ({
      id: row.id,
      sessionId: row.session_id,
      kind: row.kind,
      name: row.name,
      mimeType: row.mime_type,
      size: Number(row.size || 0),
      ref: row.ref,
      createdAt: row.created_at,
    }))
  }
}
