import type { D1Database, R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { countActiveDevices, readDeviceId, upsertDevice, readDeviceMetadata } from './authStore'
import { generatePasswordSalt, hashPassword } from './authCrypto'

const SYNC_ITEMS_TABLE = 'sync_items_v1'
const SYNC_OPLOG_TABLE = 'sync_oplog_v1'
const SYNC_BLOBS_TABLE = 'sync_blobs_v1'
const SYNC_KEYRINGS_TABLE = 'sync_keyrings_v1'
const SYNC_QUOTAS_TABLE = 'sync_quotas_v1'
const SYNC_SESSIONS_TABLE = 'sync_sessions_v1'

const DEFAULT_QUOTAS = {
  storage_limit_bytes: 1024 * 1024 * 1024,
  object_limit: 50000,
  item_limit: 5 * 1024 * 1024,
  device_limit: 3,
}

const SYNC_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7

let syncSchemaInitialized = false

export type SyncErrorCode =
  | 'QUOTA_STORAGE_EXCEEDED'
  | 'QUOTA_OBJECT_EXCEEDED'
  | 'QUOTA_ITEM_EXCEEDED'
  | 'QUOTA_DEVICE_EXCEEDED'
  | 'SYNC_INVALID_CURSOR'
  | 'SYNC_INVALID_PAYLOAD'

export interface QuotaInfo {
  limits: {
    storage_limit_bytes: number
    object_limit: number
    item_limit: number
    device_limit: number
  }
  usage: {
    used_storage_bytes: number
    used_objects: number
    used_devices: number
  }
}

export interface SyncItemInput {
  item_id: string
  type: string
  schema_version: number
  payload_enc?: string | null
  payload_ref?: string | null
  meta_plain?: Record<string, unknown> | null
  payload_size?: number | null
  updated_at: string
  deleted_at?: string | null
  op_seq: number
  op_hash: string
  op_type: 'upsert' | 'delete'
}

export interface SyncConflictItem {
  item_id: string
  server_updated_at: string
  server_device_id: string | null
}

export interface SyncOplogItem {
  cursor: number
  item_id: string
  op_seq: number
  op_hash: string
  op_type: 'upsert' | 'delete'
  updated_at: string
  device_id: string
}

export interface SyncItemOutput {
  item_id: string
  type: string
  schema_version: number
  payload_enc: string | null
  payload_ref: string | null
  meta_plain: Record<string, unknown> | null
  payload_size: number | null
  updated_at: string
  deleted_at: string | null
  device_id: string | null
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

function getSyncBlobBucket(event?: H3Event | null): R2Bucket | null {
  if (!event)
    return null
  const bindings = readCloudflareBindings(event)
  return bindings?.R2 ?? bindings?.ASSETS ?? null
}

async function ensureSyncSchemaV1(db: D1Database) {
  if (syncSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SYNC_ITEMS_TABLE} (
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      payload_enc TEXT,
      payload_ref TEXT,
      meta_plain TEXT,
      payload_size INTEGER,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      updated_by_device_id TEXT,
      PRIMARY KEY (user_id, item_id)
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SYNC_OPLOG_TABLE} (
      cursor INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      op_seq INTEGER NOT NULL,
      op_hash TEXT NOT NULL,
      item_id TEXT NOT NULL,
      op_type TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload_size INTEGER
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SYNC_BLOBS_TABLE} (
      user_id TEXT NOT NULL,
      blob_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      content_type TEXT,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      PRIMARY KEY (user_id, blob_id)
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SYNC_KEYRINGS_TABLE} (
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      key_type TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      recovery_code_hash TEXT,
      rotated_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, device_id, key_type)
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SYNC_QUOTAS_TABLE} (
      user_id TEXT PRIMARY KEY,
      storage_limit_bytes INTEGER NOT NULL,
      object_limit INTEGER NOT NULL,
      item_limit INTEGER NOT NULL,
      device_limit INTEGER NOT NULL,
      used_storage_bytes INTEGER NOT NULL,
      used_objects INTEGER NOT NULL,
      used_devices INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SYNC_SESSIONS_TABLE} (
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      sync_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_cursor INTEGER NOT NULL,
      UNIQUE (user_id, device_id)
    );
  `).run()

  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_oplog_unique ON ${SYNC_OPLOG_TABLE}(user_id, device_id, op_seq);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sync_oplog_cursor ON ${SYNC_OPLOG_TABLE}(user_id, cursor);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sync_items_user_updated ON ${SYNC_ITEMS_TABLE}(user_id, updated_at);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sync_items_user_type ON ${SYNC_ITEMS_TABLE}(user_id, type);`).run()
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_blobs_object ON ${SYNC_BLOBS_TABLE}(user_id, object_key);`).run()

  syncSchemaInitialized = true
}

function normalizeUpdatedAt(value?: string | null) {
  return value && value.trim().length > 0 ? value : new Date().toISOString()
}

function isNewerUpdate(candidate: string, existing: string, candidateDeviceId: string, existingDeviceId: string | null) {
  if (candidate > existing)
    return true
  if (candidate < existing)
    return false
  if (!existingDeviceId)
    return true
  return candidateDeviceId > existingDeviceId
}

export async function getOrInitQuota(event: H3Event, userId: string): Promise<QuotaInfo> {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const deviceCount = await countActiveDevices(event, userId)
  const row = await db.prepare(`SELECT * FROM ${SYNC_QUOTAS_TABLE} WHERE user_id = ?`).bind(userId).first()
  if (row) {
    const usage = {
      used_storage_bytes: Number(row.used_storage_bytes ?? 0),
      used_objects: Number(row.used_objects ?? 0),
      used_devices: deviceCount,
    }
    if (usage.used_devices !== Number(row.used_devices ?? 0)) {
      await db.prepare(`
        UPDATE ${SYNC_QUOTAS_TABLE}
        SET used_devices = ?, updated_at = ?
        WHERE user_id = ?
      `).bind(usage.used_devices, new Date().toISOString(), userId).run()
    }
    return {
      limits: {
        storage_limit_bytes: Number(row.storage_limit_bytes ?? DEFAULT_QUOTAS.storage_limit_bytes),
        object_limit: Number(row.object_limit ?? DEFAULT_QUOTAS.object_limit),
        item_limit: Number(row.item_limit ?? DEFAULT_QUOTAS.item_limit),
        device_limit: Number(row.device_limit ?? DEFAULT_QUOTAS.device_limit),
      },
      usage,
    }
  }

  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO ${SYNC_QUOTAS_TABLE}
    (user_id, storage_limit_bytes, object_limit, item_limit, device_limit, used_storage_bytes, used_objects, used_devices, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    DEFAULT_QUOTAS.storage_limit_bytes,
    DEFAULT_QUOTAS.object_limit,
    DEFAULT_QUOTAS.item_limit,
    DEFAULT_QUOTAS.device_limit,
    0,
    0,
    deviceCount,
    now,
  ).run()

  return {
    limits: { ...DEFAULT_QUOTAS },
    usage: {
      used_storage_bytes: 0,
      used_objects: 0,
      used_devices: deviceCount,
    },
  }
}

export async function validateQuota(event: H3Event, userId: string, payload: { storageDelta: number, objectsDelta: number, itemSize?: number | null }) {
  const quota = await getOrInitQuota(event, userId)
  if (payload.itemSize && payload.itemSize > quota.limits.item_limit) {
    return { ok: false, code: 'QUOTA_ITEM_EXCEEDED' as SyncErrorCode, quota }
  }
  if (quota.usage.used_devices > quota.limits.device_limit) {
    return { ok: false, code: 'QUOTA_DEVICE_EXCEEDED' as SyncErrorCode, quota }
  }
  if (quota.usage.used_storage_bytes + payload.storageDelta > quota.limits.storage_limit_bytes) {
    return { ok: false, code: 'QUOTA_STORAGE_EXCEEDED' as SyncErrorCode, quota }
  }
  if (quota.usage.used_objects + payload.objectsDelta > quota.limits.object_limit) {
    return { ok: false, code: 'QUOTA_OBJECT_EXCEEDED' as SyncErrorCode, quota }
  }
  return { ok: true, code: null as SyncErrorCode | null, quota }
}

export async function applyQuotaDelta(event: H3Event, userId: string, payload: { storageDelta: number, objectsDelta: number }) {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  await db.prepare(`
    UPDATE ${SYNC_QUOTAS_TABLE}
    SET used_storage_bytes = used_storage_bytes + ?,
        used_objects = used_objects + ?,
        updated_at = ?
    WHERE user_id = ?
  `).bind(payload.storageDelta, payload.objectsDelta, new Date().toISOString(), userId).run()
}

export async function handshakeSyncSession(event: H3Event, userId: string, deviceId: string) {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const now = new Date().toISOString()
  const syncToken = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + SYNC_TOKEN_TTL_MS).toISOString()
  const cursorRow = await db.prepare(`SELECT MAX(cursor) AS cursor FROM ${SYNC_OPLOG_TABLE} WHERE user_id = ?`).bind(userId).first()
  const serverCursor = Number(cursorRow?.cursor ?? 0)

  await db.prepare(`
    INSERT INTO ${SYNC_SESSIONS_TABLE} (user_id, device_id, sync_token, expires_at, last_cursor)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, device_id) DO UPDATE SET
      sync_token = excluded.sync_token,
      expires_at = excluded.expires_at,
      last_cursor = excluded.last_cursor
  `).bind(userId, deviceId, syncToken, expiresAt, serverCursor).run()

  return { syncToken, serverCursor, expiresAt }
}

export async function pushSyncItemsV1(event: H3Event, userId: string, deviceId: string, items: SyncItemInput[]) {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const conflicts: SyncConflictItem[] = []
  let appliedStorageDelta = 0
  let appliedObjectsDelta = 0

  for (const item of items) {
    if (!item?.item_id || !item?.op_hash || !item?.op_seq || !item?.updated_at || !item?.type) {
      return { errorCode: 'SYNC_INVALID_PAYLOAD' as SyncErrorCode, conflicts, ackCursor: await getServerCursor(db, userId), appliedStorageDelta: 0, appliedObjectsDelta: 0 }
    }

    const updatedAt = normalizeUpdatedAt(item.updated_at)
    const payloadSize = Number(item.payload_size ?? 0)

    const oplogResult = await db.prepare(`
      INSERT OR IGNORE INTO ${SYNC_OPLOG_TABLE} (user_id, device_id, op_seq, op_hash, item_id, op_type, updated_at, payload_size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(userId, deviceId, item.op_seq, item.op_hash, item.item_id, item.op_type, updatedAt, payloadSize).run()

    if (!oplogResult?.meta?.changes)
      continue

    const existing = await db.prepare(`
      SELECT updated_at, updated_by_device_id FROM ${SYNC_ITEMS_TABLE}
      WHERE user_id = ? AND item_id = ?
    `).bind(userId, item.item_id).first<{ updated_at: string, updated_by_device_id: string | null }>()

    const shouldApply = !existing || isNewerUpdate(updatedAt, existing.updated_at, deviceId, existing.updated_by_device_id)
    if (!shouldApply) {
      conflicts.push({
        item_id: item.item_id,
        server_updated_at: existing.updated_at,
        server_device_id: existing.updated_by_device_id ?? null,
      })
      continue
    }

    const deletedAt = item.op_type === 'delete' ? (item.deleted_at ?? updatedAt) : (item.deleted_at ?? null)
    const metaPlain = item.meta_plain ? JSON.stringify(item.meta_plain) : null

    await db.prepare(`
      INSERT INTO ${SYNC_ITEMS_TABLE} (
        user_id, item_id, type, schema_version, payload_enc, payload_ref, meta_plain, payload_size,
        updated_at, deleted_at, updated_by_device_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, item_id) DO UPDATE SET
        type = excluded.type,
        schema_version = excluded.schema_version,
        payload_enc = excluded.payload_enc,
        payload_ref = excluded.payload_ref,
        meta_plain = excluded.meta_plain,
        payload_size = excluded.payload_size,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        updated_by_device_id = excluded.updated_by_device_id
      WHERE excluded.updated_at > ${SYNC_ITEMS_TABLE}.updated_at
        OR (excluded.updated_at = ${SYNC_ITEMS_TABLE}.updated_at AND excluded.updated_by_device_id > ${SYNC_ITEMS_TABLE}.updated_by_device_id)
    `).bind(
      userId,
      item.item_id,
      item.type,
      item.schema_version,
      item.payload_enc ?? null,
      item.payload_ref ?? null,
      metaPlain,
      payloadSize || null,
      updatedAt,
      deletedAt,
      deviceId,
    ).run()

    if (item.op_type !== 'delete') {
      appliedStorageDelta += payloadSize
      appliedObjectsDelta += 1
    }
  }

  const ackCursor = await getServerCursor(db, userId)
  return { conflicts, ackCursor, appliedStorageDelta, appliedObjectsDelta }
}

