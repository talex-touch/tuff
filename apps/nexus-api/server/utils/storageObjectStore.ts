import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'
export const STORAGE_OBJECT_WRITE_MAX_RETRIES = 2
export const STORAGE_OBJECT_WRITE_RETRY_DELAYS_MS = [250, 1000] as const

export interface StorageObjectRecord {
  data: Buffer
  contentType: string
  ownerId?: string
}

export type StorageObjectMemory = Map<string, StorageObjectRecord>

export interface StorageObjectResult {
  key: string
  data: Buffer
  size: number
  sha256: string
  contentType: string
  storageChannel: string
  storageProvider: string
  uploadRetry?: StorageUploadRetryMetadata
  ownerId?: string
  storesOwnership: boolean
}

export interface StorageObjectStream {
  key: string
  body: ReadableStream<Uint8Array> | Buffer
  size: number
  contentType: string
  storageChannel: string
  storageProvider: string
  ownerId?: string
  storesOwnership: boolean
}

export interface StorageUploadRetryMetadata {
  retryable: boolean
  retryCount: number
  maxRetries: number
  nextRetryDelayMs: number
  storageChannel: string
  storageProvider: string
  storageOperation: 'storage.write'
  storageStatusCode: number | null
  recovered?: boolean
  attempts?: number
}

interface StorageObjectWriteRetryPolicy {
  maxRetries: number
  delaysMs: readonly number[]
}

interface StorageObjectContext {
  event: H3Event
  bucket: R2Bucket | null
  memoryStorage: StorageObjectMemory
  key: string
  resourceType: string
  defaultContentType?: string
  /** Optional ignored fields for compatibility with legacy call sites. */
  externalStorage?: null
  governanceResourceId?: string | null
}

interface PutStorageObjectInput extends StorageObjectContext {
  data: Buffer | ArrayBuffer | Uint8Array
  contentType?: string | null
  actorId?: unknown
  ownerId?: string | null
  retryPolicy?: Partial<StorageObjectWriteRetryPolicy>
}

interface DeleteStorageObjectInput extends StorageObjectContext {
  actorId?: unknown
}

export function resolveObjectStorageChannel(bucket: R2Bucket | null) {
  return {
    channel: bucket ? 'r2' : 'memory',
    provider: bucket ? 'cloudflare-r2' : 'memory',
  }
}

function normalizeContentType(contentType?: string | null, fallback = DEFAULT_CONTENT_TYPE): string {
  return contentType || fallback
}

function normalizeObjectData(data: Buffer | ArrayBuffer | Uint8Array) {
  if (Buffer.isBuffer(data)) {
    return {
      bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      buffer: data,
      size: data.byteLength,
    }
  }
  if (data instanceof ArrayBuffer) {
    const bytes = new Uint8Array(data)
    return {
      bytes,
      buffer: Buffer.from(data),
      size: bytes.byteLength,
    }
  }
  return {
    bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    buffer: Buffer.from(data.buffer, data.byteOffset, data.byteLength),
    size: data.byteLength,
  }
}

