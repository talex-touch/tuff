import { describe, it, expect, vi, afterEach } from 'vitest'
import type { H3Event } from 'h3'
import {
  getSyncSession,
  handshakeSyncSession,
  pullSyncItemsV1,
  pushSyncItemsV1,
  uploadSyncBlob,
  validateQuota,
  type SyncItemInput,
} from '../syncStoreV1'

vi.mock('../platformGovernanceStore', async () => {
  const actual = await vi.importActual<typeof import('../platformGovernanceStore')>('../platformGovernanceStore')
  return {
    ...actual,
    assertStorageChannelPolicy: vi.fn(async () => undefined),
    recordStorageChannelUsage: vi.fn(async () => ({})),
  }
})

interface OplogRow {
  cursor: number
  user_id: string
  device_id: string
  op_seq: number
  op_hash: string
  item_id: string
  op_type: string
  updated_at: string
  payload_size: number | null
}

interface ItemRow {
  user_id: string
  item_id: string
  type: string
  schema_version: number
  payload_enc: string | null
  payload_ref: string | null
  meta_plain: string | null
  payload_size: number | null
  updated_at: string
  deleted_at: string | null
  updated_by_device_id: string | null
}

interface BlobRow {
  user_id: string
  blob_id: string
  object_key: string
  sha256: string
  size_bytes: number
  content_type: string | null
  created_at: string
  status: string
}

interface SessionRow {
  user_id: string
  device_id: string
  sync_token: string
  expires_at: string
  last_cursor: number
  last_push_at: string | null
  last_pull_at: string | null
  last_error_code: string | null
}

interface QuotaRow {
  user_id: string
  storage_limit_bytes: number
  object_limit: number
  item_limit: number
  device_limit: number
  used_storage_bytes: number
  used_objects: number
  used_devices: number
  updated_at: string
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

interface MockResult {
  results?: unknown[]
  meta?: { changes: number }
}

interface DatabaseSnapshot {
  cursor: number
  oplog: Map<string, OplogRow>
  items: Map<string, ItemRow>
  blobs: Map<string, BlobRow>
  sessions: Map<string, SessionRow>
  quotas: Map<string, QuotaRow>
}

function decodeJsonArray(value: unknown): unknown[] {
  if (typeof value !== 'string')
    return []

  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    return []
  }
}

function isSyncWriteRow(value: unknown): value is SyncWriteRow {
  if (!value || typeof value !== 'object')
    return false

  const row = value as Record<string, unknown>
  return typeof row.itemId === 'string'
    && typeof row.type === 'string'
    && typeof row.schemaVersion === 'number'
    && (typeof row.payloadEnc === 'string' || row.payloadEnc === null)
    && (typeof row.payloadRef === 'string' || row.payloadRef === null)
    && (typeof row.metaPlain === 'string' || row.metaPlain === null)
    && typeof row.payloadSize === 'number'
    && typeof row.updatedAt === 'string'
    && (typeof row.deletedAt === 'string' || row.deletedAt === null)
    && typeof row.opSeq === 'number'
    && typeof row.opHash === 'string'
    && (row.opType === 'upsert' || row.opType === 'delete')
}

function decodeSyncWriteRows(value: unknown): SyncWriteRow[] {
  return decodeJsonArray(value).filter(isSyncWriteRow)
}

function decodeStringValues(value: unknown): string[] {
  return decodeJsonArray(value).filter((entry): entry is string => typeof entry === 'string')
}

function decodeNumberValues(value: unknown): number[] {
  return decodeJsonArray(value)
    .filter((entry): entry is number => typeof entry === 'number' && Number.isInteger(entry))
}

class MockStatement {
  args: unknown[] = []

  constructor(readonly db: MockD1Database, readonly sql: string) {}

  bind(...args: unknown[]) {
    this.args = args
    return this
  }

  async run() {
    return this.db.run(this.sql, this.args)
  }

  async first<T = unknown>() {
    return this.db.first<T>(this.sql, this.args)
  }

  async all<T = unknown>() {
    return { results: this.db.all<T>(this.sql, this.args) }
  }
}