async function getServerCursor(db: D1Database, userId: string) {
  const row = await db.prepare(`SELECT MAX(cursor) AS cursor FROM ${SYNC_OPLOG_TABLE} WHERE user_id = ?`).bind(userId).first()
  return Number(row?.cursor ?? 0)
}

export async function pullSyncItemsV1(event: H3Event, userId: string, cursor: number, limit: number) {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const safeLimit = Math.min(Math.max(limit, 1), 200)
  const oplogResult = await db.prepare(`
    SELECT cursor, item_id, op_seq, op_hash, op_type, updated_at, device_id
    FROM ${SYNC_OPLOG_TABLE}
    WHERE user_id = ? AND cursor > ?
    ORDER BY cursor ASC
    LIMIT ?
  `).bind(userId, cursor, safeLimit).all()

  const oplog = (oplogResult.results || []).map(row => ({
    cursor: Number(row.cursor),
    item_id: row.item_id as string,
    op_seq: Number(row.op_seq),
    op_hash: row.op_hash as string,
    op_type: row.op_type as 'upsert' | 'delete',
    updated_at: row.updated_at as string,
    device_id: row.device_id as string,
  })) as SyncOplogItem[]

  const itemIds = [...new Set(oplog.map(item => item.item_id))]
  let items: SyncItemOutput[] = []
  if (itemIds.length > 0) {
    const placeholders = itemIds.map(() => '?').join(', ')
    const result = await db.prepare(`
      SELECT * FROM ${SYNC_ITEMS_TABLE}
      WHERE user_id = ? AND item_id IN (${placeholders})
    `).bind(userId, ...itemIds).all()
    items = (result.results || []).map(row => ({
      item_id: row.item_id as string,
      type: row.type as string,
      schema_version: Number(row.schema_version),
      payload_enc: row.payload_enc as string | null,
      payload_ref: row.payload_ref as string | null,
      meta_plain: row.meta_plain ? JSON.parse(row.meta_plain as string) : null,
      payload_size: row.payload_size ? Number(row.payload_size) : null,
      updated_at: row.updated_at as string,
      deleted_at: row.deleted_at as string | null,
      device_id: row.updated_by_device_id as string | null,
    }))
  }

  const lastOplog = oplog.at(-1)
  const nextCursor = lastOplog ? lastOplog.cursor : cursor
  await db.prepare(`
    UPDATE ${SYNC_SESSIONS_TABLE}
    SET last_cursor = ?
    WHERE user_id = ? AND device_id = ?
  `).bind(nextCursor, userId, readDeviceId(event) ?? '').run()

  return { items, oplog, nextCursor }
}

