import { Buffer } from 'node:buffer'
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ASR_RESULT_MAX_BYTES,
  cleanupExpiredAsrResultObjects,
  cleanupExpiredReleasedAsrRequests,
  deleteAsrHandoffObject,
  deleteAsrResultObject,
  getAsrResultObject,
  putAsrResultObject,
  scheduleExpiredAsrResultCleanup,
  type AsrRequestRecord,
  type AsrSynchronousResult,
} from './asrTranscriptionStore'

interface StoredObject {
  data: Buffer
  contentType: string
  ownerId?: string
  storesOwnership: boolean
}

// The storage backend is faked in memory so a test can seed the exact object a hostile or
// stale writer might have left behind — malformed JSON, an oversized blob, a foreign owner,
// or a backend that never recorded ownership at all. Mocking at this seam (not the credential
// layer) is the pattern PrivacyDataStore uses for the same store.
const storage = vi.hoisted(() => {
  const objects = new Map<string, StoredObject>()
  return {
    objects,
    putStorageObject: vi.fn(
      async (input: {
        key: string
        data: Buffer | ArrayBuffer | Uint8Array
        contentType?: string | null
        ownerId?: string | null
      }) => {
        const data = Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data as ArrayBuffer)
        objects.set(input.key, {
          data,
          contentType: input.contentType ?? 'application/octet-stream',
          ownerId: typeof input.ownerId === 'string' ? input.ownerId : undefined,
          storesOwnership: true,
        })
        return {
          key: input.key,
          size: data.byteLength,
          sha256: 'test',
          contentType: input.contentType ?? 'application/octet-stream',
          storageChannel: 'memory',
          storageProvider: 'memory',
        }
      },
    ),
    getStorageObject: vi.fn(async (input: { key: string }) => {
      const object = objects.get(input.key)
      if (!object) return null
      return {
        key: input.key,
        data: object.data,
        size: object.data.byteLength,
        sha256: 'test',
        contentType: object.contentType,
        storageChannel: 'memory',
        storageProvider: 'memory',
        ownerId: object.ownerId,
        storesOwnership: object.storesOwnership,
      }
    }),
    deleteStorageObject: vi.fn(async (input: { key: string }) => {
      objects.delete(input.key)
    }),
  }
})

vi.mock('./storageObjectStore', () => storage)

/**
 * A real in-memory R2 binding.
 *
 * Every private result write, read and delete now demands an R2 binding before it will touch
 * storage at all: the store refuses rather than quietly degrading to per-process memory. The
 * success-path events therefore have to carry one. It round-trips bytes so that a fixture can
 * never be the reason a write silently lands somewhere else.
 */
function createFakeR2Bucket() {
  const objects = new Map<string, Uint8Array>()
  return {
    put: vi.fn(async (key: string, value: Uint8Array) => {
      objects.set(key, value)
      return { key, size: value.byteLength }
    }),
    get: vi.fn(async (key: string) => {
      const value = objects.get(key)
      if (!value) return null
      return {
        arrayBuffer: async () =>
          value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
        httpMetadata: {},
        customMetadata: {},
      }
    }),
    delete: vi.fn(async (key: string) => {
      objects.delete(key)
    }),
  }
}

const r2Bucket = createFakeR2Bucket()

const REQUEST_ID = 'asr_11111111-2222-4333-8444-555555555555'

function resultObjectKey(id: string = REQUEST_ID): string {
  return `asr-result/${id}.json`
}

class CleanupStatement {
  constructor(
    private readonly database: CleanupDatabase,
    private readonly sql: string,
    private readonly args: unknown[] = [],
  ) {}

  bind(...args: unknown[]) {
    return new CleanupStatement(this.database, this.sql, args)
  }

