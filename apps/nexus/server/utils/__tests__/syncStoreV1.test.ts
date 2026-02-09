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

class MockStatement {
  args: any[] = []
  constructor(private db: MockD1Database, private sql: string) {}

  bind(...args: any[]) {
    this.args = args
    return this
  }

  async run() {
    return this.db.run(this.sql, this.args)
  }

  async first<T = any>() {
    return this.db.first(this.sql, this.args) as T
  }

  async all<T = any>() {
    return { results: this.db.all(this.sql, this.args) as T[] }
  }
}

class MockD1Database {
  cursor = 0
  oplog = new Map<string, OplogRow>()
  items = new Map<string, ItemRow>()
  blobs = new Map<string, BlobRow>()
  sessions = new Map<string, { user_id: string; device_id: string; sync_token: string; expires_at: string; last_cursor: number }>()
  quotas = new Map<string, {
    user_id: string
    storage_limit_bytes: number
    object_limit: number
    item_limit: number
    device_limit: number
    used_storage_bytes: number
    used_objects: number
    used_devices: number
    updated_at: string
  }>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('INSERT OR IGNORE INTO sync_oplog_v1')) {
      const [userId, deviceId, opSeq, opHash, itemId, opType, updatedAt, payloadSize] = args
      const key = `${userId}:${deviceId}:${opSeq}`
      if (this.oplog.has(key))
        return { meta: { changes: 0 } }
      this.cursor += 1
      this.oplog.set(key, {
        cursor: this.cursor,
        user_id: userId,
        device_id: deviceId,
        op_seq: Number(opSeq),
        op_hash: String(opHash),
        item_id: String(itemId),
        op_type: String(opType),
        updated_at: String(updatedAt),
        payload_size: payloadSize == null ? null : Number(payloadSize),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO sync_items_v1')) {
      const [userId, itemId, type, schemaVersion, payloadEnc, payloadRef, metaPlain, payloadSize, updatedAt, deletedAt, deviceId] = args
      const key = `${userId}:${itemId}`
      this.items.set(key, {
        user_id: String(userId),
        item_id: String(itemId),
        type: String(type),
        schema_version: Number(schemaVersion),
        payload_enc: payloadEnc ?? null,
        payload_ref: payloadRef ?? null,
        meta_plain: metaPlain ?? null,
        payload_size: payloadSize ? Number(payloadSize) : null,
        updated_at: String(updatedAt),
        deleted_at: deletedAt ?? null,
        updated_by_device_id: deviceId ?? null,
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO sync_blobs_v1')) {
      const [userId, blobId, objectKey, sha256, sizeBytes, contentType, createdAt, status] = args
      const key = `${userId}:${blobId}`
      this.blobs.set(key, {
        user_id: String(userId),
        blob_id: String(blobId),
        object_key: String(objectKey),
        sha256: String(sha256),
        size_bytes: Number(sizeBytes),
        content_type: contentType ?? null,
        created_at: String(createdAt),
        status: String(status),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO sync_sessions_v1')) {
      const [userId, deviceId, syncToken, expiresAt, lastCursor] = args
      const key = `${userId}:${deviceId}`
      this.sessions.set(key, {
        user_id: String(userId),
        device_id: String(deviceId),
        sync_token: String(syncToken),
        expires_at: String(expiresAt),
        last_cursor: Number(lastCursor),
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
      const userId = args[args.length - 1]
      const row = this.quotas.get(String(userId))
      if (!row)
        return { meta: { changes: 0 } }
      if (sql.includes('SET used_devices')) {
        const [usedDevices, updatedAt] = args
        row.used_devices = Number(usedDevices)
        row.updated_at = String(updatedAt)
      }
      if (sql.includes('SET used_storage_bytes')) {
        const [storageDelta, , objectsDelta, , updatedAt] = args
        row.used_storage_bytes = Math.max(0, row.used_storage_bytes + Number(storageDelta))
        row.used_objects = Math.max(0, row.used_objects + Number(objectsDelta))
        row.updated_at = String(updatedAt)
      }
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE sync_sessions_v1')) {
      const [lastCursor, userId, deviceId] = args
      const key = `${userId}:${deviceId}`
      const existing = this.sessions.get(key)
      if (existing)
        existing.last_cursor = Number(lastCursor)
      return { meta: { changes: existing ? 1 : 0 } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
    if (sql.includes('SELECT updated_at') && sql.includes('sync_items_v1')) {
      const [userId, itemId] = args
      const row = this.items.get(`${userId}:${itemId}`)
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
      const row = this.oplog.get(`${userId}:${deviceId}:${opSeq}`)
      if (!row)
        return null
      return { cursor: row.cursor }
    }
    if (sql.includes('FROM sync_sessions_v1')) {
      const [userId, deviceId] = args
      const row = this.sessions.get(`${userId}:${deviceId}`)
      return row ?? null
    }
    if (sql.includes('SELECT MAX(cursor)')) {
      return { cursor: this.cursor }
    }
    if (sql.includes('FROM auth_devices') && sql.includes('COUNT')) {
      return { total: 0 }
    }
    if (sql.includes('SELECT * FROM sync_quotas_v1')) {
      const [userId] = args
      return this.quotas.get(String(userId)) ?? null
    }
    return null
  }

  all(sql: string, args: any[]) {
    if (sql.includes('FROM sync_oplog_v1')) {
      const [userId, cursor, limit] = args
      return Array.from(this.oplog.values())
        .filter(row => row.user_id === userId && row.cursor > Number(cursor))
        .sort((a, b) => a.cursor - b.cursor)
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
        .map(id => this.items.get(`${userId}:${id}`))
        .filter(Boolean)
        .map(row => row as ItemRow)
    }
    return []
  }
}

class MockR2Bucket {
  objects = new Map<string, Uint8Array>()

  async put(key: string, value: Uint8Array) {
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

  it('computes quota delta for updates and deletes', async () => {
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

    const pulled = await pullSyncItemsV1(event, 'user-1', 0, 10)
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
