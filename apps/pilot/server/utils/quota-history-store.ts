import type { H3Event } from 'h3'
import { requirePilotDatabase } from './pilot-store'

const QUOTA_HISTORY_TABLE = 'pilot_quota_history'

export interface QuotaHistoryRecord {
  chatId: string
  userId: string
  topic: string
  value: string
  meta: string
  createdAt: string
  updatedAt: string
}

export interface QuotaHistoryQueryResult {
  totalItems: number
  items: QuotaHistoryRecord[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeTopic(topic: unknown): string {
  const text = String(topic || '').trim()
  return text || '新的聊天'
}

export async function ensureQuotaHistorySchema(event: H3Event): Promise<void> {
  const db = requirePilotDatabase(event)

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${QUOTA_HISTORY_TABLE} (
      chat_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      value TEXT NOT NULL,
      meta TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (chat_id, user_id)
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_pilot_quota_history_user_updated
    ON ${QUOTA_HISTORY_TABLE}(user_id, updated_at DESC);
  `).run()
}

export async function upsertQuotaHistory(
  event: H3Event,
  row: {
    chatId: string
    userId: string
    topic: unknown
    value: unknown
    meta?: unknown
  },
): Promise<QuotaHistoryRecord> {
  const db = requirePilotDatabase(event)
  const now = nowIso()

  const topic = normalizeTopic(row.topic)
  const value = String(row.value || '')
  const meta = String(row.meta || '')

  await db.prepare(`
    INSERT INTO ${QUOTA_HISTORY_TABLE}
      (chat_id, user_id, topic, value, meta, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    ON CONFLICT(chat_id, user_id) DO UPDATE SET
      topic = excluded.topic,
      value = excluded.value,
      meta = excluded.meta,
      updated_at = excluded.updated_at
  `).bind(
    row.chatId,
    row.userId,
    topic,
    value,
    meta,
    now,
    now,
  ).run()

  const result = await getQuotaHistory(event, row.userId, row.chatId)
  if (result) {
    return result
  }

  return {
    chatId: row.chatId,
    userId: row.userId,
    topic,
    value,
    meta,
    createdAt: now,
    updatedAt: now,
  }
}

export async function getQuotaHistory(
  event: H3Event,
  userId: string,
  chatId: string,
): Promise<QuotaHistoryRecord | null> {
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT chat_id, user_id, topic, value, meta, created_at, updated_at
    FROM ${QUOTA_HISTORY_TABLE}
    WHERE user_id = ?1 AND chat_id = ?2
    LIMIT 1
  `).bind(userId, chatId).first<{
    chat_id: string
    user_id: string
    topic: string
    value: string
    meta: string
    created_at: string
    updated_at: string
  }>()

  if (!row) {
    return null
  }

  return {
    chatId: row.chat_id,
    userId: row.user_id,
    topic: row.topic,
    value: row.value,
    meta: row.meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listQuotaHistory(
  event: H3Event,
  options: {
    userId: string
    page: number
    pageSize: number
    topic?: string
  },
): Promise<QuotaHistoryQueryResult> {
  const db = requirePilotDatabase(event)
  const page = Math.max(1, Math.floor(options.page))
  const pageSize = Math.min(Math.max(Math.floor(options.pageSize), 1), 200)
  const offset = (page - 1) * pageSize
  const topic = String(options.topic || '').trim()

  if (topic) {
    const like = `%${topic}%`
    const countRow = await db.prepare(`
      SELECT COUNT(*) AS total
      FROM ${QUOTA_HISTORY_TABLE}
      WHERE user_id = ?1 AND topic LIKE ?2
    `).bind(options.userId, like).first<{ total?: number | string }>()

    const rows = await db.prepare(`
      SELECT chat_id, user_id, topic, value, meta, created_at, updated_at
      FROM ${QUOTA_HISTORY_TABLE}
      WHERE user_id = ?1 AND topic LIKE ?2
      ORDER BY updated_at DESC
      LIMIT ?3 OFFSET ?4
    `).bind(options.userId, like, pageSize, offset).all<{
      chat_id: string
      user_id: string
      topic: string
      value: string
      meta: string
      created_at: string
      updated_at: string
    }>()

    return {
      totalItems: Number(countRow?.total || 0),
      items: (rows.results || []).map(item => ({
        chatId: item.chat_id,
        userId: item.user_id,
        topic: item.topic,
        value: item.value,
        meta: item.meta,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
    }
  }

  const countRow = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM ${QUOTA_HISTORY_TABLE}
    WHERE user_id = ?1
  `).bind(options.userId).first<{ total?: number | string }>()

  const rows = await db.prepare(`
    SELECT chat_id, user_id, topic, value, meta, created_at, updated_at
    FROM ${QUOTA_HISTORY_TABLE}
    WHERE user_id = ?1
    ORDER BY updated_at DESC
    LIMIT ?2 OFFSET ?3
  `).bind(options.userId, pageSize, offset).all<{
    chat_id: string
    user_id: string
    topic: string
    value: string
    meta: string
    created_at: string
    updated_at: string
  }>()

  return {
    totalItems: Number(countRow?.total || 0),
    items: (rows.results || []).map(item => ({
      chatId: item.chat_id,
      userId: item.user_id,
      topic: item.topic,
      value: item.value,
      meta: item.meta,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
  }
}

export async function deleteQuotaHistory(
  event: H3Event,
  userId: string,
  chatId: string,
): Promise<void> {
  const db = requirePilotDatabase(event)
  await db.prepare(`
    DELETE FROM ${QUOTA_HISTORY_TABLE}
    WHERE user_id = ?1 AND chat_id = ?2
  `).bind(userId, chatId).run()
}
