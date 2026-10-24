import type { D1Database, D1PreparedStatement, R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { readCloudflareBindings, resolveObjectBucket } from './cloudflare'
import { getDevice, prepareActiveDeviceCount, readDeviceId, readDeviceMetadata, touchDevice } from './authStore'
import { generatePasswordSalt, hashPassword, verifyPassword } from './authCrypto'
import { createSyncError } from './syncErrors'
import type { SubscriptionPlan } from './subscriptionStore'
import { getUserSubscription } from './subscriptionStore'
import { deleteStorageObject, putStorageObject, type StorageObjectMemory } from './storageObjectStore'
import { defineD1Schema, ensureD1Schema } from './d1Schema'

const SYNC_ITEMS_TABLE = 'sync_items_v1'
const SYNC_OPLOG_TABLE = 'sync_oplog_v1'
const SYNC_BLOBS_TABLE = 'sync_blobs_v1'
const SYNC_KEYRINGS_TABLE = 'sync_keyrings_v1'
const SYNC_QUOTAS_TABLE = 'sync_quotas_v1'
const SYNC_BLOB_CHUNKS_TABLE = 'sync_blob_chunks_v1'
const SYNC_BLOB_CHUNK_REFS_TABLE = 'sync_blob_chunk_refs_v1'
const SYNC_BLOB_UPLOAD_SESSIONS_TABLE = 'sync_blob_upload_sessions_v1'
const SYNC_BLOB_UPLOAD_REFS_TABLE = 'sync_blob_upload_refs_v1'
const SYNC_SESSIONS_TABLE = 'sync_sessions_v1'

const DEFAULT_QUOTAS = {
  storage_limit_bytes: 1024 * 1024 * 1024,
  object_limit: 50000,
  item_limit: 5 * 1024 * 1024,
  device_limit: 3,
}

const PLAN_STORAGE_LIMITS_BYTES: Record<SubscriptionPlan, number> = {
  FREE: 1 * 1024 * 1024,
  PRO: 100 * 1024 * 1024,
  PLUS: 1024 * 1024 * 1024,
  TEAM: 5 * 1024 * 1024 * 1024,
  ENTERPRISE: 20 * 1024 * 1024 * 1024,
}

function resolveQuotaLimits(plan: SubscriptionPlan) {
  const storageLimitBytes = PLAN_STORAGE_LIMITS_BYTES[plan] ?? DEFAULT_QUOTAS.storage_limit_bytes
  return {
    storage_limit_bytes: storageLimitBytes,
    object_limit: DEFAULT_QUOTAS.object_limit,
    item_limit: Math.min(DEFAULT_QUOTAS.item_limit, storageLimitBytes),
    device_limit: DEFAULT_QUOTAS.device_limit,
  }
}

const SYNC_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7
const syncBlobMemoryStorage: StorageObjectMemory = new Map()

export type SyncErrorCode =
  | 'QUOTA_STORAGE_EXCEEDED'
  | 'QUOTA_OBJECT_EXCEEDED'
  | 'QUOTA_ITEM_EXCEEDED'
  | 'QUOTA_DEVICE_EXCEEDED'
  | 'SYNC_INVALID_CURSOR'
  | 'SYNC_INVALID_PAYLOAD'
  | 'SYNC_INVALID_TOKEN'
  | 'SYNC_TOKEN_EXPIRED'
  | 'DEVICE_NOT_AUTHORIZED'

export interface QuotaInfo {
  plan_tier: SubscriptionPlan
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
  return resolveObjectBucket(event)
}

/**
 * `sync_sessions_v1` predates its `last_*` columns. They used to be added by three ALTERs that ran on
 * every cold isolate and failed with "duplicate column" on every database that already had them.
 */
const SYNC_SCHEMA_V1 = defineD1Schema('sync-v1', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${SYNC_ITEMS_TABLE} (
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
      )`,
    `CREATE TABLE IF NOT EXISTS ${SYNC_OPLOG_TABLE} (
        cursor INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        op_seq INTEGER NOT NULL,
        op_hash TEXT NOT NULL,
        item_id TEXT NOT NULL,
        op_type TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload_size INTEGER
      )`,
    `CREATE TABLE IF NOT EXISTS ${SYNC_BLOBS_TABLE} (
        user_id TEXT NOT NULL,
        blob_id TEXT NOT NULL,
        object_key TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        content_type TEXT,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (user_id, blob_id)
      )`,
    `CREATE TABLE IF NOT EXISTS ${SYNC_BLOB_CHUNKS_TABLE} (
        user_id TEXT NOT NULL,
        chunk_id TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        object_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (user_id, chunk_id),
        UNIQUE (user_id, sha256, size_bytes)
      )`,
    `CREATE TABLE IF NOT EXISTS ${SYNC_BLOB_CHUNK_REFS_TABLE} (
        user_id TEXT NOT NULL,
        blob_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_id TEXT NOT NULL,
        PRIMARY KEY (user_id, blob_id, chunk_index)
      )`,
    `CREATE TABLE IF NOT EXISTS ${SYNC_BLOB_UPLOAD_SESSIONS_TABLE} (
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        logical_version TEXT NOT NULL,
        payload_sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        chunk_size INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, session_id),
        UNIQUE (user_id, item_id, logical_version, payload_sha256)
      )`,
    `CREATE TABLE IF NOT EXISTS ${SYNC_BLOB_UPLOAD_REFS_TABLE} (
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_id TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        PRIMARY KEY (user_id, session_id, chunk_index)
      )`,
    `CREATE TABLE IF NOT EXISTS ${SYNC_KEYRINGS_TABLE} (
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        key_type TEXT NOT NULL,
        encrypted_key TEXT NOT NULL,
        recovery_code_hash TEXT,
        rotated_at TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (user_id, device_id, key_type)
      )`,
    `CREATE TABLE IF NOT EXISTS ${SYNC_QUOTAS_TABLE} (
        user_id TEXT PRIMARY KEY,
        storage_limit_bytes INTEGER NOT NULL,
        object_limit INTEGER NOT NULL,
        item_limit INTEGER NOT NULL,
        device_limit INTEGER NOT NULL,
        used_storage_bytes INTEGER NOT NULL,
        used_objects INTEGER NOT NULL,
        used_devices INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    `CREATE TABLE IF NOT EXISTS ${SYNC_SESSIONS_TABLE} (
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        sync_token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_cursor INTEGER NOT NULL,
        last_push_at TEXT,
        last_pull_at TEXT,
        last_error_code TEXT,
        UNIQUE (user_id, device_id)
      )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_oplog_unique ON ${SYNC_OPLOG_TABLE}(user_id, device_id, op_seq)`,
    `CREATE INDEX IF NOT EXISTS idx_sync_oplog_cursor ON ${SYNC_OPLOG_TABLE}(user_id, cursor)`,
    `CREATE INDEX IF NOT EXISTS idx_sync_items_user_updated ON ${SYNC_ITEMS_TABLE}(user_id, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_sync_items_user_type ON ${SYNC_ITEMS_TABLE}(user_id, type)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_blobs_object ON ${SYNC_BLOBS_TABLE}(user_id, object_key)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_blobs_logical ON ${SYNC_BLOBS_TABLE}(user_id, item_id, logical_version) WHERE item_id IS NOT NULL AND logical_version IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_sync_blob_chunks_lookup ON ${SYNC_BLOB_CHUNKS_TABLE}(user_id, sha256, size_bytes, status)`,
    `CREATE INDEX IF NOT EXISTS idx_sync_blob_chunk_refs_chunk ON ${SYNC_BLOB_CHUNK_REFS_TABLE}(user_id, chunk_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sync_blob_upload_refs_session ON ${SYNC_BLOB_UPLOAD_REFS_TABLE}(user_id, session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sync_blob_upload_sessions_created ON ${SYNC_BLOB_UPLOAD_SESSIONS_TABLE}(user_id, created_at)`
  ],
  columns: [
    {
      table: SYNC_SESSIONS_TABLE,
      columns: [
        { name: 'last_push_at', ddl: 'last_push_at TEXT' },
        { name: 'last_pull_at', ddl: 'last_pull_at TEXT' },
        { name: 'last_error_code', ddl: 'last_error_code TEXT' },
      ],
    },
    {
      table: SYNC_BLOBS_TABLE,
      columns: [
        { name: 'item_id', ddl: 'item_id TEXT' },
        { name: 'logical_version', ddl: 'logical_version TEXT' },
        { name: 'last_referenced_at', ddl: 'last_referenced_at TEXT' },
      ],
    },
  ],
})