class MockD1Database {
  cursor = 0
  batchCalls = 0
  executedStatementCount = 0
  failAtomicBatchStatementAt: number | null = null
  oplog = new Map<string, OplogRow>()
  items = new Map<string, ItemRow>()
  blobs = new Map<string, BlobRow>()
  sessions = new Map<string, SessionRow>()
  quotas = new Map<string, QuotaRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  async batch(statements: MockStatement[]): Promise<MockResult[]> {
    this.batchCalls += 1
    this.executedStatementCount += statements.length
    const snapshot = this.takeSnapshot()
    const isAtomicWriteBatch = statements.some(statement => statement.sql.includes('INSERT OR IGNORE INTO sync_oplog_v1'))

    try {
      const results: MockResult[] = []
      for (const [index, statement] of statements.entries()) {
        if (isAtomicWriteBatch && this.failAtomicBatchStatementAt === index)
          throw new Error('Forced D1 batch failure')
        results.push(this.execute(statement.sql, statement.args))
      }
      return results
    }
    catch (error) {
      this.restoreSnapshot(snapshot)
      throw error
    }
  }

  run(sql: string, args: unknown[]): MockResult {
    return this.execute(sql, args)
  }

  first<T>(sql: string, args: unknown[]): T | null {
    const result = this.firstResult(sql, args)
    return result as T | null
  }

  all<T>(sql: string, args: unknown[]): T[] {
    const result = this.allResult(sql, args)
    return result as T[]
  }