  async run() {
    if (this.sql.includes('SET result_deleted_at = ?')) {
      const [deletedAt, , id] = this.args
      const row = this.database.rows.find(candidate => String(candidate.id) === String(id))
      if (!row || row.result_deleted_at != null) return { meta: { changes: 0 } }
      row.result_deleted_at = deletedAt
      row.updated_at = deletedAt
      return { meta: { changes: 1 } }
    }
    if (this.sql.includes('DELETE FROM') && this.sql.includes("status = 'released'")) {
      const [id] = this.args
      const index = this.database.rows.findIndex(
        row => String(row.id) === String(id) && row.status === 'released',
      )
      if (index < 0) return { meta: { changes: 0 } }
      this.database.rows.splice(index, 1)
      return { meta: { changes: 1 } }
    }
    return { meta: { changes: 0 } }
  }

  async all<T>() {
    if (this.sql.includes('PRAGMA table_info')) {
      return { results: [{ name: 'pricing_snapshot' }] as T[] }
    }
    if (!this.sql.includes('delivery_expires_at <= ?')) return { results: [] as T[] }
    const cutoff = String(this.args[0] ?? '')
    const limit = Number(this.args[1] ?? 0)
    const releasedSweep = this.sql.includes("status = 'released'")
    const results = this.database.rows
      .filter((row) => {
        if (String(row.delivery_expires_at) > cutoff) return false
        if (releasedSweep) return row.status === 'released'
        return (
          (row.status === 'settled' || row.status === 'failed') &&
          row.provider_task_id === null &&
          (row.result_deleted_at === null || row.result_deleted_at === undefined)
        )
      })
      .sort((left, right) => String(left.delivery_expires_at).localeCompare(String(right.delivery_expires_at)))
      .slice(0, limit)
    return { results: results as T[] }
  }
}

class CleanupDatabase {
  constructor(readonly rows: Array<Record<string, unknown>>) {}

  prepare(sql: string) {
    return new CleanupStatement(this, sql)
  }
}

function event(): H3Event {
  return {
    context: { cloudflare: { env: { ASSETS: r2Bucket } } },
    path: '/test/asr-result',
  } as unknown as H3Event
}

function eventWithoutStorage(): H3Event {
  return { context: {}, path: '/test/asr-result' } as unknown as H3Event
}

function cleanupEvent(database: CleanupDatabase): H3Event {
  return {
    context: { cloudflare: { env: { DB: database, ASSETS: r2Bucket } } },
    path: '/test/asr-result-cleanup',
  } as unknown as H3Event
}

function request(overrides: Partial<AsrRequestRecord> = {}): AsrRequestRecord {
  return {
    id: REQUEST_ID,
    userId: 'user-a',
    providerId: 'dashscope-qwen-audio-asr-main',
    capability: 'audio.transcribe',
    idempotencyKey: 'idempotency-key-1',
    requestHash: 'a'.repeat(64),
    objectKey: `asr-handoff/${REQUEST_ID}/source.wav`,
    contentType: 'audio/wav',
    byteSize: 1_024,
    durationSeconds: 2,
    deliveryTokenHash: 'b'.repeat(64),
    deliveryExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    providerTaskId: null,
    status: 'settled',
    reservedCredits: 20,
    reservationLedgerId: null,
    chargedCredits: 8,
    creditsReleasedAt: null,
    billedSeconds: 2,
    providerCostCny: 0.00044,
    failureCode: null,
    pricing: null,
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    ...overrides,
  }
}

function requestRow(value: AsrRequestRecord): Record<string, unknown> {
  return {
    id: value.id,
    user_id: value.userId,
    provider_id: value.providerId,
    capability: value.capability,
    idempotency_key: value.idempotencyKey,
    request_hash: value.requestHash,
    object_key: value.objectKey,
    content_type: value.contentType,
    byte_size: value.byteSize,
    duration_seconds: value.durationSeconds,
    delivery_token_hash: value.deliveryTokenHash,
    delivery_expires_at: value.deliveryExpiresAt,
    provider_task_id: value.providerTaskId,
    status: value.status,
    reserved_credits: value.reservedCredits,
    reservation_ledger_id: value.reservationLedgerId,
    charged_credits: value.chargedCredits,
    billed_seconds: value.billedSeconds,
    provider_cost_cny: value.providerCostCny,
    failure_code: value.failureCode,
    pricing_snapshot: null,
    // Rows seeded here are the not-yet-swept ones; the sweep's own UPDATE is what stamps this.
    result_deleted_at: null,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  }
}