async function ensureSyncSchemaV1(db: D1Database) {
  await ensureD1Schema(db, SYNC_SCHEMA_V1)
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
  // The plan beside one batch of the device count and the quota row; they were three reads in a row.
  const [subscription, [deviceResult, quotaResult]] = await Promise.all([
    getUserSubscription(event, userId),
    db.batch([
      prepareActiveDeviceCount(db, userId),
      db.prepare(`SELECT * FROM ${SYNC_QUOTAS_TABLE} WHERE user_id = ?`).bind(userId),
    ]),
  ])
  const plan = subscription.plan
  const limits = resolveQuotaLimits(plan)
  const deviceCount = Number((deviceResult?.results?.[0] as { total?: number } | undefined)?.total ?? 0)
  const row = (quotaResult?.results?.[0] ?? null) as Record<string, unknown> | null
  if (row) {
    const usage = {
      used_storage_bytes: Number(row.used_storage_bytes ?? 0),
      used_objects: Number(row.used_objects ?? 0),
      used_devices: deviceCount,
    }
    const storedLimits = {
      storage_limit_bytes: Number(row.storage_limit_bytes ?? DEFAULT_QUOTAS.storage_limit_bytes),
      object_limit: Number(row.object_limit ?? DEFAULT_QUOTAS.object_limit),
      item_limit: Number(row.item_limit ?? DEFAULT_QUOTAS.item_limit),
      device_limit: Number(row.device_limit ?? DEFAULT_QUOTAS.device_limit),
    }

    const shouldUpdateUsage = usage.used_devices !== Number(row.used_devices ?? 0)
    const shouldUpdateLimits = Object.keys(limits).some((key) => {
      const k = key as keyof typeof limits
      return limits[k] !== storedLimits[k]
    })

    if (shouldUpdateUsage || shouldUpdateLimits) {
      await db.prepare(`
        UPDATE ${SYNC_QUOTAS_TABLE}
        SET storage_limit_bytes = ?, object_limit = ?, item_limit = ?, device_limit = ?,
            used_devices = ?, updated_at = ?
        WHERE user_id = ?
      `).bind(
        limits.storage_limit_bytes,
        limits.object_limit,
        limits.item_limit,
        limits.device_limit,
        usage.used_devices,
        new Date().toISOString(),
        userId,
      ).run()
    }
    return {
      plan_tier: plan,
      limits,
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
    limits.storage_limit_bytes,
    limits.object_limit,
    limits.item_limit,
    limits.device_limit,
    0,
    0,
    deviceCount,
    now,
  ).run()

  return {
    plan_tier: plan,
    limits,
    usage: {
      used_storage_bytes: 0,
      used_objects: 0,
      used_devices: deviceCount,
    },
  }
}

/**
 * Checks a planned change against the user's quota. `knownQuota` is a quota the caller has already
 * read in this request; without it the quota is read here.
 */
export async function validateQuota(
  event: H3Event,
  userId: string,
  payload: { storageDelta: number, objectsDelta: number, itemSize?: number | null },
  knownQuota?: QuotaInfo,
) {
  const quota = knownQuota ?? await getOrInitQuota(event, userId)
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
    SET used_storage_bytes = CASE
          WHEN used_storage_bytes + ? < 0 THEN 0
          ELSE used_storage_bytes + ?
        END,
        used_objects = CASE
          WHEN used_objects + ? < 0 THEN 0
          ELSE used_objects + ?
        END,
        updated_at = ?
    WHERE user_id = ?
  `).bind(
    payload.storageDelta,
    payload.storageDelta,
    payload.objectsDelta,
    payload.objectsDelta,
    new Date().toISOString(),
    userId,
  ).run()
}

export async function handshakeSyncSession(event: H3Event, userId: string, deviceId: string) {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const now = new Date().toISOString()
  const syncToken = randomUUID()
  const expiresAt = new Date(Date.now() + SYNC_TOKEN_TTL_MS).toISOString()
  // The server cursor is read by the statement that stores it; they were two round trips.
  const row = await db.prepare(`
    INSERT INTO ${SYNC_SESSIONS_TABLE} (user_id, device_id, sync_token, expires_at, last_cursor)
    SELECT ?1, ?2, ?3, ?4, COALESCE(MAX(cursor), 0) FROM ${SYNC_OPLOG_TABLE} WHERE user_id = ?1
    ON CONFLICT(user_id, device_id) DO UPDATE SET
      sync_token = excluded.sync_token,
      expires_at = excluded.expires_at,
      last_cursor = excluded.last_cursor
    RETURNING last_cursor
  `).bind(userId, deviceId, syncToken, expiresAt).first<{ last_cursor: number }>()
  const serverCursor = Number(row?.last_cursor ?? 0)

  return { syncToken, serverCursor, expiresAt }
}

export async function getSyncSession(event: H3Event, userId: string, deviceId: string, syncToken: string) {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const row = await db.prepare(`
    SELECT sync_token, expires_at
    FROM ${SYNC_SESSIONS_TABLE}
    WHERE user_id = ? AND device_id = ?
  `).bind(userId, deviceId).first<{ sync_token: string, expires_at: string }>()

  if (!row || row.sync_token !== syncToken) {
    throw createSyncError('SYNC_INVALID_TOKEN', 400, 'Sync token invalid')
  }

  const expiresAt = new Date(row.expires_at).getTime()
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw createSyncError('SYNC_TOKEN_EXPIRED', 400, 'Sync token expired')
  }

  return { syncToken: row.sync_token, expiresAt: row.expires_at }
}

async function updateSyncSessionState(
  db: D1Database,
  userId: string,
  deviceId: string,
  payload: {
    lastCursor?: number
    lastPushAt?: string | null
    lastPullAt?: string | null
    lastErrorCode?: string | null
  }
): Promise<void> {
  await ensureSyncSchemaV1(db)
  const statements: Promise<unknown>[] = []

  if (typeof payload.lastCursor === 'number' && Number.isFinite(payload.lastCursor)) {
    statements.push(
      db.prepare(`
        UPDATE ${SYNC_SESSIONS_TABLE}
        SET last_cursor = ?
        WHERE user_id = ? AND device_id = ?
      `).bind(Math.max(0, Math.floor(payload.lastCursor)), userId, deviceId).run()
    )
  }

  if (payload.lastPushAt !== undefined) {
    statements.push(
      db.prepare(`
        UPDATE ${SYNC_SESSIONS_TABLE}
        SET last_push_at = ?, last_error_code = ?
        WHERE user_id = ? AND device_id = ?
      `).bind(payload.lastPushAt, payload.lastErrorCode ?? null, userId, deviceId).run()
    )
  }

  if (payload.lastPullAt !== undefined) {
    statements.push(
      db.prepare(`
        UPDATE ${SYNC_SESSIONS_TABLE}
        SET last_pull_at = ?, last_error_code = ?
        WHERE user_id = ? AND device_id = ?
      `).bind(payload.lastPullAt, payload.lastErrorCode ?? null, userId, deviceId).run()
    )
  } else if (payload.lastErrorCode !== undefined && payload.lastPushAt === undefined) {
    statements.push(
      db.prepare(`
        UPDATE ${SYNC_SESSIONS_TABLE}
        SET last_error_code = ?
        WHERE user_id = ? AND device_id = ?
      `).bind(payload.lastErrorCode ?? null, userId, deviceId).run()
    )
  }

  if (!statements.length) {
    return
  }
  await Promise.all(statements)
}

export async function markSyncSessionError(
  event: H3Event,
  userId: string,
  deviceId: string,
  errorCode: string
): Promise<void> {
  const db = requireDatabase(event)
  await updateSyncSessionState(db, userId, deviceId, { lastErrorCode: errorCode || null })
}

// Keep every JSON binding well below D1's 2 MB value limit.
// Paid D1 permits 1,000 queries per invocation; reserve 100 for schema/quota/session work.
const SYNC_PUSH_JSON_CHUNK_BYTES = 512 * 1024
const SYNC_PUSH_D1_QUERY_BUDGET = 900

interface ExistingSyncItemRow {
  item_id: string
  updated_at: string
  updated_by_device_id: string | null
  payload_size: number | null
  deleted_at: string | null
}

interface SyncUsageRow {
  used_storage_bytes: number
  used_objects: number
}

interface NormalizedSyncPushItem {
  item: SyncItemInput
  updatedAt: string
  rawPayloadSize: number | null
}

interface SyncWriteCandidate {
  item: SyncItemInput
  updatedAt: string
  payloadSize: number
  existing: ExistingSyncItemRow | null
}

interface SyncWriteRow {
  itemId: string
  type: string
  schemaVersion: number
  payloadEnc: string | null
  payloadRef: string | null
  metaPlain: string | null
  payloadSize: number
  updatedAt: string
  deletedAt: string | null
  opSeq: number
  opHash: string
  opType: 'upsert' | 'delete'
}

function serializeJsonChunks<T>(values: T[]): string[] {
  if (!values.length)
    return []

  const chunks: string[] = []
  let rows: string[] = []
  let chunkBytes = 2

  const flush = () => {
    if (!rows.length)
      return
    chunks.push(`[${rows.join(',')}]`)
    rows = []
    chunkBytes = 2
  }

  for (const value of values) {
    const row = JSON.stringify(value)
    const separatorBytes = rows.length ? 1 : 0
    const rowBytes = Buffer.byteLength(row, 'utf8')
    if (rows.length && chunkBytes + separatorBytes + rowBytes > SYNC_PUSH_JSON_CHUNK_BYTES)
      flush()
    rows.push(row)
    chunkBytes += (rows.length > 1 ? 1 : 0) + rowBytes
  }
  flush()
  return chunks
}

function readD1ResultRows<T>(result: unknown): T[] {
  if (!result || typeof result !== 'object' || !('results' in result))
    return []
  const rows = (result as { results?: unknown }).results
  return Array.isArray(rows) ? rows as T[] : []
}

async function preloadSyncPushState(
  db: D1Database,
  userId: string,
  deviceId: string,
  items: NormalizedSyncPushItem[]
): Promise<{
  existingItems: Map<string, ExistingSyncItemRow>
  existingOpSeqs: Set<number>
  usage: SyncUsageRow
  queryCount: number
}> {
  const itemIdChunks = serializeJsonChunks(Array.from(new Set(items.map(({ item }) => item.item_id))))
  const opSeqChunks = serializeJsonChunks(Array.from(new Set(items.map(({ item }) => item.op_seq))))
  const itemStatements = itemIdChunks.map(chunk => db.prepare(`
    SELECT item_id, updated_at, updated_by_device_id, payload_size, deleted_at
    FROM ${SYNC_ITEMS_TABLE}
    WHERE user_id = ?2
      AND item_id IN (SELECT CAST(value AS TEXT) FROM json_each(?1))
  `).bind(chunk, userId))
  const oplogStatements = opSeqChunks.map(chunk => db.prepare(`
    SELECT op_seq
    FROM ${SYNC_OPLOG_TABLE}
    WHERE user_id = ?2
      AND device_id = ?3
      AND op_seq IN (SELECT CAST(value AS INTEGER) FROM json_each(?1))
  `).bind(chunk, userId, deviceId))
  const usageStatement = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN deleted_at IS NULL THEN COALESCE(payload_size, 0) ELSE 0 END), 0) AS used_storage_bytes,
      COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) AS used_objects
    FROM ${SYNC_ITEMS_TABLE}
    WHERE user_id = ?
  `).bind(userId)
  const statements = [...itemStatements, ...oplogStatements, usageStatement]

  if (statements.length >= SYNC_PUSH_D1_QUERY_BUDGET) {
    return {
      existingItems: new Map(),
      existingOpSeqs: new Set(),
      usage: { used_storage_bytes: 0, used_objects: 0 },
      queryCount: statements.length,
    }
  }

  const results = await db.batch(statements)
  const existingItems = new Map<string, ExistingSyncItemRow>()
  const existingOpSeqs = new Set<number>()

  for (const result of results.slice(0, itemStatements.length)) {
    for (const row of readD1ResultRows<ExistingSyncItemRow>(result))
      existingItems.set(String(row.item_id), row)
  }

  const oplogOffset = itemStatements.length
  for (const result of results.slice(oplogOffset, oplogOffset + oplogStatements.length)) {
    for (const row of readD1ResultRows<{ op_seq: number }>(result))
      existingOpSeqs.add(Number(row.op_seq))
  }

  const usageRows = readD1ResultRows<SyncUsageRow>(results.at(-1))
  const usage = usageRows[0] ?? { used_storage_bytes: 0, used_objects: 0 }
  return {
    existingItems,
    existingOpSeqs,
    usage: {
      used_storage_bytes: Number(usage.used_storage_bytes ?? 0),
      used_objects: Number(usage.used_objects ?? 0),
    },
    queryCount: statements.length,
  }
}

