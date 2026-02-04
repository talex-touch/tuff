import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const SYNC_TABLE = 'sync_items'
let syncSchemaInitialized = false

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

async function ensureSyncSchema(db: D1Database) {
  if (syncSchemaInitialized)
    return
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SYNC_TABLE} (
      user_id TEXT NOT NULL,
      namespace TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by_device_id TEXT,
      PRIMARY KEY (user_id, namespace, key)
    );
  `).run()
  syncSchemaInitialized = true
}

export interface SyncItemPayload {
  namespace: string
  key: string
  value: any
  updatedAt?: string
  deviceId?: string | null
}

export async function pullSyncItems(event: H3Event, userId: string, since?: string | null) {
  const db = requireDatabase(event)
  await ensureSyncSchema(db)
  if (since) {
    const result = await db.prepare(`
      SELECT * FROM ${SYNC_TABLE}
      WHERE user_id = ? AND updated_at > ?
      ORDER BY updated_at ASC
    `).bind(userId, since).all()
    return result.results.map(row => ({
      namespace: row.namespace,
      key: row.key,
      value: JSON.parse(row.value_json as string),
      updatedAt: row.updated_at,
      deviceId: row.updated_by_device_id
    }))
  }
  const result = await db.prepare(`
    SELECT * FROM ${SYNC_TABLE}
    WHERE user_id = ?
    ORDER BY updated_at ASC
  `).bind(userId).all()
  return result.results.map(row => ({
    namespace: row.namespace,
    key: row.key,
    value: JSON.parse(row.value_json as string),
    updatedAt: row.updated_at,
    deviceId: row.updated_by_device_id
  }))
}

export async function pushSyncItems(event: H3Event, userId: string, items: SyncItemPayload[]) {
  const db = requireDatabase(event)
  await ensureSyncSchema(db)
  const now = new Date().toISOString()
  const statements = items.map(item => {
    const updatedAt = item.updatedAt ?? now
    const payload = JSON.stringify(item.value ?? null)
    return db.prepare(`
      INSERT INTO ${SYNC_TABLE} (user_id, namespace, key, value_json, updated_at, updated_by_device_id)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, namespace, key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at,
        updated_by_device_id = excluded.updated_by_device_id
      WHERE excluded.updated_at > ${SYNC_TABLE}.updated_at
    `).bind(userId, item.namespace, item.key, payload, updatedAt, item.deviceId ?? null)
  })
  if (statements.length === 0)
    return
  await db.batch(statements)
}

