import type { H3Event } from 'h3'
import { requirePilotDatabase } from './pilot-store'

const QUOTA_SESSION_TABLE = 'pilot_quota_sessions'

export interface PilotQuotaSessionRecord {
  chatId: string
  userId: string
  runtimeSessionId: string
  channelId: string
  topic: string
  createdAt: string
  updatedAt: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function toText(value: unknown, fallback = ''): string {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

export async function ensurePilotQuotaSessionSchema(event: H3Event): Promise<void> {
  const db = requirePilotDatabase(event)

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${QUOTA_SESSION_TABLE} (
      chat_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      runtime_session_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (chat_id, user_id)
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_pilot_quota_sessions_user_updated
    ON ${QUOTA_SESSION_TABLE}(user_id, updated_at DESC);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_pilot_quota_sessions_runtime
    ON ${QUOTA_SESSION_TABLE}(runtime_session_id);
  `).run()
}

function mapRow(row: {
  chat_id: string
  user_id: string
  runtime_session_id: string
  channel_id: string
  topic: string
  created_at: string
  updated_at: string
}): PilotQuotaSessionRecord {
  return {
    chatId: row.chat_id,
    userId: row.user_id,
    runtimeSessionId: row.runtime_session_id,
    channelId: row.channel_id,
    topic: row.topic,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getPilotQuotaSessionByChatId(
  event: H3Event,
  userId: string,
  chatId: string,
): Promise<PilotQuotaSessionRecord | null> {
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT chat_id, user_id, runtime_session_id, channel_id, topic, created_at, updated_at
    FROM ${QUOTA_SESSION_TABLE}
    WHERE user_id = ?1 AND chat_id = ?2
    LIMIT 1
  `).bind(userId, chatId).first<{
    chat_id: string
    user_id: string
    runtime_session_id: string
    channel_id: string
    topic: string
    created_at: string
    updated_at: string
  }>()

  return row ? mapRow(row) : null
}

export async function getPilotQuotaSessionByRuntimeSessionId(
  event: H3Event,
  userId: string,
  runtimeSessionId: string,
): Promise<PilotQuotaSessionRecord | null> {
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT chat_id, user_id, runtime_session_id, channel_id, topic, created_at, updated_at
    FROM ${QUOTA_SESSION_TABLE}
    WHERE user_id = ?1 AND runtime_session_id = ?2
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(userId, runtimeSessionId).first<{
    chat_id: string
    user_id: string
    runtime_session_id: string
    channel_id: string
    topic: string
    created_at: string
    updated_at: string
  }>()

  return row ? mapRow(row) : null
}

export async function upsertPilotQuotaSession(
  event: H3Event,
  input: {
    chatId: string
    userId: string
    runtimeSessionId: string
    channelId: string
    topic?: string
  },
): Promise<PilotQuotaSessionRecord> {
  const db = requirePilotDatabase(event)
  const now = nowIso()
  const topic = toText(input.topic, '新的聊天')

  await db.prepare(`
    INSERT INTO ${QUOTA_SESSION_TABLE}
      (chat_id, user_id, runtime_session_id, channel_id, topic, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    ON CONFLICT(chat_id, user_id) DO UPDATE SET
      runtime_session_id = excluded.runtime_session_id,
      channel_id = excluded.channel_id,
      topic = excluded.topic,
      updated_at = excluded.updated_at
  `).bind(
    input.chatId,
    input.userId,
    input.runtimeSessionId,
    input.channelId,
    topic,
    now,
    now,
  ).run()

  const row = await getPilotQuotaSessionByChatId(event, input.userId, input.chatId)
  if (row) {
    return row
  }

  return {
    chatId: input.chatId,
    userId: input.userId,
    runtimeSessionId: input.runtimeSessionId,
    channelId: input.channelId,
    topic,
    createdAt: now,
    updatedAt: now,
  }
}

export async function listPilotQuotaSessions(
  event: H3Event,
  userId: string,
  limit = 500,
): Promise<PilotQuotaSessionRecord[]> {
  const db = requirePilotDatabase(event)
  const bounded = Math.min(Math.max(Math.floor(Number(limit || 0)), 1), 10_000)
  const { results } = await db.prepare(`
    SELECT chat_id, user_id, runtime_session_id, channel_id, topic, created_at, updated_at
    FROM ${QUOTA_SESSION_TABLE}
    WHERE user_id = ?1
    ORDER BY updated_at DESC
    LIMIT ?2
  `).bind(userId, bounded).all<{
    chat_id: string
    user_id: string
    runtime_session_id: string
    channel_id: string
    topic: string
    created_at: string
    updated_at: string
  }>()

  return (results || []).map(mapRow)
}

export async function deletePilotQuotaSessionByChatId(
  event: H3Event,
  userId: string,
  chatId: string,
): Promise<void> {
  const db = requirePilotDatabase(event)
  await db.prepare(`
    DELETE FROM ${QUOTA_SESSION_TABLE}
    WHERE user_id = ?1 AND chat_id = ?2
  `).bind(userId, chatId).run()
}