function toSyncWriteRow(candidate: SyncWriteCandidate): SyncWriteRow {
  const { item, updatedAt, payloadSize, existing } = candidate
  const existingPayloadSize = Number(existing?.payload_size ?? 0)
  return {
    itemId: item.item_id,
    type: item.type,
    schemaVersion: item.schema_version,
    payloadEnc: item.payload_enc ?? null,
    payloadRef: item.payload_ref ?? null,
    metaPlain: item.meta_plain ? JSON.stringify(item.meta_plain) : null,
    payloadSize: item.op_type === 'delete' ? existingPayloadSize : payloadSize,
    updatedAt,
    deletedAt: item.op_type === 'delete' ? (item.deleted_at ?? updatedAt) : (item.deleted_at ?? null),
    opSeq: item.op_seq,
    opHash: item.op_hash,
    opType: item.op_type,
  }
}

function buildSyncOplogWriteStatement(
  db: D1Database,
  jsonRows: string,
  userId: string,
  deviceId: string
): D1PreparedStatement {
  return db.prepare(`
    WITH input AS (
      SELECT
        CAST(key AS INTEGER) AS input_order,
        CAST(json_extract(value, '$.opSeq') AS INTEGER) AS op_seq,
        CAST(json_extract(value, '$.opHash') AS TEXT) AS op_hash,
        CAST(json_extract(value, '$.itemId') AS TEXT) AS item_id,
        CAST(json_extract(value, '$.opType') AS TEXT) AS op_type,
        CAST(json_extract(value, '$.updatedAt') AS TEXT) AS updated_at,
        CAST(json_extract(value, '$.payloadSize') AS INTEGER) AS payload_size
      FROM json_each(?1)
    )
    INSERT OR IGNORE INTO ${SYNC_OPLOG_TABLE}
      (user_id, device_id, op_seq, op_hash, item_id, op_type, updated_at, payload_size)
    SELECT ?2, ?3, input.op_seq, input.op_hash, input.item_id, input.op_type, input.updated_at, input.payload_size
    FROM input
    LEFT JOIN ${SYNC_ITEMS_TABLE} AS existing
      ON existing.user_id = ?2 AND existing.item_id = input.item_id
    WHERE existing.item_id IS NULL
       OR input.updated_at > existing.updated_at
       OR (
         input.updated_at = existing.updated_at
         AND (existing.updated_by_device_id IS NULL OR ?3 > existing.updated_by_device_id)
       )
    ORDER BY input.input_order
  `).bind(jsonRows, userId, deviceId)
}

function buildSyncItemWriteStatement(
  db: D1Database,
  jsonRows: string,
  userId: string,
  deviceId: string
): D1PreparedStatement {
  return db.prepare(`
    WITH input AS (
      SELECT
        CAST(key AS INTEGER) AS input_order,
        CAST(json_extract(value, '$.itemId') AS TEXT) AS item_id,
        CAST(json_extract(value, '$.type') AS TEXT) AS type,
        CAST(json_extract(value, '$.schemaVersion') AS INTEGER) AS schema_version,
        CAST(json_extract(value, '$.payloadEnc') AS TEXT) AS payload_enc,
        CAST(json_extract(value, '$.payloadRef') AS TEXT) AS payload_ref,
        CAST(json_extract(value, '$.metaPlain') AS TEXT) AS meta_plain,
        CAST(json_extract(value, '$.payloadSize') AS INTEGER) AS payload_size,
        CAST(json_extract(value, '$.updatedAt') AS TEXT) AS updated_at,
        CAST(json_extract(value, '$.deletedAt') AS TEXT) AS deleted_at,
        CAST(json_extract(value, '$.opSeq') AS INTEGER) AS op_seq,
        CAST(json_extract(value, '$.opHash') AS TEXT) AS op_hash,
        CAST(json_extract(value, '$.opType') AS TEXT) AS op_type
      FROM json_each(?1)
    )
    INSERT INTO ${SYNC_ITEMS_TABLE} (
      user_id, item_id, type, schema_version, payload_enc, payload_ref, meta_plain, payload_size,
      updated_at, deleted_at, updated_by_device_id
    )
    SELECT ?2, input.item_id, input.type, input.schema_version, input.payload_enc, input.payload_ref,
           input.meta_plain, input.payload_size, input.updated_at, input.deleted_at, ?3
    FROM input
    JOIN ${SYNC_OPLOG_TABLE} AS oplog
      ON oplog.user_id = ?2
     AND oplog.device_id = ?3
     AND oplog.op_seq = input.op_seq
     AND oplog.op_hash = input.op_hash
     AND oplog.item_id = input.item_id
     AND oplog.op_type = input.op_type
     AND oplog.updated_at = input.updated_at
    ORDER BY input.input_order
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
       OR (
         excluded.updated_at = ${SYNC_ITEMS_TABLE}.updated_at
         AND (
           ${SYNC_ITEMS_TABLE}.updated_by_device_id IS NULL
           OR excluded.updated_by_device_id > ${SYNC_ITEMS_TABLE}.updated_by_device_id
         )
       )
  `).bind(jsonRows, userId, deviceId)
}

function buildSyncBlobCommitStatement(
  db: D1Database,
  jsonRows: string,
  userId: string,
  now: string
): D1PreparedStatement {
  return db.prepare(`
    UPDATE ${SYNC_BLOBS_TABLE}
    SET status = 'committed', last_referenced_at = ?3
    WHERE user_id = ?2
      AND blob_id IN (
        SELECT substr(CAST(json_extract(value, '$.payloadRef') AS TEXT), 6)
        FROM json_each(?1)
        WHERE CAST(json_extract(value, '$.opType') AS TEXT) = 'upsert'
          AND CAST(json_extract(value, '$.payloadRef') AS TEXT) LIKE 'blob:%'
      )
  `).bind(jsonRows, userId, now)
}

function buildSyncQuotaReconcileStatement(db: D1Database, userId: string, now: string): D1PreparedStatement {
  return db.prepare(`
    UPDATE ${SYNC_QUOTAS_TABLE}
    SET used_storage_bytes = CASE
          WHEN (
            SELECT COALESCE(SUM(CASE WHEN deleted_at IS NULL AND payload_ref IS NULL THEN COALESCE(payload_size, 0) ELSE 0 END), 0)
            FROM ${SYNC_ITEMS_TABLE}
            WHERE user_id = ?1
          ) + (
            SELECT COALESCE(SUM(size_bytes), 0)
            FROM ${SYNC_BLOBS_TABLE}
            WHERE user_id = ?1
              AND status IN ('staged', 'committed', 'ready', 'orphaned', 'delete_failed')
          ) <= storage_limit_bytes
          THEN (
            SELECT COALESCE(SUM(CASE WHEN deleted_at IS NULL AND payload_ref IS NULL THEN COALESCE(payload_size, 0) ELSE 0 END), 0)
            FROM ${SYNC_ITEMS_TABLE}
            WHERE user_id = ?1
          ) + (
            SELECT COALESCE(SUM(size_bytes), 0)
            FROM ${SYNC_BLOBS_TABLE}
            WHERE user_id = ?1
              AND status IN ('staged', 'committed', 'ready', 'orphaned', 'delete_failed')
          )
          ELSE NULL
        END,
        used_objects = CASE
          WHEN (
            SELECT COUNT(*) FROM ${SYNC_ITEMS_TABLE} WHERE user_id = ?1 AND deleted_at IS NULL
          ) <= object_limit
          THEN (
            SELECT COUNT(*) FROM ${SYNC_ITEMS_TABLE} WHERE user_id = ?1 AND deleted_at IS NULL
          )
          ELSE NULL
        END,
        updated_at = ?2
    WHERE user_id = ?1
    RETURNING used_storage_bytes, used_objects
  `).bind(userId, now)
}

function buildSyncSessionPushStatement(
  db: D1Database,
  userId: string,
  deviceId: string,
  now: string
): D1PreparedStatement {
  return db.prepare(`
    UPDATE ${SYNC_SESSIONS_TABLE}
    SET last_cursor = COALESCE((SELECT MAX(cursor) FROM ${SYNC_OPLOG_TABLE} WHERE user_id = ?1), 0),
        last_push_at = ?3,
        last_error_code = NULL
    WHERE user_id = ?1 AND device_id = ?2
  `).bind(userId, deviceId, now)
}

function buildSyncCursorStatement(db: D1Database, userId: string): D1PreparedStatement {
  return db.prepare(`
    SELECT COALESCE(MAX(cursor), 0) AS cursor
    FROM ${SYNC_OPLOG_TABLE}
    WHERE user_id = ?
  `).bind(userId)
}