export async function uploadSyncBlob(event: H3Event, userId: string, file: File) {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const bucket = getSyncBlobBucket(event)
  if (!bucket)
    throw new Error('R2 bucket is not available.')

  const arrayBuffer = await file.arrayBuffer()
  const sizeBytes = Number(file.size || arrayBuffer.byteLength)
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  const sha256 = Array.from(new Uint8Array(hashBuffer)).map(byte => byte.toString(16).padStart(2, '0')).join('')

  const blobId = crypto.randomUUID()
  const objectKey = `${userId}/${blobId}`
  await bucket.put(objectKey, new Uint8Array(arrayBuffer), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
    },
  })

  await db.prepare(`
    INSERT INTO ${SYNC_BLOBS_TABLE} (user_id, blob_id, object_key, sha256, size_bytes, content_type, created_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    blobId,
    objectKey,
    sha256,
    sizeBytes,
    file.type || 'application/octet-stream',
    new Date().toISOString(),
    'ready',
  ).run()

  return { blobId, objectKey, sha256, sizeBytes }
}

export async function registerKey(event: H3Event, userId: string, deviceId: string, payload: { keyType: string, encryptedKey: string, recoveryCodeHash?: string | null }) {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const now = new Date().toISOString()
  const recoveryCodeHash = await maybeHashRecoveryCode(payload.recoveryCodeHash)
  await db.prepare(`
    INSERT INTO ${SYNC_KEYRINGS_TABLE} (user_id, device_id, key_type, encrypted_key, recovery_code_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, device_id, key_type) DO UPDATE SET
      encrypted_key = excluded.encrypted_key,
      recovery_code_hash = COALESCE(excluded.recovery_code_hash, ${SYNC_KEYRINGS_TABLE}.recovery_code_hash),
      created_at = excluded.created_at
  `).bind(userId, deviceId, payload.keyType, payload.encryptedKey, recoveryCodeHash, now).run()

  return { keyringId: `${userId}:${deviceId}:${payload.keyType}` }
}

export async function rotateKey(event: H3Event, userId: string, deviceId: string, payload: { keyType: string, encryptedKey: string }) {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const rotatedAt = new Date().toISOString()
  await db.prepare(`
    INSERT INTO ${SYNC_KEYRINGS_TABLE} (user_id, device_id, key_type, encrypted_key, rotated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, device_id, key_type) DO UPDATE SET
      encrypted_key = excluded.encrypted_key,
      rotated_at = excluded.rotated_at
  `).bind(userId, deviceId, payload.keyType, payload.encryptedKey, rotatedAt, rotatedAt).run()

  return { rotatedAt }
}

async function maybeHashRecoveryCode(recoveryCodeHash?: string | null) {
  if (!recoveryCodeHash)
    return null
  const salt = generatePasswordSalt()
  const hash = await hashPassword(recoveryCodeHash, salt)
  return `${hash}:${salt}`
}

export async function ensureDeviceForSync(event: H3Event, userId: string) {
  const deviceId = readDeviceId(event)
  if (!deviceId)
    return null
  return upsertDevice(event, userId, deviceId, readDeviceMetadata(event))
}
