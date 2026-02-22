import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'
import { useRuntimeConfig } from '#imports'
import { readCloudflareBindings } from './cloudflare'

export interface WatermarkTrackingRecord {
  code: string
  userId: string | null
  deviceId: string
  createdAt: number
  lastSeenAt: number
}

const CODE_PREFIX = 'TWM1-'
const CODE_LENGTH = 10

const memoryByKey = new Map<string, WatermarkTrackingRecord>()
const memoryByCode = new Map<string, WatermarkTrackingRecord>()
let tableReady = false

function getSecret() {
  const config = useRuntimeConfig()
  return (
    config.watermark?.secretKey
    || config.auth?.secret
    || process.env.WATERMARK_SECRET_KEY
    || 'nexus-watermark-fallback-secret-v1'
  )
}

function buildCode(userId: string | null, deviceId: string) {
  const input = `${userId ?? 'anon'}:${deviceId}:${getSecret()}`
  const hash = createHash('sha256').update(input).digest('hex')
  const slice = hash.slice(0, 12)
  const value = Number.parseInt(slice, 16)
  const base36 = value.toString(36).toUpperCase().padStart(CODE_LENGTH, '0')
  return `${CODE_PREFIX}${base36}`
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase()
}

async function ensureTable(event: H3Event) {
  if (tableReady)
    return
  const bindings = readCloudflareBindings(event)
  if (!bindings?.DB)
    return
  await bindings.DB.prepare(`
    CREATE TABLE IF NOT EXISTS watermark_tracking_codes (
      code TEXT PRIMARY KEY,
      user_id TEXT,
      device_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
  `).run()
  await bindings.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_tracking_user_device
    ON watermark_tracking_codes (user_id, device_id);
  `).run()
  tableReady = true
}

export async function getOrCreateTrackingCode(event: H3Event, userId: string | null, deviceId: string) {
  const now = Date.now()
  const bindings = readCloudflareBindings(event)
  if (bindings?.DB) {
    await ensureTable(event)
    const { results } = await bindings.DB.prepare(`
      SELECT code, user_id, device_id, created_at, last_seen_at
      FROM watermark_tracking_codes
      WHERE user_id IS ?1 AND device_id = ?2
      LIMIT 1;
    `).bind(userId, deviceId).all<{
      code: string
      user_id: string | null
      device_id: string
      created_at: number
      last_seen_at: number
    }>()
    const existing = results?.[0]
    if (existing) {
      await bindings.DB.prepare(`
        UPDATE watermark_tracking_codes
        SET last_seen_at = ?1
        WHERE code = ?2;
      `).bind(now, existing.code).run()
      return {
        code: existing.code,
        userId: existing.user_id ?? null,
        deviceId: existing.device_id,
        createdAt: Number(existing.created_at),
        lastSeenAt: now,
      }
    }

    const code = buildCode(userId, deviceId)
    await bindings.DB.prepare(`
      INSERT INTO watermark_tracking_codes (code, user_id, device_id, created_at, last_seen_at)
      VALUES (?1, ?2, ?3, ?4, ?5);
    `).bind(code, userId, deviceId, now, now).run()
    return { code, userId, deviceId, createdAt: now, lastSeenAt: now }
  }

  const key = `${userId ?? 'anon'}:${deviceId}`
  const cached = memoryByKey.get(key)
  if (cached) {
    cached.lastSeenAt = now
    return cached
  }
  const code = buildCode(userId, deviceId)
  const record: WatermarkTrackingRecord = { code, userId, deviceId, createdAt: now, lastSeenAt: now }
  memoryByKey.set(key, record)
  memoryByCode.set(code, record)
  return record
}

export async function findTrackingRecordByCode(event: H3Event, code: string) {
  const normalized = normalizeCode(code)
  const bindings = readCloudflareBindings(event)
  const now = Date.now()
  if (bindings?.DB) {
    await ensureTable(event)
    const { results } = await bindings.DB.prepare(`
      SELECT code, user_id, device_id, created_at, last_seen_at
      FROM watermark_tracking_codes
      WHERE code = ?1
      LIMIT 1;
    `).bind(normalized).all<{
      code: string
      user_id: string | null
      device_id: string
      created_at: number
      last_seen_at: number
    }>()
    const existing = results?.[0]
    if (!existing)
      return null
    await bindings.DB.prepare(`
      UPDATE watermark_tracking_codes
      SET last_seen_at = ?1
      WHERE code = ?2;
    `).bind(now, existing.code).run()
    return {
      code: existing.code,
      userId: existing.user_id ?? null,
      deviceId: existing.device_id,
      createdAt: Number(existing.created_at),
      lastSeenAt: now,
    }
  }

  const cached = memoryByCode.get(normalized)
  if (cached)
    cached.lastSeenAt = now
  return cached ?? null
}

export function normalizeTrackingCode(code: string) {
  return normalizeCode(code)
}