export async function pushSyncItemsV1(
  event: H3Event,
  userId: string,
  deviceId: string,
  items: SyncItemInput[],
  options: {
    /** The quota the caller read in this request; the push checks against it instead of reading it again. */
    quota?: QuotaInfo
  } = {},
) {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const conflicts: SyncConflictItem[] = []
  const invalidResult = async (errorCode: SyncErrorCode) => ({
    errorCode,
    conflicts,
    ackCursor: await getServerCursor(db, userId),
    appliedStorageDelta: 0,
    appliedObjectsDelta: 0,
  })

  if (!Array.isArray(items))
    return invalidResult('SYNC_INVALID_PAYLOAD')

  const normalizedItems: NormalizedSyncPushItem[] = []
  for (const item of items) {
    if (
      !item
      || typeof item.item_id !== 'string'
      || !item.item_id
      || typeof item.type !== 'string'
      || !item.type
      || typeof item.op_hash !== 'string'
      || !item.op_hash
      || typeof item.updated_at !== 'string'
      || !item.updated_at
      || !Number.isInteger(item.op_seq)
      || !Number.isInteger(item.schema_version)
      || (item.op_type !== 'upsert' && item.op_type !== 'delete')
    ) {
      return invalidResult('SYNC_INVALID_PAYLOAD')
    }

    const rawPayloadSize = item.payload_size == null ? null : Number(item.payload_size)
    if (rawPayloadSize != null && !Number.isFinite(rawPayloadSize))
      return invalidResult('SYNC_INVALID_PAYLOAD')

    normalizedItems.push({
      item,
      updatedAt: normalizeUpdatedAt(item.updated_at),
      rawPayloadSize,
    })
  }

  const preloaded = await preloadSyncPushState(db, userId, deviceId, normalizedItems)
  if (preloaded.queryCount >= SYNC_PUSH_D1_QUERY_BUDGET)
    return invalidResult('SYNC_INVALID_PAYLOAD')

  const candidates: SyncWriteCandidate[] = []
  const projectedItems = new Map(preloaded.existingItems)
  const projectedOpSeqs = new Set(preloaded.existingOpSeqs)
  const affectedItemIds = new Set<string>()
  let maxItemSize: number | null = null

  for (const normalized of normalizedItems) {
    const { item, updatedAt, rawPayloadSize } = normalized
    if (preloaded.existingOpSeqs.has(item.op_seq))
      continue

    const existing = preloaded.existingItems.get(item.item_id) ?? null
    if (existing && !isNewerUpdate(updatedAt, existing.updated_at, deviceId, existing.updated_by_device_id)) {
      conflicts.push({
        item_id: item.item_id,
        server_updated_at: existing.updated_at,
        server_device_id: existing.updated_by_device_id ?? null,
      })
      continue
    }

    const existingPayloadSize = Number(existing?.payload_size ?? 0)
    const payloadSize = rawPayloadSize ?? existingPayloadSize
    candidates.push({ item, updatedAt, payloadSize, existing })

    if (projectedOpSeqs.has(item.op_seq))
      continue
    projectedOpSeqs.add(item.op_seq)

    const projected = projectedItems.get(item.item_id) ?? null
    if (projected && !isNewerUpdate(updatedAt, projected.updated_at, deviceId, projected.updated_by_device_id))
      continue

    const storedPayloadSize = item.op_type === 'delete' ? existingPayloadSize : payloadSize
    const deletedAt = item.op_type === 'delete' ? (item.deleted_at ?? updatedAt) : (item.deleted_at ?? null)
    projectedItems.set(item.item_id, {
      item_id: item.item_id,
      updated_at: updatedAt,
      updated_by_device_id: deviceId,
      payload_size: Number.isFinite(storedPayloadSize) ? storedPayloadSize : null,
      deleted_at: deletedAt,
    })
    affectedItemIds.add(item.item_id)

    if (item.op_type === 'upsert' && (maxItemSize === null || payloadSize > maxItemSize))
      maxItemSize = payloadSize
  }

  let plannedStorageDelta = 0
  let plannedObjectsDelta = 0
  for (const itemId of affectedItemIds) {
    const before = preloaded.existingItems.get(itemId) ?? null
    const after = projectedItems.get(itemId) ?? null
    const beforeLive = Boolean(before && !before.deleted_at)
    const afterLive = Boolean(after && !after.deleted_at)
    if (beforeLive)
      plannedStorageDelta -= Number(before?.payload_size ?? 0)
    if (afterLive)
      plannedStorageDelta += Number(after?.payload_size ?? 0)
    plannedObjectsDelta += Number(afterLive) - Number(beforeLive)
  }

  const quotaCheck = await validateQuota(event, userId, {
    storageDelta: plannedStorageDelta,
    objectsDelta: plannedObjectsDelta,
    itemSize: maxItemSize,
  }, options.quota)
  if (!quotaCheck.ok)
    return invalidResult(quotaCheck.code ?? 'SYNC_INVALID_PAYLOAD')

  const writeChunks = serializeJsonChunks(candidates.map(toSyncWriteRow))
  const plannedQueryCount =
    preloaded.queryCount
    + (writeChunks.length * 2)
    + (candidates.length ? writeChunks.length + 1 : 0)
    + 2
  if (plannedQueryCount > SYNC_PUSH_D1_QUERY_BUDGET)
    return invalidResult('SYNC_INVALID_PAYLOAD')

  const now = new Date().toISOString()
  const statements: D1PreparedStatement[] = []
  for (const chunk of writeChunks)
    statements.push(buildSyncOplogWriteStatement(db, chunk, userId, deviceId))
  for (const chunk of writeChunks)
    statements.push(buildSyncItemWriteStatement(db, chunk, userId, deviceId))
  for (const chunk of writeChunks)
    statements.push(buildSyncBlobCommitStatement(db, chunk, userId, now))

  const quotaResultIndex = candidates.length ? statements.length : -1
  if (candidates.length)
    statements.push(buildSyncQuotaReconcileStatement(db, userId, now))
  statements.push(
    buildSyncSessionPushStatement(db, userId, deviceId, now),
    buildSyncCursorStatement(db, userId),
  )

  const results = await db.batch(statements)
  const cursorRows = readD1ResultRows<{ cursor: number }>(results.at(-1))
  const ackCursor = Number(cursorRows[0]?.cursor ?? 0)

  let appliedStorageDelta = 0
  let appliedObjectsDelta = 0
  if (quotaResultIndex >= 0) {
    const quotaRows = readD1ResultRows<SyncUsageRow>(results[quotaResultIndex])
    const finalUsage = quotaRows[0]
    if (finalUsage) {
      appliedStorageDelta = Number(finalUsage.used_storage_bytes ?? 0) - preloaded.usage.used_storage_bytes
      appliedObjectsDelta = Number(finalUsage.used_objects ?? 0) - preloaded.usage.used_objects
    }
  }

  try {
    await reconcileSyncBlobsV1(event, userId)
  } catch {
    // Blob GC is best-effort and must not turn a committed sync push into a failure.
  }
  return { conflicts, ackCursor, appliedStorageDelta, appliedObjectsDelta }
}
const SYNC_BLOB_STAGED_TTL_MS = 24 * 60 * 60 * 1000
const SYNC_BLOB_VERSION_RETENTION_MS = 24 * 60 * 60 * 1000
const SYNC_BLOB_GC_LIMIT = 64
async function releaseSyncBlobChunks(event: H3Event, userId: string, blobId: string): Promise<void> {
  const db = requireDatabase(event)
  const bucket = getSyncBlobBucket(event)
  if (!bucket) throw new Error('R2 bucket is not available.')
  const refs = await db.prepare(`
    SELECT DISTINCT r.chunk_id, c.object_key
    FROM ${SYNC_BLOB_CHUNK_REFS_TABLE} AS r
    JOIN ${SYNC_BLOB_CHUNKS_TABLE} AS c
      ON c.user_id = r.user_id AND c.chunk_id = r.chunk_id
    WHERE r.user_id = ? AND r.blob_id = ?
  `).bind(userId, blobId).all<{ chunk_id: string, object_key: string }>()
  await db.prepare(`DELETE FROM ${SYNC_BLOB_CHUNK_REFS_TABLE} WHERE user_id = ? AND blob_id = ?`).bind(userId, blobId).run()
  for (const ref of refs.results ?? []) {
    const stillReferenced = await db.prepare(`
      SELECT 1 AS present
      FROM ${SYNC_BLOB_CHUNK_REFS_TABLE}
      WHERE user_id = ? AND chunk_id = ?
      LIMIT 1
    `).bind(userId, ref.chunk_id).first<{ present: number }>()
    if (stillReferenced) continue
    await deleteStorageObject({
      event,
      bucket,
      memoryStorage: syncBlobMemoryStorage,
      externalStorage: null,
      key: ref.object_key,
      resourceType: 'sync-blob-chunk',
      governanceResourceId: `sync-blob-chunk:${ref.chunk_id}`,
      actorId: userId,
    })
    await db.prepare(`DELETE FROM ${SYNC_BLOB_CHUNKS_TABLE} WHERE user_id = ? AND chunk_id = ?`).bind(userId, ref.chunk_id).run()
  }
}
async function reconcileStaleSyncBlobChunks(
  event: H3Event,
  userId: string,
  staleBefore: string,
  limit: number
): Promise<void> {
  const db = requireDatabase(event)
  const bucket = getSyncBlobBucket(event)
  if (!bucket) throw new Error('R2 bucket is not available.')
  const sessions = await db.prepare(`
    SELECT session_id
    FROM ${SYNC_BLOB_UPLOAD_SESSIONS_TABLE}
    WHERE user_id = ? AND created_at < ?
    ORDER BY created_at ASC
    LIMIT ?
  `).bind(userId, staleBefore, limit).all<{ session_id: string }>()
  for (const session of sessions.results ?? []) {
    await db.prepare(`DELETE FROM ${SYNC_BLOB_UPLOAD_REFS_TABLE} WHERE user_id = ? AND session_id = ?`).bind(userId, session.session_id).run()
    await db.prepare(`DELETE FROM ${SYNC_BLOB_UPLOAD_SESSIONS_TABLE} WHERE user_id = ? AND session_id = ?`).bind(userId, session.session_id).run()
  }
  const chunks = await db.prepare(`
    SELECT c.chunk_id, c.object_key
    FROM ${SYNC_BLOB_CHUNKS_TABLE} AS c
    WHERE c.user_id = ? AND c.created_at < ?
      AND NOT EXISTS (
        SELECT 1 FROM ${SYNC_BLOB_CHUNK_REFS_TABLE} AS r
        WHERE r.user_id = c.user_id AND r.chunk_id = c.chunk_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${SYNC_BLOB_UPLOAD_REFS_TABLE} AS r
        WHERE r.user_id = c.user_id AND r.chunk_id = c.chunk_id
      )
    ORDER BY c.created_at ASC
    LIMIT ?
  `).bind(userId, staleBefore, limit).all<{ chunk_id: string, object_key: string }>()
  for (const chunk of chunks.results ?? []) {
    await deleteStorageObject({
      event,
      bucket,
      memoryStorage: syncBlobMemoryStorage,
      externalStorage: null,
      key: chunk.object_key,
      resourceType: 'sync-blob-chunk',
      governanceResourceId: `sync-blob-chunk:${chunk.chunk_id}`,
      actorId: userId,
    })
    await db.prepare(`DELETE FROM ${SYNC_BLOB_CHUNKS_TABLE} WHERE user_id = ? AND chunk_id = ?`).bind(userId, chunk.chunk_id).run()
  }
}


