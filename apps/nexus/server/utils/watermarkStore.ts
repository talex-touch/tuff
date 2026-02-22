import type { H3Event } from 'h3'
import { readCloudflareBindings } from './cloudflare'

export interface WatermarkRecord {
  id: string
  seed: number
  userId: string | null
  deviceId: string
  sessionId: string
  shotId: string
  issuedAt: number
  expiresAt: number
}

export const WATERMARK_RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000

const memoryStore: WatermarkRecord[] = []
const MEMORY_LIMIT = 500
let tableReady = false

async function ensureTable(event: H3Event) {
  if (tableReady)
    return
  const bindings = readCloudflareBindings(event)
  if (!bindings?.DB)
    return
  await bindings.DB.prepare(`
    CREATE TABLE IF NOT EXISTS watermark_tokens (
      id TEXT PRIMARY KEY,
      seed INTEGER NOT NULL,
      user_id TEXT,
      device_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      shot_id TEXT NOT NULL,
      issued_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `).run()
  tableReady = true
}

export async function registerWatermarkToken(event: H3Event, record: WatermarkRecord) {
  const bindings = readCloudflareBindings(event)
  if (bindings?.DB) {
    await ensureTable(event)
    await bindings.DB.prepare(`
      INSERT INTO watermark_tokens (id, seed, user_id, device_id, session_id, shot_id, issued_at, expires_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8);
    `).bind(
      record.id,
      record.seed,
      record.userId,
      record.deviceId,
      record.sessionId,
      record.shotId,
      record.issuedAt,
      record.expiresAt,
    ).run()
    return
  }

  memoryStore.unshift(record)
  if (memoryStore.length > MEMORY_LIMIT)
    memoryStore.length = MEMORY_LIMIT
}

export async function listWatermarkTokens(event: H3Event, limit = 200) {
  const bindings = readCloudflareBindings(event)
  const now = Date.now()
  if (bindings?.DB) {
    await ensureTable(event)
    const { results } = await bindings.DB.prepare(`
      SELECT id, seed, user_id, device_id, session_id, shot_id, issued_at, expires_at
      FROM watermark_tokens
      WHERE expires_at >= ?1
      ORDER BY issued_at DESC
      LIMIT ?2;
    `).bind(now, limit).all<{
      id: string
      seed: number
      user_id: string | null
      device_id: string
      session_id: string
      shot_id: string
      issued_at: number
      expires_at: number
    }>()
    return (results || []).map(item => ({
      id: item.id,
      seed: Number(item.seed),
      userId: item.user_id ?? null,
      deviceId: item.device_id,
      sessionId: item.session_id,
      shotId: item.shot_id,
      issuedAt: Number(item.issued_at),
      expiresAt: Number(item.expires_at),
    }))
  }

  return memoryStore.filter(record => record.expiresAt >= now).slice(0, limit)
}
