import type { H3Event } from 'h3'
import { requirePilotDatabase } from './pilot-store'

const SHARE_TABLE = 'pilot_quota_shares'

export interface QuotaShareRecord {
  shareId: string
  chatId: string
  userId: string
  topic: string
  value: string
  createdAt: string
  updatedAt: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function randomShareId(): string {
  return `share_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-6)}`
}

function normalizeTopic(topic: unknown): string {
  const value = String(topic || '').trim()
  return value || '新的聊天'
}

function mapRow(row: {
  share_id: string
  chat_id: string
  user_id: string
  topic: string
  value: string
  created_at: string
  updated_at: string
}): QuotaShareRecord {
  return {
    shareId: row.share_id,
    chatId: row.chat_id,
    userId: row.user_id,
    topic: row.topic,
    value: row.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function ensureQuotaShareSchema(event: H3Event): Promise<void> {
  const db = requirePilotDatabase(event)

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SHARE_TABLE} (
      share_id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pilot_quota_shares_chat_user
    ON ${SHARE_TABLE}(chat_id, user_id);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_pilot_quota_shares_user_updated
    ON ${SHARE_TABLE}(user_id, updated_at DESC);
  `).run()
}

export async function getQuotaShareById(event: H3Event, shareId: string): Promise<QuotaShareRecord | null> {
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT share_id, chat_id, user_id, topic, value, created_at, updated_at
    FROM ${SHARE_TABLE}
    WHERE share_id = ?1
    LIMIT 1
  `).bind(shareId).first<{
    share_id: string
    chat_id: string
    user_id: string
    topic: string
    value: string
    created_at: string
    updated_at: string
  }>()

  return row ? mapRow(row) : null
}

export async function getQuotaShareByChatId(
  event: H3Event,
  userId: string,
  chatId: string,
): Promise<QuotaShareRecord | null> {
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT share_id, chat_id, user_id, topic, value, created_at, updated_at
    FROM ${SHARE_TABLE}
    WHERE user_id = ?1 AND chat_id = ?2
    LIMIT 1
  `).bind(userId, chatId).first<{
    share_id: string
    chat_id: string
    user_id: string
    topic: string
    value: string
    created_at: string
    updated_at: string
  }>()

  return row ? mapRow(row) : null
}

export async function upsertQuotaShare(event: H3Event, input: {
  userId: string
  chatId: string
  topic: string
  value: string
}): Promise<QuotaShareRecord> {
  const db = requirePilotDatabase(event)
  const now = nowIso()
  const existing = await getQuotaShareByChatId(event, input.userId, input.chatId)
  const shareId = existing?.shareId || randomShareId()

  await db.prepare(`
    INSERT INTO ${SHARE_TABLE}
      (share_id, chat_id, user_id, topic, value, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    ON CONFLICT(share_id) DO UPDATE SET
      topic = excluded.topic,
      value = excluded.value,
      updated_at = excluded.updated_at
  `).bind(
    shareId,
    input.chatId,
    input.userId,
    normalizeTopic(input.topic),
    String(input.value || ''),
    existing?.createdAt || now,
    now,
  ).run()

  const record = await getQuotaShareById(event, shareId)
  if (record) {
    return record
  }

  return {
    shareId,
    chatId: input.chatId,
    userId: input.userId,
    topic: normalizeTopic(input.topic),
    value: String(input.value || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
}

export async function listQuotaShares(event: H3Event, options: {
  userId: string
  page: number
  pageSize: number
}): Promise<{ totalItems: number, items: QuotaShareRecord[] }> {
  const db = requirePilotDatabase(event)
  const page = Math.max(1, Math.floor(options.page))
  const pageSize = Math.min(Math.max(Math.floor(options.pageSize), 1), 200)
  const offset = (page - 1) * pageSize

  const count = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM ${SHARE_TABLE}
    WHERE user_id = ?1
  `).bind(options.userId).first<{ total?: number | string }>()

  const rows = await db.prepare(`
    SELECT share_id, chat_id, user_id, topic, value, created_at, updated_at
    FROM ${SHARE_TABLE}
    WHERE user_id = ?1
    ORDER BY updated_at DESC
    LIMIT ?2 OFFSET ?3
  `).bind(options.userId, pageSize, offset).all<{
    share_id: string
    chat_id: string
    user_id: string
    topic: string
    value: string
    created_at: string
    updated_at: string
  }>()

  return {
    totalItems: Number(count?.total || 0),
    items: (rows.results || []).map(mapRow),
  }
}
