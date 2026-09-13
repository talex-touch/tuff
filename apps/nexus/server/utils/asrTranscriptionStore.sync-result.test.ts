import { Buffer } from 'node:buffer'
import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ASR_RESULT_MAX_BYTES,
  getAsrResultObject,
  putAsrResultObject,
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

const REQUEST_ID = 'asr_11111111-2222-4333-8444-555555555555'

function resultObjectKey(id: string = REQUEST_ID): string {
  return `asr-result/${id}.json`
}

function event(): H3Event {
  return { context: {}, path: '/test/asr-result' } as unknown as H3Event
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
    chargedCredits: 8,
    billedSeconds: 2,
    providerCostCny: 0.00044,
    failureCode: null,
    pricing: null,
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    ...overrides,
  }
}

function seed(overrides: Partial<StoredObject> = {}) {
  storage.objects.set(resultObjectKey(), {
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
})