function seed(overrides: Partial<StoredObject> = {}, requestId: string = REQUEST_ID) {
  storage.objects.set(resultObjectKey(requestId), {
    data: Buffer.from(JSON.stringify({ transcript: 'stored', billedSeconds: 1 }), 'utf8'),
    contentType: 'application/json',
    ownerId: 'user-a',
    storesOwnership: true,
    ...overrides,
  })
}

describe('ASR synchronous result object storage', () => {
  beforeEach(() => {
    storage.objects.clear()
    storage.putStorageObject.mockClear()
    storage.getStorageObject.mockClear()
    storage.deleteStorageObject.mockClear()
  })

  it('round-trips a normalized result to its owner', async () => {
    await putAsrResultObject(event(), request(), { transcript: '  会议纪要  ', billedSeconds: 2.5 })

    await expect(getAsrResultObject(event(), request())).resolves.toEqual({
      transcript: '会议纪要',
      billedSeconds: 2.5,
    })
  })

  /**
   * The result store has no safe fallback.
   *
   * Without an R2 binding the previous behaviour was to route the object into the store's
   * per-process memory map: the synchronous request then settled as if the transcript were
   * durable while nothing ever left the worker. Every private operation must fail closed
   * instead — before settlement, and without the backend ever being reached.
   */
  it('refuses to write, read, or delete a result without an R2 binding instead of routing it to memory', async () => {
    const bare = eventWithoutStorage()

    await expect(
      putAsrResultObject(bare, request(), { transcript: 'must not be held in memory', billedSeconds: 1 }),
    ).rejects.toMatchObject({ statusCode: 503 })
    await expect(getAsrResultObject(bare, request())).rejects.toMatchObject({ statusCode: 503 })
    await expect(deleteAsrResultObject(bare, request())).rejects.toMatchObject({ statusCode: 503 })

    // Reaching the backend at all would mean it had accepted a null bucket, which is the
    // memory/external fallback this contract exists to forbid.
    expect(storage.putStorageObject).not.toHaveBeenCalled()
    expect(storage.getStorageObject).not.toHaveBeenCalled()
    expect(storage.deleteStorageObject).not.toHaveBeenCalled()
  })

  it('refuses to read the result for a user other than the writer', async () => {
    await putAsrResultObject(event(), request({ userId: 'user-a' }), { transcript: 'owner only', billedSeconds: 1 })

    await expect(getAsrResultObject(event(), request({ userId: 'user-b' }))).resolves.toBeNull()
  })

  it('refuses to read when the backend never recorded ownership', async () => {
    seed({ storesOwnership: false, ownerId: undefined })

    await expect(getAsrResultObject(event(), request())).resolves.toBeNull()
  })

  it.each([
    { name: 'not JSON at all', data: () => Buffer.from('not json', 'utf8') },
    { name: 'a JSON array', data: () => Buffer.from('[]', 'utf8') },
    { name: 'a blank transcript', data: () => Buffer.from(JSON.stringify({ transcript: '   ', billedSeconds: 1 })) },
    { name: 'a missing duration', data: () => Buffer.from(JSON.stringify({ transcript: 'ok' })) },
    { name: 'a non-positive duration', data: () => Buffer.from(JSON.stringify({ transcript: 'ok', billedSeconds: 0 })) },
  ])('treats a stored object with $name as absent', async ({ data }) => {
    seed({ data: data() })

    await expect(getAsrResultObject(event(), request())).resolves.toBeNull()
  })

  it('treats an oversized object as absent even when its bytes are valid JSON', async () => {
    const valid = JSON.stringify({ transcript: 'ok', billedSeconds: 1 })
    seed({ data: Buffer.from(valid + ' '.repeat(ASR_RESULT_MAX_BYTES), 'utf8') })

    await expect(getAsrResultObject(event(), request())).resolves.toBeNull()
  })

  it('refuses to write a payload past the result cap even when the transcript length is allowed', async () => {
    // The transcript clears the character limit but its UTF-8 encoding does not clear the byte cap.
    await expect(
      putAsrResultObject(event(), request(), { transcript: '好'.repeat(1_000_000), billedSeconds: 1 }),
    ).rejects.toThrow('ASR_RESULT_INVALID')

    expect(storage.objects.has(resultObjectKey())).toBe(false)
  })

  it.each([
    { name: 'a blank transcript', value: { transcript: '   ', billedSeconds: 1 } },
    { name: 'a non-positive duration', value: { transcript: 'ok', billedSeconds: 0 } },
    { name: 'a non-finite duration', value: { transcript: 'ok', billedSeconds: Number.POSITIVE_INFINITY } },
    { name: 'a non-numeric duration', value: { transcript: 'ok', billedSeconds: '1' } },
  ])('refuses to write $name', async ({ value }) => {
    await expect(putAsrResultObject(event(), request(), value as unknown as AsrSynchronousResult)).rejects.toThrow(
      'ASR_RESULT_INVALID',
    )

    expect(storage.objects.size).toBe(0)
  })

  it('cleans up a settled result once its delivery window has expired', async () => {
    seed()

    await expect(
      getAsrResultObject(event(), request({ deliveryExpiresAt: new Date(Date.now() - 60_000).toISOString() })),
    ).resolves.toBeNull()

    expect(storage.objects.has(resultObjectKey())).toBe(false)
  })

  it('keeps an in-flight result while returning nothing for a request that is not settled', async () => {
    seed()

    await expect(getAsrResultObject(event(), request({ status: 'reserved' }))).resolves.toBeNull()

    expect(storage.objects.has(resultObjectKey())).toBe(true)
  })

  it('sweeps expired settled and failed results while preserving future, dispatched, and reserved work', async () => {
    const now = new Date('2026-09-13T01:00:00.000Z')
    const expiredSettled = request({
      id: 'asr_11111111-2222-4333-8444-555555555551',
      deliveryExpiresAt: '2026-09-13T00:59:00.000Z',
    })
    const future = request({
      id: 'asr_11111111-2222-4333-8444-555555555552',
      deliveryExpiresAt: '2026-09-13T01:01:00.000Z',
    })
    const dispatched = request({
      id: 'asr_11111111-2222-4333-8444-555555555553',
      status: 'dispatching',
      providerTaskId: 'task-1',
      deliveryExpiresAt: '2026-09-13T00:58:00.000Z',
    })
    // A reserved row's result is private recovery state: the settlement reconciler owns it, since
    // only it can decide whether the hold becomes a charge or a release. The retention sweep must
    // not reclaim its evidence out from under that pass.
    const expiredReserved = request({
      id: 'asr_11111111-2222-4333-8444-555555555554',
      status: 'reserved',
      chargedCredits: null,
      deliveryExpiresAt: '2026-09-13T00:59:00.000Z',
    })
    // A failure that stored its diagnostic result before dying is still a private object; if the
    // sweep only matched settled rows it would retain that transcript forever.
    const expiredFailed = request({
      id: 'asr_11111111-2222-4333-8444-555555555555',
      status: 'failed',
      chargedCredits: null,
      failureCode: 'ASR_PROVIDER_REJECTED',
      deliveryExpiresAt: '2026-09-13T00:59:00.000Z',
    })
    for (const item of [expiredSettled, future, dispatched, expiredReserved, expiredFailed])
      seed({}, item.id)
    const database = new CleanupDatabase([
      requestRow(expiredSettled),
      requestRow(future),
      requestRow(dispatched),
      requestRow(expiredReserved),
      requestRow(expiredFailed),
    ])

    await expect(cleanupExpiredAsrResultObjects(cleanupEvent(database), { now })).resolves.toEqual({
      scanned: 2,
      deleted: 2,
      failed: 0,
    })
    expect(storage.objects.has(resultObjectKey(expiredSettled.id))).toBe(false)
    expect(storage.objects.has(resultObjectKey(expiredFailed.id))).toBe(false)
    expect(storage.objects.has(resultObjectKey(future.id))).toBe(true)
    expect(storage.objects.has(resultObjectKey(dispatched.id))).toBe(true)
    // Still held for the reconciler despite being long past its delivery TTL.
    expect(storage.objects.has(resultObjectKey(expiredReserved.id))).toBe(true)
  })

  /**
   * Without the `result_deleted_at` marker every bounded sweep re-selects the same oldest row,
   * so a backlog behind it is never reached. Two page-sized sweeps must each make progress.
   */
  it('marks each swept row so a later page reclaims the next expired result', async () => {
    const now = new Date('2026-09-13T01:00:00.000Z')
    const first = request({
      id: 'asr_11111111-2222-4333-8444-555555555561',
      deliveryExpiresAt: '2026-09-13T00:58:00.000Z',
    })
    const second = request({
      id: 'asr_11111111-2222-4333-8444-555555555562',
      deliveryExpiresAt: '2026-09-13T00:59:00.000Z',
    })
    for (const item of [first, second]) seed({}, item.id)
    const database = new CleanupDatabase([requestRow(first), requestRow(second)])
    const target = cleanupEvent(database)

    await expect(cleanupExpiredAsrResultObjects(target, { now, batchLimit: 1 })).resolves.toEqual({
      scanned: 1,
      deleted: 1,
      failed: 0,
    })
    await expect(cleanupExpiredAsrResultObjects(target, { now, batchLimit: 1 })).resolves.toEqual({
      scanned: 1,
      deleted: 1,
      failed: 0,
    })

    expect(storage.objects.has(resultObjectKey(first.id))).toBe(false)
    expect(storage.objects.has(resultObjectKey(second.id))).toBe(false)
    expect(database.rows.every((row) => typeof row.result_deleted_at === 'string')).toBe(true)
  })

  it('reports a failed deletion so a later sweep retries the same row', async () => {
    const expired = request({ deliveryExpiresAt: '2026-09-13T00:59:00.000Z' })
    seed()
    storage.deleteStorageObject.mockRejectedValueOnce(new Error('storage unavailable'))
    const database = new CleanupDatabase([requestRow(expired)])
    const target = cleanupEvent(database)
    const now = new Date('2026-09-13T01:00:00.000Z')

    await expect(cleanupExpiredAsrResultObjects(target, { now })).resolves.toEqual({
      scanned: 1,
      deleted: 0,
      failed: 1,
    })
    expect(storage.objects.has(resultObjectKey())).toBe(true)
    expect(database.rows[0]?.result_deleted_at).toBeNull()

    // A row is only marked swept after its object is gone, so the next sweep must pick it up.
    await expect(cleanupExpiredAsrResultObjects(target, { now })).resolves.toEqual({
      scanned: 1,
      deleted: 1,
      failed: 0,
    })
    expect(storage.objects.has(resultObjectKey())).toBe(false)
  })
})