export async function reconcileSyncBlobsV1(
  event: H3Event,
  userId: string,
  requestedLimit = SYNC_BLOB_GC_LIMIT
): Promise<{ markedOrphaned: number, deleted: number, deleteFailed: number }> {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const bucket = getSyncBlobBucket(event)
  if (!bucket)
    throw new Error('R2 bucket is not available.')

  const limit = Math.min(Math.max(Math.floor(requestedLimit) || SYNC_BLOB_GC_LIMIT, 1), SYNC_BLOB_GC_LIMIT)
  const now = new Date()
  const nowIso = now.toISOString()
  const versionStaleBefore = new Date(now.getTime() - SYNC_BLOB_VERSION_RETENTION_MS).toISOString()
  const staleBefore = new Date(now.getTime() - SYNC_BLOB_STAGED_TTL_MS).toISOString()
  const markResult = await db.prepare(`
    UPDATE ${SYNC_BLOBS_TABLE}
    SET status = 'orphaned', last_referenced_at = created_at
    WHERE user_id = ?1
      AND status IN ('staged', 'committed', 'ready')
      AND NOT EXISTS (
        SELECT 1
        FROM ${SYNC_ITEMS_TABLE}
        WHERE user_id = ?1
          AND deleted_at IS NULL
          AND payload_ref = 'blob:' || ${SYNC_BLOBS_TABLE}.blob_id
      )
      AND (
        (status IN ('committed', 'ready') AND created_at < ?2)
        OR (status = 'staged' AND created_at < ?3)
      )
  `).bind(userId, versionStaleBefore, staleBefore).run()

  const candidates = await db.prepare(`
    SELECT blob_id, object_key
    FROM ${SYNC_BLOBS_TABLE}
    WHERE user_id = ?1
      AND status IN ('orphaned', 'delete_failed')
      AND COALESCE(last_referenced_at, created_at) < ?2
    ORDER BY COALESCE(last_referenced_at, created_at) ASC
    LIMIT ?3
  `).bind(userId, staleBefore, limit).all<{ blob_id: string, object_key: string }>()

  let deleted = 0
  let deleteFailed = 0
  for (const candidate of candidates.results ?? []) {
    const liveReference = await db.prepare(`
      SELECT 1 AS present
      FROM ${SYNC_ITEMS_TABLE}
      WHERE user_id = ? AND deleted_at IS NULL AND payload_ref = ?
      LIMIT 1
    `).bind(userId, `blob:${candidate.blob_id}`).first<{ present: number }>()
    if (liveReference) {
      await db.prepare(`
        UPDATE ${SYNC_BLOBS_TABLE}
        SET status = 'committed', last_referenced_at = ?
        WHERE user_id = ? AND blob_id = ? AND status IN ('orphaned', 'delete_failed')
      `).bind(nowIso, userId, candidate.blob_id).run()
      continue
    }

    try {
      if (candidate.object_key.startsWith('chunks:')) {
        await releaseSyncBlobChunks(event, userId, candidate.blob_id)
      } else {
        await deleteStorageObject({
          event,
          bucket,
          memoryStorage: syncBlobMemoryStorage,
          externalStorage: null,
          key: candidate.object_key,
          resourceType: 'sync-blob',
          governanceResourceId: `sync-blob:${candidate.blob_id}`,
          actorId: userId,
        })
      }
      await db.prepare(`
        UPDATE ${SYNC_BLOBS_TABLE}
        SET status = 'deleted'
        WHERE user_id = ? AND blob_id = ? AND status IN ('orphaned', 'delete_failed')
      `).bind(userId, candidate.blob_id).run()
      deleted += 1
    } catch {
      await db.prepare(`
        UPDATE ${SYNC_BLOBS_TABLE}
        SET status = 'delete_failed', last_referenced_at = ?
        WHERE user_id = ? AND blob_id = ? AND status IN ('orphaned', 'delete_failed')
      `).bind(nowIso, userId, candidate.blob_id).run()
      deleteFailed += 1
    }
  }

  await reconcileStaleSyncBlobChunks(event, userId, staleBefore, limit)
  await buildSyncQuotaReconcileStatement(db, userId, nowIso).run()
  return {
    markedOrphaned: Number(markResult.meta?.changes ?? 0),
    deleted,
    deleteFailed
  }
}

async function getServerCursor(db: D1Database, userId: string) {
  const row = await db.prepare(`SELECT MAX(cursor) AS cursor FROM ${SYNC_OPLOG_TABLE} WHERE user_id = ?`).bind(userId).first()
  return Number(row?.cursor ?? 0)
}

