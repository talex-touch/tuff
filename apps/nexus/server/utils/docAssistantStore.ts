import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const SESSION_TABLE = 'doc_assistant_sessions'
const MESSAGE_TABLE = 'doc_assistant_messages'
const DOC_CONTEXT_LIMIT = 8000

let schemaInitialized = false

export interface DocAssistantSession {
  id: string
  userId: string
  docTitle: string | null
  docPath: string | null
  docContext: string | null
  createdAt: number
  updatedAt: number
  lastMessageAt: number
}

export interface DocAssistantMessage {
  id: string
  sessionId: string
  userId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

function requireDatabase(event: H3Event): D1Database {
  const db = getD1Database(event)
  if (!db)
    throw new Error('Cloudflare D1 database is not available.')
  return db
}

async function ensureAssistantSchema(db: D1Database) {
  if (schemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SESSION_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      doc_title TEXT,
      doc_path TEXT,
      doc_context TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_message_at INTEGER NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${MESSAGE_TABLE} (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_doc_assistant_sessions_user_id
    ON ${SESSION_TABLE}(user_id, updated_at DESC);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_doc_assistant_messages_session_id
    ON ${MESSAGE_TABLE}(session_id, created_at ASC);
  `).run()

  schemaInitialized = true
}

function sanitizeDocContext(context?: string | null): string | null {
  if (!context)
    return null
  const trimmed = context.trim()
  if (!trimmed)
    return null
  return trimmed.slice(0, DOC_CONTEXT_LIMIT)
}

function mapSession(row: any): DocAssistantSession {
  return {
    id: row.id,
    userId: row.user_id,
    docTitle: row.doc_title ?? null,
    docPath: row.doc_path ?? null,
    docContext: row.doc_context ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  }
}

export async function getAssistantSession(event: H3Event, userId: string, sessionId: string): Promise<DocAssistantSession | null> {
  const db = requireDatabase(event)
  await ensureAssistantSchema(db)

  const row = await db.prepare(`
    SELECT * FROM ${SESSION_TABLE}
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `).bind(sessionId, userId).first()

  return row ? mapSession(row) : null
}

export async function getLatestAssistantSessionByDoc(
  event: H3Event,
  userId: string,
  docPath?: string | null,
): Promise<DocAssistantSession | null> {
  const normalizedPath = typeof docPath === 'string' ? docPath.trim() : ''
  if (!normalizedPath)
    return null

  const db = requireDatabase(event)
  await ensureAssistantSchema(db)

  const row = await db.prepare(`
    SELECT * FROM ${SESSION_TABLE}
    WHERE user_id = ? AND doc_path = ?
    ORDER BY last_message_at DESC
    LIMIT 1
  `).bind(userId, normalizedPath).first()

  return row ? mapSession(row) : null
}

export async function createAssistantSession(
  event: H3Event,
  userId: string,
  doc: { title?: string; path?: string; context?: string },
): Promise<DocAssistantSession> {
  const db = requireDatabase(event)
  await ensureAssistantSchema(db)

  const id = `das_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()
  const docContext = sanitizeDocContext(doc.context)

  await db.prepare(`
    INSERT INTO ${SESSION_TABLE}
      (id, user_id, doc_title, doc_path, doc_context, created_at, updated_at, last_message_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    userId,
    doc.title ?? null,
    doc.path ?? null,
    docContext,
    now,
    now,
    now,
  ).run()

  return {
    id,
    userId,
    docTitle: doc.title ?? null,
    docPath: doc.path ?? null,
    docContext,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  }
}

export async function updateAssistantSession(
  event: H3Event,
  sessionId: string,
  userId: string,
  doc: { title?: string; path?: string; context?: string },
): Promise<void> {
  const db = requireDatabase(event)
  await ensureAssistantSchema(db)

  const now = Date.now()
  const docContext = sanitizeDocContext(doc.context)

  await db.prepare(`
    UPDATE ${SESSION_TABLE}
    SET doc_title = ?, doc_path = ?, doc_context = ?, updated_at = ?, last_message_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(
    doc.title ?? null,
    doc.path ?? null,
    docContext,
    now,
    now,
    sessionId,
    userId,
  ).run()
}

export async function createAssistantMessage(
  event: H3Event,
  params: {
    sessionId: string
    userId: string
    role: 'user' | 'assistant'
    content: string
  },
): Promise<DocAssistantMessage> {
  const db = requireDatabase(event)
  await ensureAssistantSchema(db)

  const id = `dam_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()
  const content = params.content.trim()

  await db.prepare(`
    INSERT INTO ${MESSAGE_TABLE} (id, session_id, user_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, params.sessionId, params.userId, params.role, content, now).run()

  await db.prepare(`
    UPDATE ${SESSION_TABLE}
    SET last_message_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(now, now, params.sessionId, params.userId).run()

  return {
    id,
    sessionId: params.sessionId,
    userId: params.userId,
    role: params.role,
    content,
    createdAt: now,
  }
}

export async function listAssistantMessages(
  event: H3Event,
  userId: string,
  sessionId: string,
  options?: { limit?: number },
): Promise<DocAssistantMessage[]> {
  const db = requireDatabase(event)
  await ensureAssistantSchema(db)

  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 500) : null
  const sql = limit
    ? `
      SELECT * FROM ${MESSAGE_TABLE}
      WHERE session_id = ? AND user_id = ?
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
    : `
      SELECT * FROM ${MESSAGE_TABLE}
      WHERE session_id = ? AND user_id = ?
      ORDER BY created_at ASC
    `

  const result = await db.prepare(sql).bind(sessionId, userId).all()
  const rows = Array.isArray(result?.results) ? result.results : []
  const mapped = rows.map((row: any) => ({
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }))

  if (!limit)
    return mapped

  return mapped.reverse()
}