  private execute(sql: string, args: unknown[]): MockResult {
    if (sql.includes('SELECT item_id, updated_at, updated_by_device_id, payload_size, deleted_at') && sql.includes('json_each')) {
      const [itemIdsJson, userId] = args
      const rows = decodeStringValues(itemIdsJson)
        .map(itemId => this.items.get(`${String(userId)}:${itemId}`))
        .filter((row): row is ItemRow => Boolean(row))
        .map(row => ({
          item_id: row.item_id,
          updated_at: row.updated_at,
          updated_by_device_id: row.updated_by_device_id,
          payload_size: row.payload_size,
          deleted_at: row.deleted_at,
        }))
      return { results: rows }
    }

    if (sql.includes('SELECT op_seq') && sql.includes('sync_oplog_v1') && sql.includes('json_each')) {
      const [opSeqsJson, userId, deviceId] = args
      const rows = decodeNumberValues(opSeqsJson)
        .filter(opSeq => this.oplog.has(`${String(userId)}:${String(deviceId)}:${opSeq}`))
        .map(op_seq => ({ op_seq }))
      return { results: rows }
    }

    if (sql.includes('AS used_storage_bytes') && sql.includes('FROM sync_items_v1')) {
      const [userId] = args
      return { results: [this.getUsage(String(userId))] }
    }

    if (sql.includes('INSERT OR IGNORE INTO sync_oplog_v1')) {
      const [rowsJson, userId, deviceId] = args
      let changes = 0
      for (const row of decodeSyncWriteRows(rowsJson)) {
        const itemKey = `${String(userId)}:${row.itemId}`
        const existingItem = this.items.get(itemKey)
        if (existingItem && !this.isNewer(row.updatedAt, existingItem.updated_at, String(deviceId), existingItem.updated_by_device_id))
          continue

        const key = `${String(userId)}:${String(deviceId)}:${row.opSeq}`
        if (this.oplog.has(key))
          continue

        this.cursor += 1
        this.oplog.set(key, {
          cursor: this.cursor,
          user_id: String(userId),
          device_id: String(deviceId),
          op_seq: row.opSeq,
          op_hash: row.opHash,
          item_id: row.itemId,
          op_type: row.opType,
          updated_at: row.updatedAt,
          payload_size: row.payloadSize,
        })
        changes += 1
      }
      return { meta: { changes } }
    }

    if (sql.includes('INSERT INTO sync_items_v1') && sql.includes('JOIN sync_oplog_v1')) {
      const [rowsJson, userId, deviceId] = args
      let changes = 0
      for (const row of decodeSyncWriteRows(rowsJson)) {
        const oplog = this.oplog.get(`${String(userId)}:${String(deviceId)}:${row.opSeq}`)
        if (!oplog
          || oplog.op_hash !== row.opHash
          || oplog.item_id !== row.itemId
          || oplog.op_type !== row.opType
          || oplog.updated_at !== row.updatedAt) {
          continue
        }

        const key = `${String(userId)}:${row.itemId}`
        const existing = this.items.get(key)
        if (existing && !this.isNewer(row.updatedAt, existing.updated_at, String(deviceId), existing.updated_by_device_id))
          continue

        this.items.set(key, {
          user_id: String(userId),
          item_id: row.itemId,
          type: row.type,
          schema_version: row.schemaVersion,
          payload_enc: row.payloadEnc,
          payload_ref: row.payloadRef,
          meta_plain: row.metaPlain,
          payload_size: row.payloadSize,
          updated_at: row.updatedAt,
          deleted_at: row.deletedAt,
          updated_by_device_id: String(deviceId),
        })
        changes += 1
      }
      return { meta: { changes } }
    }

    if (sql.includes('UPDATE sync_quotas_v1') && sql.includes('RETURNING used_storage_bytes')) {
      const [userId, updatedAt] = args
      const quota = this.quotas.get(String(userId))
      if (!quota)
        return { results: [] }

      const usage = this.getUsage(String(userId))
      if (usage.used_storage_bytes > quota.storage_limit_bytes || usage.used_objects > quota.object_limit)
        throw new Error('NOT NULL constraint failed: sync_quotas_v1.used_storage_bytes')

      quota.used_storage_bytes = usage.used_storage_bytes
      quota.used_objects = usage.used_objects
      quota.updated_at = String(updatedAt)
      return { results: [usage] }
    }

    if (sql.includes('UPDATE sync_sessions_v1') && sql.includes('SET last_cursor = COALESCE')) {
      const [userId, deviceId, lastPushAt] = args
      const session = this.sessions.get(`${String(userId)}:${String(deviceId)}`)
      if (!session)
        return { meta: { changes: 0 } }

      session.last_cursor = this.getCursor(String(userId))
      session.last_push_at = String(lastPushAt)
      session.last_error_code = null
      return { meta: { changes: 1 } }
    }

    if (sql.includes('SELECT COALESCE(MAX(cursor), 0) AS cursor')) {
      const [userId] = args
      return { results: [{ cursor: this.getCursor(String(userId)) }] }
    }

    if (sql.includes('INSERT INTO sync_blobs_v1')) {
      const [userId, blobId, objectKey, sha256, sizeBytes, contentType, createdAt, status] = args
      const key = `${String(userId)}:${String(blobId)}`
      this.blobs.set(key, {
        user_id: String(userId),
        blob_id: String(blobId),
        object_key: String(objectKey),
        sha256: String(sha256),
        size_bytes: Number(sizeBytes),
        content_type: typeof contentType === 'string' ? contentType : null,
        created_at: String(createdAt),
        status: String(status),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO sync_sessions_v1')) {
      const [userId, deviceId, syncToken, expiresAt, lastCursor] = args
      const key = `${String(userId)}:${String(deviceId)}`
      const existing = this.sessions.get(key)
      this.sessions.set(key, {
        user_id: String(userId),
        device_id: String(deviceId),
        sync_token: String(syncToken),
        expires_at: String(expiresAt),
        last_cursor: Number(lastCursor),
        last_push_at: existing?.last_push_at ?? null,
        last_pull_at: existing?.last_pull_at ?? null,
        last_error_code: existing?.last_error_code ?? null,
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO sync_quotas_v1')) {
      const [userId, storageLimit, objectLimit, itemLimit, deviceLimit, usedStorage, usedObjects, usedDevices, updatedAt] = args
      this.quotas.set(String(userId), {
        user_id: String(userId),
        storage_limit_bytes: Number(storageLimit),
        object_limit: Number(objectLimit),
        item_limit: Number(itemLimit),
        device_limit: Number(deviceLimit),
        used_storage_bytes: Number(usedStorage),
        used_objects: Number(usedObjects),
        used_devices: Number(usedDevices),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE sync_quotas_v1')) {
      const userId = String(args.at(-1))
      const row = this.quotas.get(userId)
      if (!row)
        return { meta: { changes: 0 } }

      if (sql.includes('SET storage_limit_bytes')) {
        const [storageLimit, objectLimit, itemLimit, deviceLimit, usedDevices, updatedAt] = args
        row.storage_limit_bytes = Number(storageLimit)
        row.object_limit = Number(objectLimit)
        row.item_limit = Number(itemLimit)
        row.device_limit = Number(deviceLimit)
        row.used_devices = Number(usedDevices)
        row.updated_at = String(updatedAt)
      }
      else if (sql.includes('SET used_devices')) {
        const [usedDevices, updatedAt] = args
        row.used_devices = Number(usedDevices)
        row.updated_at = String(updatedAt)
      }
      else if (sql.includes('SET used_storage_bytes')) {
        const [storageDelta, , objectsDelta, , updatedAt] = args
        row.used_storage_bytes = Math.max(0, row.used_storage_bytes + Number(storageDelta))
        row.used_objects = Math.max(0, row.used_objects + Number(objectsDelta))
        row.updated_at = String(updatedAt)
      }
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE sync_sessions_v1')) {
      const [lastCursor, userId, deviceId] = args
      const session = this.sessions.get(`${String(userId)}:${String(deviceId)}`)
      if (!session)
        return { meta: { changes: 0 } }

      session.last_cursor = Number(lastCursor)
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }

  private firstResult(sql: string, args: unknown[]): unknown {
    if (sql.includes('SELECT updated_at') && sql.includes('sync_items_v1')) {
      const [userId, itemId] = args
      const row = this.items.get(`${String(userId)}:${String(itemId)}`)
      if (!row)
        return null
      return {
        updated_at: row.updated_at,
        updated_by_device_id: row.updated_by_device_id,
        payload_size: row.payload_size,
        deleted_at: row.deleted_at,
      }
    }

    if (sql.includes('FROM sync_oplog_v1') && sql.includes('op_seq')) {
      const [userId, deviceId, opSeq] = args
      const row = this.oplog.get(`${String(userId)}:${String(deviceId)}:${Number(opSeq)}`)
      return row ? { cursor: row.cursor } : null
    }

    if (sql.includes('FROM sync_sessions_v1')) {
      const [userId, deviceId] = args
      return this.sessions.get(`${String(userId)}:${String(deviceId)}`) ?? null
    }

    if (sql.includes('SELECT MAX(cursor)')) {
      const [userId] = args
      return { cursor: this.getCursor(String(userId)) }
    }

    if (sql.includes('FROM auth_devices') && sql.includes('COUNT'))
      return { total: 0 }

    if (sql.includes('SELECT * FROM sync_quotas_v1')) {
      const [userId] = args
      return this.quotas.get(String(userId)) ?? null
    }

    return null
  }

  private allResult(sql: string, args: unknown[]): unknown[] {
    if (sql.includes('FROM sync_oplog_v1')) {
      const [userId, cursor, limit] = args
      return Array.from(this.oplog.values())
        .filter(row => row.user_id === String(userId) && row.cursor > Number(cursor))
        .sort((left, right) => left.cursor - right.cursor)
        .slice(0, Number(limit))
        .map(row => ({
          cursor: row.cursor,
          item_id: row.item_id,
          op_seq: row.op_seq,
          op_hash: row.op_hash,
          op_type: row.op_type,
          updated_at: row.updated_at,
          device_id: row.device_id,
        }))
    }

    if (sql.includes('FROM sync_items_v1') && sql.includes('item_id IN')) {
      const [userId, ...itemIds] = args
      return itemIds
        .map(itemId => this.items.get(`${String(userId)}:${String(itemId)}`))
        .filter((row): row is ItemRow => Boolean(row))
    }

    return []
  }

  private getUsage(userId: string) {
    const liveItems = Array.from(this.items.values()).filter(item => item.user_id === userId && !item.deleted_at)
    return {
      used_storage_bytes: liveItems.reduce((total, item) => total + Number(item.payload_size ?? 0), 0),
      used_objects: liveItems.length,
    }
  }

  private getCursor(userId: string) {
    return Array.from(this.oplog.values())
      .filter(row => row.user_id === userId)
      .reduce((maximum, row) => Math.max(maximum, row.cursor), 0)
  }

  private isNewer(candidateUpdatedAt: string, existingUpdatedAt: string, candidateDeviceId: string, existingDeviceId: string | null) {
    if (candidateUpdatedAt !== existingUpdatedAt)
      return candidateUpdatedAt > existingUpdatedAt
    return !existingDeviceId || candidateDeviceId > existingDeviceId
  }

  private takeSnapshot(): DatabaseSnapshot {
    return {
      cursor: this.cursor,
      oplog: new Map(Array.from(this.oplog, ([key, row]) => [key, { ...row }] as const)),
      items: new Map(Array.from(this.items, ([key, row]) => [key, { ...row }] as const)),
      blobs: new Map(Array.from(this.blobs, ([key, row]) => [key, { ...row }] as const)),
      sessions: new Map(Array.from(this.sessions, ([key, row]) => [key, { ...row }] as const)),
      quotas: new Map(Array.from(this.quotas, ([key, row]) => [key, { ...row }] as const)),
    }
  }

  private restoreSnapshot(snapshot: DatabaseSnapshot) {
    this.cursor = snapshot.cursor
    this.oplog = snapshot.oplog
    this.items = snapshot.items
    this.blobs = snapshot.blobs
    this.sessions = snapshot.sessions
    this.quotas = snapshot.quotas
  }
}

class MockR2Bucket {
  objects = new Map<string, Uint8Array>()
  attempts = 0
  failWrites = 0

  async put(key: string, value: Uint8Array) {
    this.attempts += 1
    if (this.attempts <= this.failWrites) {
      throw Object.assign(new Error('Transient R2 write failure'), {
        statusCode: 503,
      })
    }
    this.objects.set(key, value)
  }
}

function createEvent(db: MockD1Database, bucket?: MockR2Bucket): H3Event {
  return {
    context: {
      cloudflare: {
        env: {
          DB: db,
          R2: bucket,
        },
      },
    },
    node: {
      req: {
        headers: {},
      },
    },
  } as unknown as H3Event
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('syncStoreV1 push', () => {
  it('is idempotent for repeated op_seq', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)
    const item: SyncItemInput = {
      item_id: 'note-1',
      type: 'note',
      schema_version: 1,
      payload_enc: 'enc',
      payload_ref: null,
      meta_plain: { title: 'hello' },
      payload_size: 12,
      updated_at: '2026-02-04T00:00:00.000Z',
      deleted_at: null,
      op_seq: 1,
      op_hash: 'hash-1',
      op_type: 'upsert',
    }

    const first = await pushSyncItemsV1(event, 'user-1', 'device-1', [item])
    expect(first.appliedObjectsDelta).toBe(1)
    expect(first.ackCursor).toBe(1)

    const second = await pushSyncItemsV1(event, 'user-1', 'device-1', [item])
    expect(second.appliedObjectsDelta).toBe(0)
    expect(second.ackCursor).toBe(1)
  })

  it('applies only the first operation when one push repeats an op_seq', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)

    const result = await pushSyncItemsV1(event, 'user-1', 'device-1', [
      {
        item_id: 'first-item',
        type: 'note',
        schema_version: 1,
        payload_enc: 'first',
        payload_ref: null,
        meta_plain: null,
        payload_size: 8,
        updated_at: '2026-02-04T00:00:00.000Z',
        deleted_at: null,
        op_seq: 7,
        op_hash: 'first-hash',
        op_type: 'upsert',
      },
      {
        item_id: 'second-item',
        type: 'note',
        schema_version: 1,
        payload_enc: 'second',
        payload_ref: null,
        meta_plain: null,
        payload_size: 12,
        updated_at: '2026-02-04T00:01:00.000Z',
        deleted_at: null,
        op_seq: 7,
        op_hash: 'second-hash',
        op_type: 'upsert',
      },
    ])

    expect(result).toMatchObject({
      ackCursor: 1,
      appliedStorageDelta: 8,
      appliedObjectsDelta: 1,
      conflicts: [],
    })
    expect(Array.from(db.oplog.values())).toMatchObject([
      { item_id: 'first-item', op_seq: 7, op_hash: 'first-hash' },
    ])
    expect(db.items.get('user-1:first-item')).toMatchObject({ payload_enc: 'first', payload_size: 8 })
    expect(db.items.has('user-1:second-item')).toBe(false)
    expect(db.quotas.get('user-1')).toMatchObject({ used_storage_bytes: 8, used_objects: 1 })
  })

  it('keeps timestamp tie precedence by device id and lets a null existing device yield', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)
    const updatedAt = '2026-02-04T00:00:00.000Z'
    db.items.set('user-1:tie-item', {
      user_id: 'user-1',
      item_id: 'tie-item',
      type: 'note',
      schema_version: 1,
      payload_enc: 'server',
      payload_ref: null,
      meta_plain: null,
      payload_size: 2,
      updated_at: updatedAt,
      deleted_at: null,
      updated_by_device_id: 'device-b',
    })
    db.items.set('user-1:null-device-item', {
      user_id: 'user-1',
      item_id: 'null-device-item',
      type: 'note',
      schema_version: 1,
      payload_enc: 'server-null-device',
      payload_ref: null,
      meta_plain: null,
      payload_size: 3,
      updated_at: updatedAt,
      deleted_at: null,
      updated_by_device_id: null,
    })

    const losingResult = await pushSyncItemsV1(event, 'user-1', 'device-a', [{
      item_id: 'tie-item',
      type: 'note',
      schema_version: 1,
      payload_enc: 'losing',
      payload_ref: null,
      meta_plain: null,
      payload_size: 4,
      updated_at: updatedAt,
      deleted_at: null,
      op_seq: 1,
      op_hash: 'tie-losing',
      op_type: 'upsert',
    }])
    expect(losingResult.conflicts).toEqual([{
      item_id: 'tie-item',
      server_updated_at: updatedAt,
      server_device_id: 'device-b',
    }])
    expect(db.items.get('user-1:tie-item')).toMatchObject({ payload_enc: 'server', updated_by_device_id: 'device-b' })

    const winningResult = await pushSyncItemsV1(event, 'user-1', 'device-z', [{
      item_id: 'tie-item',
      type: 'note',
      schema_version: 1,
      payload_enc: 'winning',
      payload_ref: null,
      meta_plain: null,
      payload_size: 4,
      updated_at: updatedAt,
      deleted_at: null,
      op_seq: 1,
      op_hash: 'tie-winning',
      op_type: 'upsert',
    }])
    expect(winningResult.conflicts).toEqual([])
    expect(db.items.get('user-1:tie-item')).toMatchObject({ payload_enc: 'winning', updated_by_device_id: 'device-z' })

    const nullDeviceResult = await pushSyncItemsV1(event, 'user-1', 'device-a', [{
      item_id: 'null-device-item',
      type: 'note',
      schema_version: 1,
      payload_enc: 'candidate',
      payload_ref: null,
      meta_plain: null,
      payload_size: 5,
      updated_at: updatedAt,
      deleted_at: null,
      op_seq: 2,
      op_hash: 'null-device-wins',
      op_type: 'upsert',
    }])
    expect(nullDeviceResult.conflicts).toEqual([])
    expect(db.items.get('user-1:null-device-item')).toMatchObject({ payload_enc: 'candidate', updated_by_device_id: 'device-a' })
  })

  it('pushes 1,001 small items with bounded D1 batch work', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)
    const items: SyncItemInput[] = Array.from({ length: 1001 }, (_, index) => ({
      item_id: `bulk-${index}`,
      type: 'note',
      schema_version: 1,
      payload_enc: 'x',
      payload_ref: null,
      meta_plain: null,
      payload_size: 1,
      updated_at: '2026-02-04T00:00:00.000Z',
      deleted_at: null,
      op_seq: index + 1,
      op_hash: `hash-${index}`,
      op_type: 'upsert',
    }))

    const result = await pushSyncItemsV1(event, 'user-1', 'device-1', items)

    expect(result).toMatchObject({ ackCursor: 1001, appliedStorageDelta: 1001, appliedObjectsDelta: 1001, conflicts: [] })
    expect(db.items.size).toBe(1001)
    expect(db.oplog.size).toBe(1001)
    expect(db.quotas.get('user-1')).toMatchObject({ used_storage_bytes: 1001, used_objects: 1001 })
    expect(db.batchCalls).toBe(2)
    expect(db.executedStatementCount).toBeLessThan(16)
  })

  it('records conflicts when server has newer updated_at', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)
    db.items.set('user-1:note-2', {
      user_id: 'user-1',
      item_id: 'note-2',
      type: 'note',
      schema_version: 1,
      payload_enc: null,
      payload_ref: null,
      meta_plain: null,
      payload_size: 0,
      updated_at: '2026-02-04T00:00:00.000Z',
      deleted_at: null,
      updated_by_device_id: 'device-b',
    })

    const item: SyncItemInput = {
      item_id: 'note-2',
      type: 'note',
      schema_version: 1,
      payload_enc: null,
      payload_ref: null,
      meta_plain: null,
      payload_size: 0,
      updated_at: '2026-02-03T00:00:00.000Z',
      deleted_at: null,
      op_seq: 2,
      op_hash: 'hash-2',
      op_type: 'upsert',
    }

    const result = await pushSyncItemsV1(event, 'user-1', 'device-a', [item])
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].server_updated_at).toBe('2026-02-04T00:00:00.000Z')
    expect(result.conflicts[0].server_device_id).toBe('device-b')
  })

  it('computes quota delta and reconciles live usage for updates and tombstones', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)
    db.items.set('user-1:item-1', {
      user_id: 'user-1',
      item_id: 'item-1',
      type: 'note',
      schema_version: 1,
      payload_enc: 'enc',
      payload_ref: null,
      meta_plain: null,
      payload_size: 10,
      updated_at: '2026-02-03T00:00:00.000Z',
      deleted_at: null,
      updated_by_device_id: 'device-a',
    })

    const updateItem: SyncItemInput = {
      item_id: 'item-1',
      type: 'note',
      schema_version: 1,
      payload_enc: 'enc',
      payload_ref: null,
      meta_plain: null,
      payload_size: 15,
      updated_at: '2026-02-04T00:00:00.000Z',
      deleted_at: null,
      op_seq: 1,
      op_hash: 'hash-update',
      op_type: 'upsert',
    }

    const updateResult = await pushSyncItemsV1(event, 'user-1', 'device-a', [updateItem])
    expect(updateResult.appliedObjectsDelta).toBe(0)
    expect(updateResult.appliedStorageDelta).toBe(5)

    const deleteItem: SyncItemInput = {
      item_id: 'item-1',
      type: 'note',
      schema_version: 1,
      payload_enc: null,
      payload_ref: null,
      meta_plain: null,
      payload_size: null,
      updated_at: '2026-02-05T00:00:00.000Z',
      deleted_at: null,
      op_seq: 2,
      op_hash: 'hash-delete',
      op_type: 'delete',
    }

    const deleteResult = await pushSyncItemsV1(event, 'user-1', 'device-a', [deleteItem])
    expect(deleteResult.appliedObjectsDelta).toBe(-1)
    expect(deleteResult.appliedStorageDelta).toBe(-15)
    expect(db.items.get('user-1:item-1')).toMatchObject({
      payload_size: 15,
      deleted_at: '2026-02-05T00:00:00.000Z',
    })
    expect(db.quotas.get('user-1')).toMatchObject({ used_storage_bytes: 0, used_objects: 0 })
  })

  it('rolls back oplog, items, quota, and session when the atomic batch fails', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)
    const baselineItem: ItemRow = {
      user_id: 'user-1',
      item_id: 'baseline-item',
      type: 'note',
      schema_version: 1,
      payload_enc: 'baseline',
      payload_ref: null,
      meta_plain: null,
      payload_size: 7,
      updated_at: '2026-02-03T00:00:00.000Z',
      deleted_at: null,
      updated_by_device_id: 'device-1',
    }
    const baselineQuota: QuotaRow = {
      user_id: 'user-1',
      storage_limit_bytes: 1024 * 1024,
      object_limit: 50000,
      item_limit: 1024 * 1024,
      device_limit: 3,
      used_storage_bytes: 7,
      used_objects: 1,
      used_devices: 0,
      updated_at: '2026-02-03T00:00:00.000Z',
    }
    db.items.set('user-1:baseline-item', baselineItem)
    db.quotas.set('user-1', baselineQuota)
    await handshakeSyncSession(event, 'user-1', 'device-1')
    const session = db.sessions.get('user-1:device-1')
    if (!session)
      throw new Error('Handshake did not create a sync session')
    const baselineSession = { ...session }
    const expectedQuota = { ...baselineQuota }

    db.failAtomicBatchStatementAt = 4
    await expect(pushSyncItemsV1(event, 'user-1', 'device-1', [{
      item_id: 'new-item',
      type: 'note',
      schema_version: 1,
      payload_enc: 'new',
      payload_ref: null,
      meta_plain: null,
      payload_size: 10,
      updated_at: '2026-02-04T00:00:00.000Z',
      deleted_at: null,
      op_seq: 1,
      op_hash: 'new-item-hash',
      op_type: 'upsert',
    }])).rejects.toThrow('Forced D1 batch failure')

    expect(db.cursor).toBe(0)
    expect(db.oplog.size).toBe(0)
    expect(db.items.get('user-1:baseline-item')).toEqual(baselineItem)
    expect(db.items.has('user-1:new-item')).toBe(false)
    expect(db.quotas.get('user-1')).toEqual(expectedQuota)
    expect(db.sessions.get('user-1:device-1')).toEqual(baselineSession)
  })
})