export async function pullSyncItemsV1(
  event: H3Event,
  userId: string,
  deviceId: string,
  cursor: number,
  limit: number
) {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const safeLimit = Math.min(Math.max(limit, 1), 200)
  const fallbackCursor = Math.max(0, Math.floor(cursor))
  // The page, its items and the session's new cursor in one round trip and one transaction; they were
  // three. The items were read with an `IN` list of the page's item ids — past 99 distinct items, more
  // parameters than D1 binds, with the 200-entry default page. They are the page's own subquery now.
  const page = `
    SELECT cursor, item_id
    FROM ${SYNC_OPLOG_TABLE}
    WHERE user_id = ?1 AND cursor > ?2
    ORDER BY cursor ASC
    LIMIT ?3`
  const [oplogResult, itemResult] = await db.batch([
    db.prepare(`
      SELECT cursor, item_id, op_seq, op_hash, op_type, updated_at, device_id
      FROM ${SYNC_OPLOG_TABLE}
      WHERE user_id = ?1 AND cursor > ?2
      ORDER BY cursor ASC
      LIMIT ?3
    `).bind(userId, cursor, safeLimit),
    db.prepare(`
      SELECT * FROM ${SYNC_ITEMS_TABLE}
      WHERE user_id = ?1 AND item_id IN (SELECT item_id FROM (${page}))
    `).bind(userId, cursor, safeLimit),
    db.prepare(`
      UPDATE ${SYNC_SESSIONS_TABLE}
      SET last_cursor = COALESCE((SELECT MAX(cursor) FROM (${page})), ?4),
        last_pull_at = ?5,
        last_error_code = NULL
      WHERE user_id = ?1 AND device_id = ?6
    `).bind(userId, cursor, safeLimit, fallbackCursor, new Date().toISOString(), deviceId),
  ])

  const oplog = ((oplogResult?.results ?? []) as Array<Record<string, unknown>>).map(row => ({
    cursor: Number(row.cursor),
    item_id: row.item_id as string,
    op_seq: Number(row.op_seq),
    op_hash: row.op_hash as string,
    op_type: row.op_type as 'upsert' | 'delete',
    updated_at: row.updated_at as string,
    device_id: row.device_id as string,
  })) as SyncOplogItem[]

  const items: SyncItemOutput[] = ((itemResult?.results ?? []) as Array<Record<string, unknown>>).map(row => ({
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

  const lastOplog = oplog.at(-1)
  const nextCursor = lastOplog ? lastOplog.cursor : cursor
  return { items, oplog, nextCursor }
}

interface SyncBlobUploadOptions {
  itemId?: string
  logicalVersion?: string
  sha256?: string
  sizeBytes?: number
}

interface SyncBlobRecord {
  blob_id: string
  object_key: string
  sha256: string
  size_bytes: number
  content_type: string | null
  storage_channel?: string
  storage_provider?: string
}
export async function findExistingSyncBlob(
  event: H3Event,
  userId: string,
  itemId?: string,
  logicalVersion?: string,
  expected?: Pick<SyncBlobUploadOptions, 'sha256' | 'sizeBytes'>
) {
  const normalizedItemId = itemId?.trim() || ''
  const normalizedLogicalVersion = logicalVersion?.trim() || ''
  if (!normalizedItemId || !normalizedLogicalVersion) return null

  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const existing = await db.prepare(`
    SELECT blob_id, object_key, sha256, size_bytes, content_type
    FROM ${SYNC_BLOBS_TABLE}
    WHERE user_id = ? AND item_id = ? AND logical_version = ?
      AND status IN ('staged', 'committed', 'ready')
    LIMIT 1
  `).bind(userId, normalizedItemId, normalizedLogicalVersion).first<SyncBlobRecord>()
  if (!existing) return null
  if (expected?.sha256 && existing.sha256 !== expected.sha256) return null
  if (expected?.sizeBytes !== undefined && Number(existing.size_bytes) !== expected.sizeBytes) return null

  return {
    blobId: existing.blob_id,
    objectKey: existing.object_key,
    sha256: existing.sha256,
    sizeBytes: Number(existing.size_bytes),
    storageChannel: 'existing',
    storageProvider: 'existing',
    uploadRetry: undefined,
    deduplicated: true
  }
}

export async function uploadSyncBlob(
  event: H3Event,
  userId: string,
  file: File,
  options: SyncBlobUploadOptions = {}
) {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const bucket = getSyncBlobBucket(event)
  if (!bucket)
    throw new Error('R2 bucket is not available.')

  const itemId = options.itemId?.trim() || null
  const logicalVersion = options.logicalVersion?.trim() || null
  const existing = await findExistingSyncBlob(
    event,
    userId,
    itemId ?? undefined,
    logicalVersion ?? undefined,
    options
  )
  if (existing) return existing

  const arrayBuffer = await file.arrayBuffer()
  const sizeBytes = Number(file.size || arrayBuffer.byteLength)
  const blobId = randomUUID()
  const objectKey = `${userId}/${blobId}`
  const contentType = file.type || 'application/octet-stream'
  const stored = await putStorageObject({
    event,
    bucket,
    memoryStorage: syncBlobMemoryStorage,
    externalStorage: null,
    key: objectKey,
    data: Buffer.from(arrayBuffer),
    contentType,
    resourceType: 'sync-blob',
    governanceResourceId: `sync-blob:${blobId}`,
    actorId: userId,
  })
  if (
    (options.sha256 && stored.sha256 !== options.sha256)
    || (options.sizeBytes !== undefined && options.sizeBytes !== sizeBytes)
  ) {
    await deleteStorageObject({
      event,
      bucket,
      memoryStorage: syncBlobMemoryStorage,
      externalStorage: null,
      key: objectKey,
      resourceType: 'sync-blob',
      governanceResourceId: `sync-blob:${blobId}`,
      actorId: userId,
    })
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Blob content does not match its declared hash or size')
  }

  await db.prepare(`
    INSERT OR IGNORE INTO ${SYNC_BLOBS_TABLE}
      (user_id, blob_id, object_key, sha256, size_bytes, content_type, created_at, status, item_id, logical_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'staged', ?, ?)
  `).bind(
    userId,
    blobId,
    objectKey,
    stored.sha256,
    sizeBytes,
    contentType,
    new Date().toISOString(),
    itemId,
    logicalVersion
  ).run()

  const row = await db.prepare(`
    SELECT blob_id, object_key, sha256, size_bytes, content_type
    FROM ${SYNC_BLOBS_TABLE}
    WHERE user_id = ? AND blob_id = ?
  `).bind(userId, blobId).first<SyncBlobRecord>()
  if (row) {
    return {
      blobId: row.blob_id,
      objectKey: row.object_key,
      sha256: row.sha256,
      sizeBytes: Number(row.size_bytes),
      storageChannel: stored.storageChannel,
      storageProvider: stored.storageProvider,
      uploadRetry: stored.uploadRetry,
      deduplicated: false
    }
  }

  if (itemId && logicalVersion) {
    const winner = await db.prepare(`
      SELECT blob_id, object_key, sha256, size_bytes, content_type
      FROM ${SYNC_BLOBS_TABLE}
      WHERE user_id = ? AND item_id = ? AND logical_version = ?
        AND status IN ('staged', 'committed', 'ready')
      LIMIT 1
    `).bind(userId, itemId, logicalVersion).first<SyncBlobRecord>()
    await deleteStorageObject({
      event,
      bucket,
      memoryStorage: syncBlobMemoryStorage,
      externalStorage: null,
      key: objectKey,
      resourceType: 'sync-blob',
      governanceResourceId: `sync-blob:${blobId}`,
      actorId: userId,
    })
    if (winner) {
      return {
        blobId: winner.blob_id,
        objectKey: winner.object_key,
        sha256: winner.sha256,
        sizeBytes: Number(winner.size_bytes),
        storageChannel: 'existing',
        storageProvider: 'existing',
        uploadRetry: undefined,
        deduplicated: true
      }
    }
  }

  throw new Error('SYNC_BLOB_METADATA_MISSING')
}

export interface SyncBlobChunkDescriptor {
  index: number
  sha256: string
  sizeBytes: number
}

export interface SyncBlobChunkPrepareResult {
  action: 'reuse' | 'upload'
  blob?: { blobId: string, objectKey: string, sha256: string, sizeBytes: number }
  sessionId?: string
  missing: SyncBlobChunkDescriptor[]
}

export async function prepareSyncBlobChunks(
  event: H3Event,
  userId: string,
  options: {
    itemId: string
    logicalVersion: string
    sha256: string
    sizeBytes: number
    chunkSize: number
    chunks: SyncBlobChunkDescriptor[]
  }
): Promise<SyncBlobChunkPrepareResult> {
  const existing = await findExistingSyncBlob(event, userId, options.itemId, options.logicalVersion, {
    sha256: options.sha256,
    sizeBytes: options.sizeBytes
  })
  if (existing) {
    return {
      action: 'reuse',
      blob: {
        blobId: existing.blobId,
        objectKey: existing.objectKey,
        sha256: existing.sha256,
        sizeBytes: existing.sizeBytes
      },
      missing: []
    }
  }

  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const existingSession = await db.prepare(`
    SELECT session_id
    FROM ${SYNC_BLOB_UPLOAD_SESSIONS_TABLE}
    WHERE user_id = ? AND item_id = ? AND logical_version = ? AND payload_sha256 = ?
    LIMIT 1
  `).bind(userId, options.itemId, options.logicalVersion, options.sha256).first<{ session_id: string }>()
  const sessionId = existingSession?.session_id ?? randomUUID()
  await db.prepare(`
    INSERT OR IGNORE INTO ${SYNC_BLOB_UPLOAD_SESSIONS_TABLE}
      (user_id, session_id, item_id, logical_version, payload_sha256, size_bytes, chunk_size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    sessionId,
    options.itemId,
    options.logicalVersion,
    options.sha256,
    options.sizeBytes,
    options.chunkSize,
    new Date().toISOString()
  ).run()

  const missing: SyncBlobChunkDescriptor[] = []
  for (const chunk of options.chunks) {
    const stored = await db.prepare(`
      SELECT chunk_id
      FROM ${SYNC_BLOB_CHUNKS_TABLE}
      WHERE user_id = ? AND sha256 = ? AND size_bytes = ? AND status = 'ready'
      LIMIT 1
    `).bind(userId, chunk.sha256, chunk.sizeBytes).first<{ chunk_id: string }>()
    await db.prepare(`
      INSERT INTO ${SYNC_BLOB_UPLOAD_REFS_TABLE}
        (user_id, session_id, chunk_index, chunk_id, sha256, size_bytes)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, session_id, chunk_index) DO UPDATE SET
        chunk_id = excluded.chunk_id,
        sha256 = excluded.sha256,
        size_bytes = excluded.size_bytes
    `).bind(userId, sessionId, chunk.index, stored?.chunk_id ?? '', chunk.sha256, chunk.sizeBytes).run()
    if (!stored) missing.push(chunk)
  }

  return { action: 'upload', sessionId, missing }
}

export async function uploadSyncBlobChunk(
  event: H3Event,
  userId: string,
  sessionId: string,
  chunk: SyncBlobChunkDescriptor,
  file: File
): Promise<{ chunkId: string, sha256: string, sizeBytes: number }> {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const expected = await db.prepare(`
    SELECT sha256, size_bytes, chunk_id
    FROM ${SYNC_BLOB_UPLOAD_REFS_TABLE}
    WHERE user_id = ? AND session_id = ? AND chunk_index = ?
  `).bind(userId, sessionId, chunk.index).first<{ sha256: string, size_bytes: number, chunk_id: string }>()
  if (!expected || expected.sha256 !== chunk.sha256 || Number(expected.size_bytes) !== chunk.sizeBytes) {
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Unknown or invalid upload chunk')
  }
  if (expected.chunk_id) {
    return { chunkId: expected.chunk_id, sha256: expected.sha256, sizeBytes: Number(expected.size_bytes) }
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const actualSha256 = createHash('sha256').update(bytes).digest('hex')
  if (bytes.byteLength !== chunk.sizeBytes || actualSha256 !== chunk.sha256) {
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Upload chunk does not match its hash or size')
  }
  const existing = await db.prepare(`
    SELECT chunk_id, object_key
    FROM ${SYNC_BLOB_CHUNKS_TABLE}
    WHERE user_id = ? AND sha256 = ? AND size_bytes = ? AND status = 'ready'
    LIMIT 1
  `).bind(userId, chunk.sha256, chunk.sizeBytes).first<{ chunk_id: string, object_key: string }>()
  let chunkId = existing?.chunk_id
  if (!chunkId) {
    chunkId = chunk.sha256
    const objectKey = `${userId}/sync-chunks/${chunk.sha256}`
    const bucket = getSyncBlobBucket(event)
    if (!bucket) throw new Error('R2 bucket is not available.')
    await putStorageObject({
      event,
      bucket,
      memoryStorage: syncBlobMemoryStorage,
      externalStorage: null,
      key: objectKey,
      data: bytes,
      contentType: file.type || 'application/octet-stream',
      resourceType: 'sync-blob-chunk',
      governanceResourceId: `sync-blob-chunk:${chunkId}`,
      actorId: userId,
    })
    await db.prepare(`
      INSERT OR IGNORE INTO ${SYNC_BLOB_CHUNKS_TABLE}
        (user_id, chunk_id, sha256, size_bytes, object_key, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?, 'ready')
    `).bind(userId, chunkId, chunk.sha256, chunk.sizeBytes, objectKey, new Date().toISOString()).run()
  }
  await db.prepare(`
    UPDATE ${SYNC_BLOB_UPLOAD_REFS_TABLE}
    SET chunk_id = ?
    WHERE user_id = ? AND session_id = ? AND chunk_index = ?
  `).bind(chunkId, userId, sessionId, chunk.index).run()
  return { chunkId, sha256: chunk.sha256, sizeBytes: chunk.sizeBytes }
}

export async function commitSyncBlobChunks(
  event: H3Event,
  userId: string,
  sessionId: string
) {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const session = await db.prepare(`
    SELECT item_id, logical_version, payload_sha256, size_bytes
    FROM ${SYNC_BLOB_UPLOAD_SESSIONS_TABLE}
    WHERE user_id = ? AND session_id = ?
  `).bind(userId, sessionId).first<{
    item_id: string
    logical_version: string
    payload_sha256: string
    size_bytes: number
  }>()
  if (!session) throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Upload session not found')
  const refs = await db.prepare(`
    SELECT r.chunk_index, r.chunk_id, r.sha256, r.size_bytes, c.object_key
    FROM ${SYNC_BLOB_UPLOAD_REFS_TABLE} AS r
    JOIN ${SYNC_BLOB_CHUNKS_TABLE} AS c
      ON c.user_id = r.user_id AND c.chunk_id = r.chunk_id AND c.status = 'ready'
    WHERE r.user_id = ? AND r.session_id = ?
    ORDER BY r.chunk_index ASC
  `).bind(userId, sessionId).all<{
    chunk_index: number
    chunk_id: string
    sha256: string
    size_bytes: number
    object_key: string
  }>()
  if (!refs.results?.length) throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'No upload chunks are ready')

  const bucket = getSyncBlobBucket(event)
  if (!bucket) throw new Error('R2 bucket is not available.')
  const buffers: Buffer[] = []
  for (const ref of refs.results) {
    const object = await bucket.get(ref.object_key)
    if (!object) throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Upload chunk is unavailable')
    buffers.push(Buffer.from(await object.arrayBuffer()))
  }
  const payload = Buffer.concat(buffers)
  const payloadSha256 = createHash('sha256').update(payload).digest('hex')
  if (payload.byteLength !== Number(session.size_bytes) || payloadSha256 !== session.payload_sha256) {
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Chunked payload does not match its manifest')
  }

  const existing = await findExistingSyncBlob(event, userId, session.item_id, session.logical_version, {
    sha256: session.payload_sha256,
    sizeBytes: Number(session.size_bytes)
  })
  if (existing) return existing

  const blobId = randomUUID()
  const nowIso = new Date().toISOString()
  await db.prepare(`
    INSERT INTO ${SYNC_BLOBS_TABLE}
      (user_id, blob_id, object_key, sha256, size_bytes, content_type, created_at, status, item_id, logical_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'staged', ?, ?)
  `).bind(
    userId,
    blobId,
    `chunks:${blobId}`,
    payloadSha256,
    payload.byteLength,
    'text/plain;charset=utf-8',
    nowIso,
    session.item_id,
    session.logical_version
  ).run()
  for (const ref of refs.results) {
    await db.prepare(`
      INSERT INTO ${SYNC_BLOB_CHUNK_REFS_TABLE} (user_id, blob_id, chunk_index, chunk_id)
      VALUES (?, ?, ?, ?)
    `).bind(userId, blobId, ref.chunk_index, ref.chunk_id).run()
  }
  await db.prepare(`DELETE FROM ${SYNC_BLOB_UPLOAD_REFS_TABLE} WHERE user_id = ? AND session_id = ?`).bind(userId, sessionId).run()
  await db.prepare(`DELETE FROM ${SYNC_BLOB_UPLOAD_SESSIONS_TABLE} WHERE user_id = ? AND session_id = ?`).bind(userId, sessionId).run()
  return {
    blobId,
    objectKey: `chunks:${blobId}`,
    sha256: payloadSha256,
    sizeBytes: payload.byteLength,
    storageChannel: 'r2-chunks',
    storageProvider: 'r2',
    uploadRetry: undefined,
    deduplicated: false
  }
}

/**
 * A blob to stream to its owner: the R2 body is handed through rather than read whole into the
 * isolate first. `byteLength` is the stored object's own size, for `Content-Length`.
 */
export async function getSyncBlob(event: H3Event, userId: string, blobId: string): Promise<{
  body: ReadableStream<Uint8Array>
  byteLength: number
  contentType: string
  sha256: string
  sizeBytes: number
  objectKey: string
} | null> {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)
  const bucket = getSyncBlobBucket(event)
  if (!bucket)
    throw new Error('R2 bucket is not available.')

  const row = await db.prepare(`
    SELECT object_key, sha256, size_bytes, content_type
    FROM ${SYNC_BLOBS_TABLE}
    WHERE user_id = ? AND blob_id = ? AND status <> 'deleted'
  `).bind(userId, blobId).first<{ object_key: string, sha256: string, size_bytes: number, content_type: string | null }>()

  if (!row)
    return null
  if (row.object_key.startsWith('chunks:')) {
    const refs = await db.prepare(`
      SELECT r.chunk_index, c.object_key
      FROM ${SYNC_BLOB_CHUNK_REFS_TABLE} AS r
      JOIN ${SYNC_BLOB_CHUNKS_TABLE} AS c
        ON c.user_id = r.user_id AND c.chunk_id = r.chunk_id AND c.status = 'ready'
      WHERE r.user_id = ? AND r.blob_id = ?
      ORDER BY r.chunk_index ASC
    `).bind(userId, blobId).all<{ chunk_index: number, object_key: string }>()
    if (!refs.results?.length) return null
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (const ref of refs.results ?? []) {
            const chunk = await bucket.get(ref.object_key)
            if (!chunk) throw new Error('Sync Blob chunk is unavailable.')
            controller.enqueue(new Uint8Array(await chunk.arrayBuffer()))
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      }
    })
    return {
      body,
      byteLength: Number(row.size_bytes),
      contentType: row.content_type || 'application/octet-stream',
      sha256: row.sha256,
      sizeBytes: Number(row.size_bytes),
      objectKey: row.object_key,
    }
  }


  const object = await bucket.get(row.object_key)
  if (!object)
    return null

  const contentType = row.content_type || object.httpMetadata?.contentType || 'application/octet-stream'
  const sizeBytes = Number(row.size_bytes ?? object.size)

  return {
    body: object.body as unknown as ReadableStream<Uint8Array>,
    byteLength: object.size,
    contentType,
    sha256: row.sha256,
    sizeBytes,
    objectKey: row.object_key,
  }
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

export interface KeyringMeta {
  keyring_id: string
  device_id: string
  key_type: string
  rotated_at: string | null
  created_at: string
  has_recovery_code: boolean
}

export interface SyncSessionStatus {
  device_id: string
  expires_at: string
  last_cursor: number
  last_push_at: string | null
  last_pull_at: string | null
  last_error_code: string | null
}

export interface SyncCatalogCategory {
  key: string
  label: string
  count: number
  total_payload_bytes: number
  last_updated_at: string
  sample_items: string[]
}

export interface SyncCatalogItem {
  item_id: string
  type: string
  qualified_name: string | null
  plugin_id: string | null
  plugin_display_name: string | null
  file_path: string | null
  file_display_name: string | null
  kind: 'settings' | 'data' | null
  storage_state: 'inline' | 'blob'
  lifecycle_status: 'active' | 'deleted'
  category: string
  category_label: string
  payload_size: number
  updated_at: string
  deleted_at: string | null
  has_payload_enc: boolean
  has_payload_ref: boolean
}

export interface SyncCatalogSummary {
  total_items: number
  live_items: number
  deleted_items: number
  total_payload_bytes: number
  last_updated_at: string
}
export interface SyncBlobUsageBucket {
  bytes: number
  objects: number
}

export interface SyncBlobUsage {
  active: SyncBlobUsageBucket
  staged: SyncBlobUsageBucket
  orphaned: SyncBlobUsageBucket
  delete_failed: SyncBlobUsageBucket
  deleted: SyncBlobUsageBucket
}


export interface SyncItemCatalog {
  summary: SyncCatalogSummary
  blob_usage: SyncBlobUsage
  categories: SyncCatalogCategory[]
  items: SyncCatalogItem[]
  generated_at: string
}

export interface RecentSyncActivity {
  cursor: number
  device_id: string
  item_id: string
  op_type: 'upsert' | 'delete'
  updated_at: string
  payload_size: number
  status: 'success' | 'failed'
  error_code: string | null
}

export async function getLatestSyncSessionStatus(
  event: H3Event,
  userId: string
): Promise<SyncSessionStatus | null> {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)

  const row = await db.prepare(`
    SELECT device_id, expires_at, last_cursor, last_push_at, last_pull_at, last_error_code
    FROM ${SYNC_SESSIONS_TABLE}
    WHERE user_id = ?
    ORDER BY COALESCE(last_pull_at, last_push_at, expires_at) DESC
    LIMIT 1
  `).bind(userId).first<{
    device_id: string
    expires_at: string
    last_cursor: number
    last_push_at: string | null
    last_pull_at: string | null
    last_error_code: string | null
  }>()

  if (!row) {
    return null
  }

  return {
    device_id: row.device_id,
    expires_at: row.expires_at,
    last_cursor: Number(row.last_cursor ?? 0),
    last_push_at: row.last_push_at ?? null,
    last_pull_at: row.last_pull_at ?? null,
    last_error_code: row.last_error_code ?? null,
  }
}

function parseMetaPlain(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null
  }
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function resolveQualifiedName(itemId: string, metaPlain: Record<string, unknown> | null): string | null {
  const fromMeta =
    metaPlain && typeof metaPlain.qualified_name === 'string'
      ? metaPlain.qualified_name.trim()
      : ''
  if (fromMeta) {
    return fromMeta
  }

  if (itemId.startsWith('storage::')) {
    const normalized = itemId.slice('storage::'.length).trim()
    return normalized || null
  }

  return null
}

function resolveCatalogCategory(
  itemType: string,
  itemId: string,
  qualifiedName: string | null
): { key: string, label: string } {
  const normalizedType = itemType.trim().toLowerCase()
  const normalizedQualified = (qualifiedName ?? '').toLowerCase()
  const normalizedItemId = itemId.toLowerCase()

  if (normalizedType === 'storage.snapshot') {
    if (normalizedQualified.includes('plugin')) {
      return { key: 'plugin', label: '插件数据' }
    }
    if (/(aisdk|intelligence)/.test(normalizedQualified)) {
      return { key: 'intelligence', label: '智能配置' }
    }
    if (
      /(app-setting|shortcut|setting|settings|config|theme-style|flow-consent|sentry|notification|telemetry|startup)/.test(
        normalizedQualified
      )
    ) {
      return { key: 'settings', label: '应用设置' }
    }
    if (
      /(openers|store|agent-store|everything|file-index|app-index|device-idle|search-engine)/.test(
        normalizedQualified
      )
    ) {
      return { key: 'launcher', label: '启动器与索引' }
    }
    return { key: 'storage', label: '其他存储快照' }
  }

  if (
    normalizedType.includes('blob')
    || normalizedItemId.startsWith('blob:')
    || normalizedItemId.startsWith('blob::')
  ) {
    return { key: 'blob', label: '大对象附件' }
  }

  return { key: 'other', label: '未分类数据' }
}

function maxIso(left: string, right: string): string {
  if (!left) {
    return right
  }
  if (!right) {
    return left
  }
  return left > right ? left : right
}

function normalizePayloadSize(value: unknown): number {
  const size = Number(value ?? 0)
  if (!Number.isFinite(size) || size < 0) {
    return 0
  }
  return Math.floor(size)
}

export async function getSyncItemCatalog(
  event: H3Event,
  userId: string,
  limit = 120
): Promise<SyncItemCatalog> {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)

  const safeLimit = Math.min(Math.max(Math.floor(limit) || 120, 20), 300)
  const rows = await db.prepare(`
    SELECT item_id, type, meta_plain, payload_size, updated_at, deleted_at, payload_enc, payload_ref
    FROM ${SYNC_ITEMS_TABLE}
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT ?
  `).bind(userId, safeLimit).all<{
    item_id: string
    type: string
    meta_plain: string | null
    payload_size: number | null
    updated_at: string
    deleted_at: string | null
    payload_enc: string | null
    payload_ref: string | null
  }>()

  const items: SyncCatalogItem[] = []
  const categoryMap = new Map<string, SyncCatalogCategory>()
  let deletedItems = 0
  let liveItems = 0
  let totalPayloadBytes = 0
  let lastUpdatedAt = ''

  for (const row of rows.results ?? []) {
    const metaPlain = parseMetaPlain(row.meta_plain)
    const qualifiedName = resolveQualifiedName(row.item_id, metaPlain)
    const category = resolveCatalogCategory(row.type, row.item_id, qualifiedName)
    const payloadSize = normalizePayloadSize(row.payload_size)
    const deletedAt = row.deleted_at ?? null
    const pluginId = typeof metaPlain?.plugin_id === 'string' ? metaPlain.plugin_id.trim() || null : null
    const pluginDisplayName =
      typeof metaPlain?.plugin_display_name === 'string'
        ? metaPlain.plugin_display_name.trim() || null
        : null
    const filePath = typeof metaPlain?.file_path === 'string' ? metaPlain.file_path.trim() || null : null
    const fileDisplayName =
      typeof metaPlain?.file_display_name === 'string'
        ? metaPlain.file_display_name.trim() || null
        : null
    const rawKind = metaPlain?.file_kind
    const kind = rawKind === 'settings' || rawKind === 'data' ? rawKind : null
    const sampleName = fileDisplayName || filePath || pluginDisplayName || qualifiedName || row.item_id

    items.push({
      item_id: row.item_id,
      type: row.type,
      qualified_name: qualifiedName,
      plugin_id: pluginId,
      plugin_display_name: pluginDisplayName,
      file_path: filePath,
      file_display_name: fileDisplayName,
      kind,
      storage_state: row.payload_ref ? 'blob' : 'inline',
      lifecycle_status: deletedAt ? 'deleted' : 'active',
      category: category.key,
      category_label: category.label,
      payload_size: payloadSize,
      updated_at: row.updated_at,
      deleted_at: deletedAt,
      has_payload_enc: Boolean(row.payload_enc),
      has_payload_ref: Boolean(row.payload_ref),
    })

    totalPayloadBytes += payloadSize
    lastUpdatedAt = maxIso(lastUpdatedAt, row.updated_at)
    if (deletedAt) {
      deletedItems += 1
    } else {
      liveItems += 1
    }

    const existing = categoryMap.get(category.key) ?? {
      key: category.key,
      label: category.label,
      count: 0,
      total_payload_bytes: 0,
      last_updated_at: '',
      sample_items: [],
    }
    existing.count += 1
    existing.total_payload_bytes += payloadSize
    existing.last_updated_at = maxIso(existing.last_updated_at, row.updated_at)
    if (existing.sample_items.length < 3 && !existing.sample_items.includes(sampleName)) {
      existing.sample_items.push(sampleName)
    }
    categoryMap.set(category.key, existing)
  }

  const categories = Array.from(categoryMap.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count
    }
    return left.key.localeCompare(right.key)
  })
  const blobUsageRows = await db.prepare(`
    SELECT status, COUNT(*) AS objects, COALESCE(SUM(size_bytes), 0) AS bytes
    FROM ${SYNC_BLOBS_TABLE}
    WHERE user_id = ?
    GROUP BY status
  `).bind(userId).all<{ status: string, objects: number, bytes: number }>()
  const emptyBlobUsage = (): SyncBlobUsageBucket => ({ bytes: 0, objects: 0 })
  const blobUsage: SyncBlobUsage = {
    active: emptyBlobUsage(),
    staged: emptyBlobUsage(),
    orphaned: emptyBlobUsage(),
    delete_failed: emptyBlobUsage(),
    deleted: emptyBlobUsage(),
  }
  for (const row of blobUsageRows.results ?? []) {
    if (!(row.status in blobUsage)) continue
    const bucket = blobUsage[row.status as keyof SyncBlobUsage]
    bucket.bytes = normalizePayloadSize(row.bytes)
    bucket.objects = Math.max(0, Math.floor(Number(row.objects ?? 0)))
  }


  return {
    summary: {
      total_items: items.length,
      live_items: liveItems,
      deleted_items: deletedItems,
      total_payload_bytes: totalPayloadBytes,
      last_updated_at: lastUpdatedAt,
    },
    blob_usage: blobUsage,
    categories,
    items,
    generated_at: new Date().toISOString(),
  }
}

export async function listRecentSyncActivities(
  event: H3Event,
  userId: string,
  limit = 24
): Promise<RecentSyncActivity[]> {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)

  const safeLimit = Math.min(Math.max(Math.floor(limit) || 24, 10), 200)
  const rows = await db.prepare(`
    SELECT
      o.cursor,
      o.device_id,
      o.item_id,
      o.op_type,
      o.updated_at,
      o.payload_size,
      s.last_error_code
    FROM ${SYNC_OPLOG_TABLE} o
    LEFT JOIN ${SYNC_SESSIONS_TABLE} s
      ON s.user_id = o.user_id AND s.device_id = o.device_id
    WHERE o.user_id = ?
    ORDER BY o.cursor DESC
    LIMIT ?
  `).bind(userId, safeLimit).all<{
    cursor: number
    device_id: string
    item_id: string
    op_type: string
    updated_at: string
    payload_size: number | null
    last_error_code: string | null
  }>()

  const latestCursorByDevice = new Map<string, number>()
  for (const row of rows.results ?? []) {
    const cursor = Number(row.cursor ?? 0)
    const previous = latestCursorByDevice.get(row.device_id) ?? -1
    if (cursor > previous) {
      latestCursorByDevice.set(row.device_id, cursor)
    }
  }

  return (rows.results ?? []).map((row) => {
    const cursor = Number(row.cursor ?? 0)
    const isLatestForDevice = latestCursorByDevice.get(row.device_id) === cursor
    const errorCode =
      isLatestForDevice && typeof row.last_error_code === 'string' && row.last_error_code.trim()
        ? row.last_error_code.trim()
        : null

    return {
      cursor,
      device_id: row.device_id,
      item_id: row.item_id,
      op_type: row.op_type === 'delete' ? 'delete' : 'upsert',
      updated_at: row.updated_at,
      payload_size: normalizePayloadSize(row.payload_size),
      status: errorCode ? 'failed' : 'success',
      error_code: errorCode,
    }
  })
}

export interface KeyringSecret {
  keyring_id: string
  device_id: string
  key_type: string
  encrypted_key: string
  rotated_at: string | null
  created_at: string
}

export async function listKeyrings(event: H3Event, userId: string): Promise<KeyringMeta[]> {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)

  const result = await db.prepare(`
    SELECT device_id, key_type, rotated_at, created_at, recovery_code_hash
    FROM ${SYNC_KEYRINGS_TABLE}
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).bind(userId).all<{ device_id: string, key_type: string, rotated_at: string | null, created_at: string, recovery_code_hash: string | null }>()

  return (result.results ?? []).map(row => ({
    keyring_id: `${userId}:${row.device_id}:${row.key_type}`,
    device_id: row.device_id,
    key_type: row.key_type,
    rotated_at: row.rotated_at ?? null,
    created_at: row.created_at,
    has_recovery_code: Boolean(row.recovery_code_hash),
  }))
}

export async function issueDeviceKey(
  event: H3Event,
  userId: string,
  payload: { targetDeviceId: string, keyType: string, encryptedKey: string, recoveryCodeHash?: string | null }
): Promise<{ keyringId: string }> {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)

  const targetDevice = await getDevice(event, userId, payload.targetDeviceId)
  if (!targetDevice || targetDevice.revokedAt) {
    throw createSyncError('DEVICE_NOT_AUTHORIZED', 403, 'Target device is not available')
  }

  const now = new Date().toISOString()
  const recoveryCodeHash = await maybeHashRecoveryCode(payload.recoveryCodeHash)
  await db.prepare(`
    INSERT INTO ${SYNC_KEYRINGS_TABLE} (user_id, device_id, key_type, encrypted_key, recovery_code_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, device_id, key_type) DO UPDATE SET
      encrypted_key = excluded.encrypted_key,
      recovery_code_hash = COALESCE(excluded.recovery_code_hash, ${SYNC_KEYRINGS_TABLE}.recovery_code_hash),
      created_at = excluded.created_at
  `).bind(
    userId,
    payload.targetDeviceId,
    payload.keyType,
    payload.encryptedKey,
    recoveryCodeHash,
    now,
  ).run()

  return { keyringId: `${userId}:${payload.targetDeviceId}:${payload.keyType}` }
}

async function verifyRecoveryCode(recoveryCode: string, stored: string): Promise<boolean> {
  const [hash, salt] = stored.split(':')
  if (!hash || !salt)
    return false
  return verifyPassword(recoveryCode, salt, hash)
}

export async function recoverKeyrings(
  event: H3Event,
  userId: string,
  payload: { recoveryCode: string }
): Promise<KeyringSecret[]> {
  const db = requireDatabase(event)
  await ensureSyncSchemaV1(db)

  const result = await db.prepare(`
    SELECT device_id, key_type, encrypted_key, rotated_at, created_at, recovery_code_hash
    FROM ${SYNC_KEYRINGS_TABLE}
    WHERE user_id = ?
  `).bind(userId).all<{ device_id: string, key_type: string, encrypted_key: string, rotated_at: string | null, created_at: string, recovery_code_hash: string | null }>()

  const rows = result.results ?? []
  const candidates = rows.filter(row => typeof row.recovery_code_hash === 'string' && row.recovery_code_hash.length > 0)

  let matchedDeviceId: string | null = null
  for (const row of candidates) {
    if (await verifyRecoveryCode(payload.recoveryCode, row.recovery_code_hash!)) {
      matchedDeviceId = row.device_id
      break
    }
  }

  if (!matchedDeviceId) {
    throw createSyncError('DEVICE_NOT_AUTHORIZED', 403, 'Invalid recovery code')
  }

  // Only the device whose code matched. This used to map over every row for the user, so
  // knowing one device's recovery code — written down, screenshotted, or leaked from an old
  // machine — handed back the encrypted key material of the entire fleet, including devices
  // with a different recovery code or none at all (#904).
  //
  // Every key_type of the matched device is returned, because the code is stored per keyring
  // row and a device's keyring is only useful complete.
  return rows
    .filter(row => row.device_id === matchedDeviceId)
    .map(row => ({
    keyring_id: `${userId}:${row.device_id}:${row.key_type}`,
    device_id: row.device_id,
    key_type: row.key_type,
    encrypted_key: row.encrypted_key,
    rotated_at: row.rotated_at ?? null,
    created_at: row.created_at,
  }))
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
  return touchDevice(event, userId, deviceId, readDeviceMetadata(event))
}