describe('ASR released tombstone cleanup', () => {
  beforeEach(() => {
    storage.objects.clear()
    storage.deleteStorageObject.mockClear()
  })

  const now = new Date('2026-09-13T01:00:00.000Z')

  function released(overrides: Partial<AsrRequestRecord> = {}): AsrRequestRecord {
    return request({
      status: 'released',
      chargedCredits: null,
      billedSeconds: null,
      providerCostCny: null,
      failureCode: 'ASR_PROVIDER_REJECTED',
      deliveryExpiresAt: '2026-09-13T00:59:00.000Z',
      ...overrides,
    })
  }

  function seedHandoff(item: AsrRequestRecord): void {
    storage.objects.set(item.objectKey, {
      data: Buffer.from('raw audio', 'utf8'),
      contentType: 'audio/wav',
      ownerId: item.userId,
      storesOwnership: true,
    })
  }

  it('deletes an expired released row and both of its private objects', async () => {
    const tombstone = released()
    seed({}, tombstone.id)
    seedHandoff(tombstone)
    const database = new CleanupDatabase([requestRow(tombstone)])

    await expect(
      cleanupExpiredReleasedAsrRequests(cleanupEvent(database), { now }),
    ).resolves.toEqual({ scanned: 1, deleted: 1, failed: 0 })

    // Reclaiming the row is what frees its idempotency key; reclaiming the objects is what
    // removes the raw audio from the private bucket. Zero-credit key abuse depends on both.
    expect(database.rows).toHaveLength(0)
    expect(storage.objects.has(resultObjectKey(tombstone.id))).toBe(false)
    expect(storage.objects.has(tombstone.objectKey)).toBe(false)
  })

  it('keeps a released row that is still inside its idempotency window', async () => {
    const live = released({ deliveryExpiresAt: '2026-09-13T02:00:00.000Z' })
    seed({}, live.id)
    seedHandoff(live)
    const database = new CleanupDatabase([requestRow(live)])

    await expect(
      cleanupExpiredReleasedAsrRequests(cleanupEvent(database), { now }),
    ).resolves.toEqual({ scanned: 0, deleted: 0, failed: 0 })

    expect(database.rows).toHaveLength(1)
    expect(storage.objects.has(resultObjectKey(live.id))).toBe(true)
    expect(storage.objects.has(live.objectKey)).toBe(true)
  })

  it('leaves expired non-released rows for the result sweep', async () => {
    const settled = request({
      id: 'asr_11111111-2222-4333-8444-555555555571',
      deliveryExpiresAt: '2026-09-13T00:59:00.000Z',
    })
    seed({}, settled.id)
    const database = new CleanupDatabase([requestRow(settled)])

    await expect(
      cleanupExpiredReleasedAsrRequests(cleanupEvent(database), { now }),
    ).resolves.toEqual({ scanned: 0, deleted: 0, failed: 0 })

    expect(database.rows).toHaveLength(1)
    expect(storage.objects.has(resultObjectKey(settled.id))).toBe(true)
  })
})