describe('syncStoreV1 flow', () => {
  it('supports handshake -> push -> pull', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)

    const handshake = await handshakeSyncSession(event, 'user-1', 'device-1')
    expect(handshake.serverCursor).toBe(0)

    const item: SyncItemInput = {
      item_id: 'note-3',
      type: 'note',
      schema_version: 1,
      payload_enc: 'enc',
      payload_ref: null,
      meta_plain: { title: 'hi' },
      payload_size: 9,
      updated_at: '2026-02-04T00:00:00.000Z',
      deleted_at: null,
      op_seq: 1,
      op_hash: 'hash-3',
      op_type: 'upsert',
    }
    await pushSyncItemsV1(event, 'user-1', 'device-1', [item])

    const pulled = await pullSyncItemsV1(event, 'user-1', 'device-1', 0, 10)
    expect(pulled.oplog).toHaveLength(1)
    expect(pulled.items).toHaveLength(1)
    expect(pulled.nextCursor).toBe(1)
  })

  it('uploads blob metadata and stores object', async () => {
    const db = new MockD1Database()
    const bucket = new MockR2Bucket()
    const event = createEvent(db, bucket)
    const data = new TextEncoder().encode('hello')
    const file = {
      size: data.length,
      type: 'text/plain',
      arrayBuffer: async () => data.buffer,
    } as File

    const result = await uploadSyncBlob(event, 'user-1', file)
    expect(result.blobId).toBeTruthy()
    expect(bucket.objects.has(result.objectKey)).toBe(true)
    expect(result.storageChannel).toBe('r2')
    expect(result.storageProvider).toBe('cloudflare-r2')
  })

  it('retries transient R2 blob writes and returns recovered upload metadata', async () => {
    const db = new MockD1Database()
    const bucket = new MockR2Bucket()
    bucket.failWrites = 2
    const event = createEvent(db, bucket)
    const data = new TextEncoder().encode('hello')
    const file = {
      size: data.length,
      type: 'text/plain',
      arrayBuffer: async () => data.buffer,
    } as File

    const result = await uploadSyncBlob(event, 'user-1', file)

    expect(bucket.attempts).toBe(3)
    expect(bucket.objects.has(result.objectKey)).toBe(true)
    expect(result.uploadRetry).toMatchObject({
      retryable: true,
      recovered: true,
      retryCount: 2,
      maxRetries: 2,
      attempts: 3,
      nextRetryDelayMs: 0,
      storageChannel: 'r2',
      storageProvider: 'cloudflare-r2',
      storageOperation: 'storage.write',
      storageStatusCode: 503,
    })
  })
})

describe('syncStoreV1 session', () => {
  it('rejects invalid sync token', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)
    const handshake = await handshakeSyncSession(event, 'user-1', 'device-1')
    await expect(getSyncSession(event, 'user-1', 'device-1', `${handshake.syncToken}-bad`))
      .rejects
      .toMatchObject({ data: { errorCode: 'SYNC_INVALID_TOKEN' } })
  })

  it('accepts valid sync token', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)
    const handshake = await handshakeSyncSession(event, 'user-1', 'device-1')
    const session = await getSyncSession(event, 'user-1', 'device-1', handshake.syncToken)
    expect(session.syncToken).toBe(handshake.syncToken)
  })
})

describe('syncStoreV1 quota validation', () => {
  it('returns QUOTA_ITEM_EXCEEDED when item size exceeds limit', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)
    const result = await validateQuota(event, 'user-1', {
      storageDelta: 0,
      objectsDelta: 0,
      itemSize: 6 * 1024 * 1024,
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('QUOTA_ITEM_EXCEEDED')
  })
})
