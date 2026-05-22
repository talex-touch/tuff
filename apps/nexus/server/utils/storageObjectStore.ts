import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHash, createHmac } from 'node:crypto'
import { createError } from 'h3'
import { assertStorageChannelPolicy, listPlatformGovernanceConfigs, recordStorageChannelUsage } from './platformGovernanceStore'
import { getStorageCredential, type StorageAccessKeyCredential } from './storageCredentialStore'

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'
export const STORAGE_OBJECT_WRITE_MAX_RETRIES = 2
export const STORAGE_OBJECT_WRITE_RETRY_DELAYS_MS = [250, 1000] as const

export interface StorageObjectRecord {
  data: Buffer
  contentType: string
}

export type StorageObjectMemory = Map<string, StorageObjectRecord>

export interface StorageObjectResult {
  key: string
  data: Buffer
  size: number
  contentType: string
  storageChannel: string
  storageProvider: string
}

export interface StorageObjectExternalConfig {
  channel: 's3' | 'oss'
  provider: string
  bucket: string
  region: string
  endpoint?: string
  prefix?: string
  forcePathStyle?: boolean
  credentials: StorageAccessKeyCredential
  fetch?: typeof fetch
}

interface StorageObjectContext {
  event: H3Event
  bucket: R2Bucket | null
  memoryStorage: StorageObjectMemory
  externalStorage?: StorageObjectExternalConfig | null
  key: string
  governanceResourceId?: string | null
  resourceType: string
  defaultContentType?: string
}

interface PutStorageObjectInput extends StorageObjectContext {
  data: Buffer | ArrayBuffer | Uint8Array
  contentType?: string | null
  actorId?: unknown
  retryPolicy?: Partial<StorageObjectWriteRetryPolicy>
}

interface DeleteStorageObjectInput extends StorageObjectContext {
  actorId?: unknown
}

interface ResolvedObjectStorageBackend {
  channel: string
  provider: string
  bucket: R2Bucket | null
  externalStorage: StorageObjectExternalConfig | null
}

interface StorageObjectWriteRetryPolicy {
  maxRetries: number
  delaysMs: readonly number[]
}

interface StorageUploadRetryMetadata {
  retryable: boolean
  retryCount: number
  maxRetries: number
  nextRetryDelayMs: number
  storageChannel: string
  storageProvider: string
  storageOperation: 'storage.write'
  storageStatusCode: number | null
}

export function resolveObjectStorageChannel(
  bucket: R2Bucket | null,
  externalStorage?: StorageObjectExternalConfig | null,
) {
  if (externalStorage) {
    return {
      channel: externalStorage.channel,
      provider: externalStorage.provider,
    }
  }
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

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function sanitizePrefix(value?: string | null): string {
  return value?.trim().replace(/^\/+|\/+$/g, '') ?? ''
}

function applyObjectPrefix(key: string, prefix?: string | null): string {
  const normalizedKey = key.replace(/^\/+/, '')
  if (!normalizedKey)
    return ''
  const normalizedPrefix = sanitizePrefix(prefix)
  return normalizedPrefix ? `${normalizedPrefix}/${normalizedKey}` : normalizedKey
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function encodeObjectPath(key: string): string {
  return key.split('/').map(encodePathSegment).join('/')
}

function sha256Hex(value: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function hmacSha256(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf-8').digest()
}

function hmacSha256Hex(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value, 'utf-8').digest('hex')
}

function formatAmzDate(date: Date): { shortDate: string, longDate: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '')
  return {
    shortDate: iso.slice(0, 8),
    longDate: iso,
  }
}

function canonicalQuery(searchParams: URLSearchParams): string {
  return Array.from(searchParams.entries())
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey)
      return keyOrder || leftValue.localeCompare(rightValue)
    })
    .map(([key, value]) => `${encodePathSegment(key)}=${encodePathSegment(value)}`)
    .join('&')
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function canonicalizeHeaders(headers: Record<string, string>) {
  const entries = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), normalizeHeaderValue(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right))
  return {
    canonicalHeaders: entries.map(([key, value]) => `${key}:${value}\n`).join(''),
    signedHeaders: entries.map(([key]) => key).join(';'),
  }
}