describe('ASR result cleanup scheduling', () => {
  it('reconciles expired settlements before the retention sweep deletes their evidence', async () => {
    storage.objects.clear()
    const expired = request({ deliveryExpiresAt: '2026-09-13T00:59:00.000Z' })
    seed({}, expired.id)
    const database = new CleanupDatabase([requestRow(expired)])

    let scheduled: Promise<unknown> | null = null
    const reconcile = vi.fn(async () => {
      // The reconciliation pass is the only thing that can still settle this row, and it needs
      // the private result to do it. If the sweep went first, this assertion is what fails.
      expect(storage.objects.has(resultObjectKey(expired.id))).toBe(true)
    })
    const target = {
      context: {
        cloudflare: { env: { DB: database, ASSETS: r2Bucket } },
        waitUntil: (promise: Promise<unknown>) => {
          scheduled = promise
        },
      },
      path: '/test/asr-result-cleanup-schedule',
    } as unknown as H3Event

    scheduleExpiredAsrResultCleanup(target, reconcile)
    expect(scheduled).not.toBeNull()
    await scheduled!

    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(storage.objects.has(resultObjectKey(expired.id))).toBe(false)
  })
})

describe('ASR private object backend pinning', () => {
  beforeEach(() => {
    storage.objects.clear()
    storage.putStorageObject.mockClear()
    storage.getStorageObject.mockClear()
    storage.deleteStorageObject.mockClear()
  })

  it('pins every private handoff and result object to the in-app backend', async () => {
    // `externalStorage: null` is a deliberate override, not a default: leaving it undefined lets
    // the store resolve an operator-configured storage channel and route raw audio and
    // transcripts into a third-party bucket. Asserting the boundary receives an explicit null is
    // asserting that decision; the external-resolution path is covered by storageObjectStore.
    await putAsrResultObject(event(), request(), { transcript: 'ok', billedSeconds: 1 })
    expect(storage.putStorageObject).toHaveBeenLastCalledWith(
      expect.objectContaining({ externalStorage: null }),
    )

    await getAsrResultObject(event(), request())
    expect(storage.getStorageObject).toHaveBeenLastCalledWith(
      expect.objectContaining({ externalStorage: null }),
    )

    await deleteAsrHandoffObject(event(), request())
    expect(storage.deleteStorageObject).toHaveBeenLastCalledWith(
      expect.objectContaining({ externalStorage: null }),
    )
  })
})