function sha256Hex(value: Buffer | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function readStorageStatusCode(error: unknown): number | null {
  if (error && typeof error === 'object') {
    const statusCode = (error as { statusCode?: unknown }).statusCode
    if (typeof statusCode === 'number' && Number.isFinite(statusCode))
      return Math.round(statusCode)
  }
  return null
}

function isRetryableStorageWriteError(error: unknown): boolean {
  const statusCode = readStorageStatusCode(error)
  if (statusCode === null)
    return true
  return statusCode === 408 || statusCode === 425 || statusCode === 429
    || statusCode === 500 || statusCode === 502 || statusCode === 503 || statusCode === 504
}

async function waitForRetry(delayMs: number): Promise<void> {
  if (delayMs <= 0)
    return
  await new Promise(resolve => setTimeout(resolve, delayMs))
}

async function runStorageWriteWithRetry(
  backend: { channel: string, provider: string },
  policyInput: Partial<StorageObjectWriteRetryPolicy> | undefined,
  operation: () => Promise<void>,
): Promise<StorageUploadRetryMetadata | undefined> {
  const maxRetries = typeof policyInput?.maxRetries === 'number' && Number.isFinite(policyInput.maxRetries)
    ? Math.max(0, Math.min(5, Math.floor(policyInput.maxRetries)))
    : STORAGE_OBJECT_WRITE_MAX_RETRIES
  const delaysMs = policyInput?.delaysMs?.length
    ? policyInput.delaysMs.map(delay => Math.max(0, Math.round(delay)))
    : STORAGE_OBJECT_WRITE_RETRY_DELAYS_MS

  let retryCount = 0
  let lastRetry: StorageUploadRetryMetadata | undefined

  while (true) {
    try {
      await operation()
      if (retryCount <= 0 || !lastRetry)
        return undefined
      return {
        ...lastRetry,
        retryable: true,
        recovered: true,
        retryCount,
        nextRetryDelayMs: 0,
        attempts: retryCount + 1,
      }
    }
    catch (error) {
      const retryable = isRetryableStorageWriteError(error)
      const willRetry = retryable && retryCount < maxRetries
      const nextRetryDelayMs = willRetry ? (delaysMs[retryCount] ?? delaysMs.at(-1) ?? 0) : 0
      const metadata: StorageUploadRetryMetadata = {
        retryable,
        retryCount,
        maxRetries,
        nextRetryDelayMs,
        storageChannel: backend.channel,
        storageProvider: backend.provider,
        storageOperation: 'storage.write',
        storageStatusCode: readStorageStatusCode(error),
      }
      if (!willRetry)
        throw error
      lastRetry = metadata
      await waitForRetry(nextRetryDelayMs)
      retryCount += 1
    }
  }
}

export async function putStorageObject(input: PutStorageObjectInput): Promise<Omit<StorageObjectResult, 'data'>> {
  const backend = resolveObjectStorageChannel(input.bucket)
  const contentType = normalizeContentType(input.contentType, input.defaultContentType)
  const data = normalizeObjectData(input.data)
  const sha256 = sha256Hex(data.buffer)

  const uploadRetry = input.bucket
    ? await runStorageWriteWithRetry(backend, input.retryPolicy, async () => {
        await input.bucket!.put(input.key, data.bytes, {
          httpMetadata: { contentType },
          ...(input.ownerId ? { customMetadata: { ownerId: input.ownerId } } : {}),
        })
      })
    : undefined

  if (!input.bucket) {
    input.memoryStorage.set(input.key, {
      data: data.buffer,
      contentType,
      ...(input.ownerId ? { ownerId: input.ownerId } : {}),
    })
  }

  return {
    key: input.key,
    size: data.size,
    sha256,
    contentType,
    storageChannel: backend.channel,
    storageProvider: backend.provider,
    uploadRetry,
    ownerId: input.ownerId ?? undefined,
    storesOwnership: true,
  }
}

export async function getStorageObject(input: StorageObjectContext): Promise<StorageObjectResult | null> {
  const backend = resolveObjectStorageChannel(input.bucket)
  const fallbackContentType = normalizeContentType(undefined, input.defaultContentType)

  if (input.bucket) {
    const object = await input.bucket.get(input.key)
    if (!object)
      return null
    const data = Buffer.from(await object.arrayBuffer())
    const contentType = normalizeContentType(object.httpMetadata?.contentType, fallbackContentType)
    return {
      key: input.key,
      data,
      size: data.byteLength,
      sha256: sha256Hex(data),
      contentType,
      storageChannel: backend.channel,
      storageProvider: backend.provider,
      ownerId: object.customMetadata?.ownerId || undefined,
      storesOwnership: true,
    }
  }

  const record = input.memoryStorage.get(input.key)
  if (!record)
    return null
  return {
    key: input.key,
    data: record.data,
    size: record.data.byteLength,
    sha256: sha256Hex(record.data),
    contentType: normalizeContentType(record.contentType, fallbackContentType),
    storageChannel: backend.channel,
    storageProvider: backend.provider,
    ownerId: record.ownerId,
    storesOwnership: true,
  }
}

export async function openStorageObjectStream(input: StorageObjectContext): Promise<StorageObjectStream | null> {
  const backend = resolveObjectStorageChannel(input.bucket)
  const fallbackContentType = normalizeContentType(undefined, input.defaultContentType)

  if (input.bucket) {
    const object = await input.bucket.get(input.key)
    if (!object)
      return null
    return {
      key: input.key,
      body: object.body as unknown as ReadableStream<Uint8Array>,
      size: object.size,
      contentType: normalizeContentType(object.httpMetadata?.contentType, fallbackContentType),
      storageChannel: backend.channel,
      storageProvider: backend.provider,
      ownerId: object.customMetadata?.ownerId || undefined,
      storesOwnership: true,
    }
  }

  const record = input.memoryStorage.get(input.key)
  if (!record)
    return null
  return {
    key: input.key,
    body: record.data,
    size: record.data.byteLength,
    contentType: normalizeContentType(record.contentType, fallbackContentType),
    storageChannel: backend.channel,
    storageProvider: backend.provider,
    ownerId: record.ownerId,
    storesOwnership: true,
  }
}

export const openStorageObject = openStorageObjectStream

export async function deleteStorageObject(input: DeleteStorageObjectInput): Promise<void> {
  if (input.bucket) {
    await input.bucket.delete(input.key)
    return
  }
  input.memoryStorage.delete(input.key)
}

export async function listStorageObjectKeys(input: Pick<StorageObjectContext, 'bucket' | 'memoryStorage'> & { prefix?: string }): Promise<string[]> {
  const prefix = input.prefix?.trim() || ''
  if (input.bucket) {
    const keys: string[] = []
    let cursor: string | undefined
    do {
      const listed = await input.bucket.list({ prefix: prefix || undefined, cursor })
      for (const item of listed.objects)
        keys.push(item.key)
      cursor = listed.truncated ? listed.cursor : undefined
    } while (cursor)
    return keys
  }

  return Array.from(input.memoryStorage.keys())
    .filter(key => !prefix || key.startsWith(prefix))
}