function buildDefaultS3Endpoint(region: string): string {
  return region === 'us-east-1'
    ? 'https://s3.amazonaws.com'
    : `https://s3.${region}.amazonaws.com`
}

function withHttps(endpoint: string): string {
  return /^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`
}

function buildExternalObjectUrl(storage: StorageObjectExternalConfig, key: string, query?: Record<string, string>) {
  const objectKey = applyObjectPrefix(key, storage.prefix)
  const endpoint = withHttps(storage.endpoint || buildDefaultS3Endpoint(storage.region))
  const base = new URL(endpoint)
  const usePathStyle = storage.forcePathStyle ?? (storage.channel === 'oss' || Boolean(storage.endpoint))

  if (usePathStyle) {
    base.pathname = `${base.pathname.replace(/\/+$/g, '')}/${encodePathSegment(storage.bucket)}/${encodeObjectPath(objectKey)}`
  }
  else {
    base.hostname = `${storage.bucket}.${base.hostname}`
    base.pathname = `${base.pathname.replace(/\/+$/g, '')}/${encodeObjectPath(objectKey)}`
  }

  for (const [name, value] of Object.entries(query ?? {}))
    base.searchParams.set(name, value)

  return base
}

function signS3Request(input: {
  method: string
  url: URL
  body: Buffer | null
  contentType?: string | null
  storage: StorageObjectExternalConfig
  now?: Date
}): Record<string, string> {
  const { shortDate, longDate } = formatAmzDate(input.now ?? new Date())
  const payloadHash = sha256Hex(input.body ?? Buffer.alloc(0))
  const headers: Record<string, string> = {
    host: input.url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': longDate,
  }
  if (input.contentType)
    headers['content-type'] = input.contentType
  if (input.storage.credentials.sessionToken)
    headers['x-amz-security-token'] = input.storage.credentials.sessionToken

  const { canonicalHeaders, signedHeaders } = canonicalizeHeaders(headers)
  const canonicalRequest = [
    input.method,
    input.url.pathname || '/',
    canonicalQuery(input.url.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const scope = `${shortDate}/${input.storage.region}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    longDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const dateKey = hmacSha256(`AWS4${input.storage.credentials.secretAccessKey}`, shortDate)
  const regionKey = hmacSha256(dateKey, input.storage.region)
  const serviceKey = hmacSha256(regionKey, 's3')
  const signingKey = hmacSha256(serviceKey, 'aws4_request')
  const signature = hmacSha256Hex(signingKey, stringToSign)

  return {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${input.storage.credentials.accessKeyId}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`,
  }
}

function signOssRequest(input: {
  method: string
  url: URL
  body: Buffer | null
  contentType?: string | null
  storage: StorageObjectExternalConfig
  now?: Date
}): Record<string, string> {
  const { shortDate, longDate } = formatAmzDate(input.now ?? new Date())
  const headers: Record<string, string> = {
    host: input.url.host,
    'x-oss-content-sha256': 'UNSIGNED-PAYLOAD',
    'x-oss-date': longDate,
  }
  if (input.contentType)
    headers['content-type'] = input.contentType
  if (input.storage.credentials.sessionToken)
    headers['x-oss-security-token'] = input.storage.credentials.sessionToken

  const { canonicalHeaders, signedHeaders } = canonicalizeHeaders(headers)
  const canonicalRequest = [
    input.method,
    input.url.pathname || '/',
    canonicalQuery(input.url.searchParams),
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')
  const scope = `${shortDate}/${input.storage.region}/oss/aliyun_v4_request`
  const stringToSign = [
    'OSS4-HMAC-SHA256',
    longDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const dateKey = hmacSha256(`aliyun_v4${input.storage.credentials.secretAccessKey}`, shortDate)
  const regionKey = hmacSha256(dateKey, input.storage.region)
  const serviceKey = hmacSha256(regionKey, 'oss')
  const signingKey = hmacSha256(serviceKey, 'aliyun_v4_request')
  const signature = hmacSha256Hex(signingKey, stringToSign)

  return {
    ...headers,
    Authorization: `OSS4-HMAC-SHA256 Credential=${input.storage.credentials.accessKeyId}/${scope},AdditionalHeaders=${signedHeaders},Signature=${signature}`,
  }
}

function buildExternalHeaders(input: {
  method: string
  url: URL
  body: Buffer | null
  contentType?: string | null
  storage: StorageObjectExternalConfig
}) {
  return input.storage.channel === 'oss'
    ? signOssRequest(input)
    : signS3Request(input)
}

async function resolveConfiguredExternalStorage(
  event: H3Event,
  resourceType: string,
): Promise<StorageObjectExternalConfig | null> {
  const policies = await listPlatformGovernanceConfigs(event, {
    configType: 'storage_channel',
    enabled: true,
  })
  const candidates = policies.filter(policy =>
    (policy.channel === 's3' || policy.channel === 'oss')
    && (!policy.targetId || policy.targetId === resourceType)
    && policy.config,
  )
  candidates.sort((left, right) => {
    const leftScore = left.targetId === resourceType ? 0 : 1
    const rightScore = right.targetId === resourceType ? 0 : 1
    return leftScore - rightScore || right.updatedAt.localeCompare(left.updatedAt)
  })
  const policy = candidates[0]
  if (!policy?.config || (policy.channel !== 's3' && policy.channel !== 'oss'))
    return null

  const credentialRef = readString(policy.config.credentialRef) ?? readString(policy.config.authRef)
  if (!credentialRef)
    return null

  const credentials = await getStorageCredential(event, credentialRef)
  if (!credentials) {
    throw createError({
      statusCode: 503,
      statusMessage: `Storage credential is missing for ${credentialRef}.`,
    })
  }

  const bucket = readString(policy.config.bucket)
  const region = readString(policy.config.region) ?? (policy.channel === 's3' ? 'us-east-1' : null)
  if (!bucket || !region)
    return null

  return {
    channel: policy.channel,
    provider: policy.provider ?? (policy.channel === 'oss' ? 'aliyun-oss' : 'aws-s3'),
    bucket,
    region,
    endpoint: readString(policy.config.endpoint) ?? undefined,
    prefix: readString(policy.config.prefix) ?? undefined,
    forcePathStyle: readBoolean(policy.config.forcePathStyle),
    credentials,
  }
}

async function resolveObjectStorageBackend(input: StorageObjectContext): Promise<ResolvedObjectStorageBackend> {
  const externalStorage = input.externalStorage === undefined
    ? await resolveConfiguredExternalStorage(input.event, input.resourceType)
    : input.externalStorage
  return {
    ...resolveObjectStorageChannel(input.bucket, externalStorage),
    bucket: input.bucket,
    externalStorage: externalStorage ?? null,
  }
}

async function putExternalObject(storage: StorageObjectExternalConfig, key: string, data: Buffer, contentType: string): Promise<void> {
  const url = buildExternalObjectUrl(storage, key)
  const headers = buildExternalHeaders({
    method: 'PUT',
    url,
    body: data,
    contentType,
    storage,
  })
  const response = await (storage.fetch ?? fetch)(url, {
    method: 'PUT',
    headers,
    body: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
  })
  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `External storage PUT failed with HTTP ${response.status}.`,
      data: {
        storageStatusCode: response.status,
      },
    })
  }
}

async function getExternalObject(
  storage: StorageObjectExternalConfig,
  key: string,
  fallbackContentType: string,
): Promise<{ data: Buffer, contentType: string } | null> {
  const url = buildExternalObjectUrl(storage, key)
  const headers = buildExternalHeaders({
    method: 'GET',
    url,
    body: null,
    storage,
  })
  const response = await (storage.fetch ?? fetch)(url, {
    method: 'GET',
    headers,
  })
  if (response.status === 404)
    return null
  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `External storage GET failed with HTTP ${response.status}.`,
    })
  }
  const data = Buffer.from(await response.arrayBuffer())
  const contentType = normalizeContentType(response.headers.get('content-type'), fallbackContentType)
  return { data, contentType }
}

async function deleteExternalObject(storage: StorageObjectExternalConfig, key: string): Promise<void> {
  const url = buildExternalObjectUrl(storage, key)
  const headers = buildExternalHeaders({
    method: 'DELETE',
    url,
    body: null,
    storage,
  })
  const response = await (storage.fetch ?? fetch)(url, {
    method: 'DELETE',
    headers,
  })
  if (!response.ok && response.status !== 404) {
    throw createError({
      statusCode: 502,
      statusMessage: `External storage DELETE failed with HTTP ${response.status}.`,
    })
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&')
}

async function listExternalObjectKeys(storage: StorageObjectExternalConfig): Promise<string[]> {
  const prefix = sanitizePrefix(storage.prefix)
  const url = buildExternalObjectUrl(storage, '', {
    'list-type': '2',
    ...(prefix ? { prefix } : {}),
  })
  const headers = buildExternalHeaders({
    method: 'GET',
    url,
    body: null,
    storage,
  })
  const response = await (storage.fetch ?? fetch)(url, {
    method: 'GET',
    headers,
  })
  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `External storage LIST failed with HTTP ${response.status}.`,
    })
  }
  const text = await response.text()
  const keys = Array.from(text.matchAll(/<Key>(.*?)<\/Key>/g)).map(match => decodeXml(match[1] ?? ''))
  return prefix
    ? keys.map(key => key.startsWith(`${prefix}/`) ? key.slice(prefix.length + 1) : key)
    : keys
}

async function assertObjectStoragePolicy(
  input: Pick<StorageObjectContext, 'event' | 'resourceType'> & {
    backend: ResolvedObjectStorageBackend
    action: 'storage.write' | 'storage.read' | 'storage.delete'
    quantity: number
    unit: 'byte' | 'operation'
  },
): Promise<void> {
  await assertStorageChannelPolicy(input.event, {
    action: input.action,
    channel: input.backend.channel,
    provider: input.backend.provider,
    resourceType: input.resourceType,
    unit: input.unit,
    quantity: input.quantity,
  })
}

async function recordObjectStorageUsage(
  input: Pick<StorageObjectContext, 'event' | 'key' | 'governanceResourceId' | 'resourceType'> & {
    backend: ResolvedObjectStorageBackend
    action: 'storage.write' | 'storage.read' | 'storage.delete'
    actorId?: unknown
    contentType?: string
    quantity: number
    unit: 'byte' | 'operation'
  },
): Promise<void> {
  await recordStorageChannelUsage(input.event, {
    action: input.action,
    actorId: input.actorId,
    channel: input.backend.channel,
    provider: input.backend.provider,
    resourceType: input.resourceType,
    resourceId: input.governanceResourceId ?? input.key,
    unit: input.unit,
    quantity: input.quantity,
    metadata: input.contentType
      ? { contentType: input.contentType }
      : undefined,
  }).catch(() => {})
}

function normalizeWriteRetryPolicy(policy?: Partial<StorageObjectWriteRetryPolicy>): StorageObjectWriteRetryPolicy {
  const maxRetries = typeof policy?.maxRetries === 'number' && Number.isFinite(policy.maxRetries)
    ? Math.max(0, Math.min(5, Math.floor(policy.maxRetries)))
    : STORAGE_OBJECT_WRITE_MAX_RETRIES
  const delaysMs = policy?.delaysMs?.length
    ? policy.delaysMs.map(delay => Math.max(0, Math.round(delay)))
    : STORAGE_OBJECT_WRITE_RETRY_DELAYS_MS

  return {
    maxRetries,
    delaysMs,
  }
}

function readErrorData(error: unknown): Record<string, unknown> | null {
  const data = error && typeof error === 'object'
    ? (error as { data?: unknown }).data
    : null
  return data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null
}

function readStorageStatusCode(error: unknown): number | null {
  const data = readErrorData(error)
  const storageStatusCode = data?.storageStatusCode
  if (typeof storageStatusCode === 'number' && Number.isFinite(storageStatusCode))
    return Math.round(storageStatusCode)

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
  return statusCode === 408
    || statusCode === 425
    || statusCode === 429
    || statusCode === 500
    || statusCode === 502
    || statusCode === 503
    || statusCode === 504
}

function retryDelayForAttempt(policy: StorageObjectWriteRetryPolicy, retryCount: number): number {
  return policy.delaysMs[retryCount] ?? policy.delaysMs.at(-1) ?? 0
}

async function waitForRetry(delayMs: number): Promise<void> {
  if (delayMs <= 0)
    return
  await new Promise(resolve => setTimeout(resolve, delayMs))
}

function attachUploadRetryMetadata(error: unknown, metadata: StorageUploadRetryMetadata): void {
  if (!error || typeof error !== 'object')
    return
  const existingData = readErrorData(error) ?? {}
  ;(error as { data?: Record<string, unknown> }).data = {
    ...existingData,
    uploadRetry: metadata,
  }
}

async function runStorageWriteWithRetry(
  backend: Pick<ResolvedObjectStorageBackend, 'channel' | 'provider'>,
  policyInput: Partial<StorageObjectWriteRetryPolicy> | undefined,
  operation: () => Promise<void>,
): Promise<void> {
  const policy = normalizeWriteRetryPolicy(policyInput)
  let retryCount = 0

  while (true) {
    try {
      await operation()
      return
    }
    catch (error) {
      const retryable = isRetryableStorageWriteError(error)
      const willRetry = retryable && retryCount < policy.maxRetries
      const nextRetryDelayMs = willRetry ? retryDelayForAttempt(policy, retryCount) : 0
      attachUploadRetryMetadata(error, {
        retryable,
        retryCount,
        maxRetries: policy.maxRetries,
        nextRetryDelayMs,
        storageChannel: backend.channel,
        storageProvider: backend.provider,
        storageOperation: 'storage.write',
        storageStatusCode: readStorageStatusCode(error),
      })

      if (!willRetry)
        throw error

      await waitForRetry(nextRetryDelayMs)
      retryCount += 1
    }
  }
}

export async function putStorageObject(input: PutStorageObjectInput): Promise<Omit<StorageObjectResult, 'data'>> {
  const backend = await resolveObjectStorageBackend(input)
  const contentType = normalizeContentType(input.contentType, input.defaultContentType)
  const data = normalizeObjectData(input.data)

  await assertObjectStoragePolicy({
    event: input.event,
    backend,
    resourceType: input.resourceType,
    action: 'storage.write',
    unit: 'byte',
    quantity: data.size,
  })

  if (backend.externalStorage || backend.bucket) {
    await runStorageWriteWithRetry(backend, input.retryPolicy, async () => {
      if (backend.externalStorage) {
        await putExternalObject(backend.externalStorage, input.key, data.buffer, contentType)
        return
      }

      await backend.bucket!.put(input.key, data.bytes, {
        httpMetadata: {
          contentType,
        },
      })
    })
  }
  else {
    input.memoryStorage.set(input.key, {
      data: data.buffer,
      contentType,
    })
  }

  await recordObjectStorageUsage({
    event: input.event,
    backend,
    key: input.key,
    governanceResourceId: input.governanceResourceId,
    resourceType: input.resourceType,
    action: 'storage.write',
    actorId: input.actorId,
    contentType,
    unit: 'byte',
    quantity: data.size,
  })

  return {
    key: input.key,
    size: data.size,
    contentType,
    storageChannel: backend.channel,
    storageProvider: backend.provider,
  }
}

export async function getStorageObject(input: StorageObjectContext): Promise<StorageObjectResult | null> {
  const backend = await resolveObjectStorageBackend(input)
  const fallbackContentType = input.defaultContentType ?? DEFAULT_CONTENT_TYPE

  if (backend.externalStorage) {
    const object = await getExternalObject(backend.externalStorage, input.key, fallbackContentType)
    if (!object)
      return null

    await assertObjectStoragePolicy({
      event: input.event,
      backend,
      resourceType: input.resourceType,
      action: 'storage.read',
      unit: 'byte',
      quantity: object.data.byteLength,
    })
    await recordObjectStorageUsage({
      event: input.event,
      backend,
      key: input.key,
      governanceResourceId: input.governanceResourceId,
      resourceType: input.resourceType,
      action: 'storage.read',
      contentType: object.contentType,
      unit: 'byte',
      quantity: object.data.byteLength,
    })

    return {
      key: input.key,
      data: object.data,
      size: object.data.byteLength,
      contentType: object.contentType,
      storageChannel: backend.channel,
      storageProvider: backend.provider,
    }
  }

  if (backend.bucket) {
    const object = await backend.bucket.get(input.key)
    if (!object)
      return null

    const arrayBuffer = await object.arrayBuffer()
    const data = Buffer.from(arrayBuffer)
    const contentType = normalizeContentType(object.httpMetadata?.contentType, fallbackContentType)

    await assertObjectStoragePolicy({
      event: input.event,
      backend,
      resourceType: input.resourceType,
      action: 'storage.read',
      unit: 'byte',
      quantity: data.byteLength,
    })
    await recordObjectStorageUsage({
      event: input.event,
      backend,
      key: input.key,
      governanceResourceId: input.governanceResourceId,
      resourceType: input.resourceType,
      action: 'storage.read',
      contentType,
      unit: 'byte',
      quantity: data.byteLength,
    })

    return {
      key: input.key,
      data,
      size: data.byteLength,
      contentType,
      storageChannel: backend.channel,
      storageProvider: backend.provider,
    }
  }

  const object = input.memoryStorage.get(input.key) ?? null
  if (!object)
    return null

  const contentType = normalizeContentType(object.contentType, fallbackContentType)
  await assertObjectStoragePolicy({
    event: input.event,
    backend,
    resourceType: input.resourceType,
    action: 'storage.read',
    unit: 'byte',
    quantity: object.data.byteLength,
  })
  await recordObjectStorageUsage({
    event: input.event,
    backend,
    key: input.key,
    governanceResourceId: input.governanceResourceId,
    resourceType: input.resourceType,
    action: 'storage.read',
    contentType,
    unit: 'byte',
    quantity: object.data.byteLength,
  })

  return {
    key: input.key,
    data: object.data,
    size: object.data.byteLength,
    contentType,
    storageChannel: backend.channel,
    storageProvider: backend.provider,
  }
}

export async function deleteStorageObject(input: DeleteStorageObjectInput): Promise<void> {
  const backend = await resolveObjectStorageBackend(input)
  await assertObjectStoragePolicy({
    event: input.event,
    backend,
    resourceType: input.resourceType,
    action: 'storage.delete',
    unit: 'operation',
    quantity: 1,
  })

  if (backend.externalStorage)
    await deleteExternalObject(backend.externalStorage, input.key)
  else if (backend.bucket)
    await backend.bucket.delete(input.key)
  else
    input.memoryStorage.delete(input.key)

  await recordObjectStorageUsage({
    event: input.event,
    backend,
    key: input.key,
    governanceResourceId: input.governanceResourceId,
    resourceType: input.resourceType,
    action: 'storage.delete',
    actorId: input.actorId,
    unit: 'operation',
    quantity: 1,
  })
}

export async function listStorageObjectKeys(
  bucket: R2Bucket | null,
  memoryStorage: StorageObjectMemory,
  options: {
    event?: H3Event
    resourceType?: string
    externalStorage?: StorageObjectExternalConfig | null
  } = {},
): Promise<string[]> {
  const backend = options.event
    ? await resolveObjectStorageBackend({
        event: options.event,
        bucket,
        memoryStorage,
        externalStorage: options.externalStorage,
        key: '',
        resourceType: options.resourceType ?? 'object',
      })
    : {
        ...resolveObjectStorageChannel(bucket, options.externalStorage),
        bucket,
        externalStorage: options.externalStorage ?? null,
      }

  if (backend.externalStorage)
    return await listExternalObjectKeys(backend.externalStorage)

  if (!backend.bucket)
    return Array.from(memoryStorage.keys())

  const list = await backend.bucket.list()
  return list.objects.map(object => object.key)
}