/**
 * The cleanup task is handed to whichever platform context actually owns it.
 *
 * `waitUntil` is not a bare function — it is a method on the context object, and a worker
 * runtime may legitimately use `this` (a private field, a bound lifecycle queue). Resolving the
 * method from one object and invoking it with another receiver detaches it: it either throws or
 * schedules on the wrong lifecycle. Each owner records the receiver it was actually called with;
 * precedence is asserted next to it because there are three possible owners.
 */
describe('ASR cleanup waitUntil ownership', () => {
  interface WaiterCall {
    name: string
    receiver: unknown
    promise: Promise<unknown>
  }

  let clock = Date.UTC(2030, 0, 1)

  beforeEach(() => {
    vi.useFakeTimers()
    // The scheduler throttles itself for a minute for the whole module; each case jumps past the
    // previous window so it exercises owner resolution rather than the throttle.
    clock += 61_000
    vi.setSystemTime(clock)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function createOwner(name: string, calls: WaiterCall[]) {
    return {
      name,
      waitUntil(this: unknown, promise: Promise<unknown>) {
        calls.push({ name, receiver: this, promise })
      },
    }
  }

  function scheduleWithOwners(owners: { root?: boolean; cloudflare?: boolean; platform?: boolean }) {
    const calls: WaiterCall[] = []
    const context: Record<string, unknown> = {}
    let expected: unknown = null
    if (owners.root) {
      const root = createOwner('root', calls)
      context.waitUntil = root.waitUntil
      // A method lifted off the context and bound back to it: the receiver is the context itself.
      expected = context
    }
    if (owners.cloudflare) {
      const cloudflare = createOwner('cloudflare.context', calls)
      context.cloudflare = { context: cloudflare }
      if (!owners.root) expected = cloudflare
    }
    if (owners.platform) {
      const platform = createOwner('platform.cloudflare.context', calls)
      context._platform = { cloudflare: { context: platform } }
      if (!owners.root && !owners.cloudflare) expected = platform
    }
    const target = { context, path: '/test/asr-result-cleanup-owners' } as unknown as H3Event
    scheduleExpiredAsrResultCleanup(target)
    return { calls, expected, context }
  }

  it('prefers the root context owner and invokes it with the context as receiver', async () => {
    const { calls, expected, context } = scheduleWithOwners({
      root: true,
      cloudflare: true,
      platform: true,
    })

    expect(calls.map((call) => call.name)).toEqual(['root'])
    expect(calls[0]?.receiver).toBe(expected)
    expect(calls[0]?.receiver).toBe(context)
    await calls[0]?.promise
  })

  it('binds a nested cloudflare.context waitUntil to that context, not the root event', async () => {
    const { calls, expected, context } = scheduleWithOwners({ cloudflare: true, platform: true })

    // `cloudflare.context` outranks the platform fallback and must keep its own `this`.
    expect(calls.map((call) => call.name)).toEqual(['cloudflare.context'])
    expect(calls[0]?.receiver).toBe(expected)
    expect(calls[0]?.receiver).not.toBe(context)
    await calls[0]?.promise
  })

  it('binds a platform-context waitUntil to that context when it is the only owner', async () => {
    const { calls, expected, context } = scheduleWithOwners({ platform: true })

    expect(calls.map((call) => call.name)).toEqual(['platform.cloudflare.context'])
    expect(calls[0]?.receiver).toBe(expected)
    expect(calls[0]?.receiver).not.toBe(context)
    await calls[0]?.promise
  })
})
