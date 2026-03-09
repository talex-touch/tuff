import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createHmac } from 'node:crypto'
import { AwsClient } from 'aws4fetch'
import { getRequestURL } from 'h3'
import { getPilotAdminStorageSettings } from './pilot-admin-storage-config'
import { resolvePilotConfigString } from './pilot-config'

export type PilotAttachmentStorageProvider = 'memory' | 'r2' | 's3'

export interface PilotAttachmentRef {
  provider: PilotAttachmentStorageProvider
  key: string
}

export interface PutPilotAttachmentObjectInput {
  key: string
  bytes: Uint8Array
  mimeType: string
}

export interface PutPilotAttachmentObjectResult extends PilotAttachmentRef {
  ref: string
}

export interface PilotAttachmentObject {
  provider: PilotAttachmentStorageProvider
  key: string
  bytes: Uint8Array
  mimeType: string
  size: number
}

interface MemoryObject {
  bytes: Uint8Array
  mimeType: string
}

interface PilotS3Config {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  forcePathStyle: boolean
  publicBaseUrl: string
}

interface PilotAttachmentRuntimeConfig {
  providerMode: StorageProviderMode
  s3Config: PilotS3Config | null
  attachmentPublicBaseUrl: string
  attachmentSigningSecret: string
}

export interface PilotAttachmentUploadAvailability {
  allowed: boolean
  reason?: string
  provider: PilotAttachmentStorageProvider
  hasS3Config: boolean
  hasPublicBaseUrl: boolean
}

type StorageProviderMode = 'auto' | PilotAttachmentStorageProvider

type PilotEventContext = H3Event['context'] & {
  __pilotAttachmentRuntimeConfigPromise?: Promise<PilotAttachmentRuntimeConfig>
}

const memoryStorage = new Map<string, MemoryObject>()
const S3_REGION_FALLBACK = 'us-east-1'
const STORAGE_PROVIDER_ENV_KEYS = ['PILOT_ATTACHMENT_PROVIDER']
const S3_ENDPOINT_ENV_KEYS = ['PILOT_MINIO_ENDPOINT', 'PILOT_S3_ENDPOINT']
const S3_BUCKET_ENV_KEYS = ['PILOT_MINIO_BUCKET', 'PILOT_S3_BUCKET']
const S3_ACCESS_KEY_ENV_KEYS = ['PILOT_MINIO_ACCESS_KEY', 'PILOT_S3_ACCESS_KEY']
const S3_SECRET_KEY_ENV_KEYS = ['PILOT_MINIO_SECRET_KEY', 'PILOT_S3_SECRET_KEY']
const S3_REGION_ENV_KEYS = ['PILOT_MINIO_REGION', 'PILOT_S3_REGION']
const S3_FORCE_PATH_STYLE_ENV_KEYS = ['PILOT_MINIO_FORCE_PATH_STYLE', 'PILOT_S3_FORCE_PATH_STYLE']
const S3_PUBLIC_BASE_URL_ENV_KEYS = ['PILOT_MINIO_PUBLIC_BASE_URL', 'PILOT_S3_PUBLIC_BASE_URL']
const ATTACHMENT_PUBLIC_BASE_URL_ENV_KEYS = ['PILOT_ATTACHMENT_PUBLIC_BASE_URL']
const ATTACHMENT_SIGNING_SECRET_ENV_KEYS = ['PILOT_ATTACHMENT_SIGNING_SECRET', 'PILOT_COOKIE_SECRET']
const ATTACHMENT_SIGN_EXPIRES_MS = 10 * 60 * 1000
const ATTACHMENT_SIGN_MAX_SKEW_MS = 24 * 60 * 60 * 1000

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice()
}

function normalizeUrl(value: unknown): string {
  return String(value || '').trim().replace(/\/+$/, '')
}

function normalizeMimeType(value: unknown): string {
  return String(value || '').trim().slice(0, 160) || 'application/octet-stream'
}

function normalizeStorageProviderMode(value: string | null | undefined): StorageProviderMode {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'memory' || normalized === 'r2' || normalized === 's3') {
    return normalized
  }
  if (normalized === 'minio') {
    return 's3'
  }
  return 'auto'
}

function toBoolean(value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return fallback
  }
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return fallback
}

function getPilotAttachmentBucket(event: H3Event): R2Bucket | null {
  return (
    (event.context.cloudflare?.env?.PILOT_ATTACHMENTS as R2Bucket | undefined)
    ?? (event.context.cloudflare?.env?.R2 as R2Bucket | undefined)
    ?? null
  )
}

function createS3Client(config: PilotS3Config): AwsClient {
  return new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: 's3',
  })
}

function encodeObjectKey(key: string): string {
  return key
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

function joinBaseUrl(baseUrl: string, path: string): string {
  const normalizedBase = normalizeUrl(baseUrl)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  if (!normalized) {
    return true
  }

  if (
    normalized === 'localhost'
    || normalized === '0.0.0.0'
    || normalized === '::1'
    || normalized.endsWith('.local')
  ) {
    return true
  }

  if (normalized.startsWith('127.') || normalized.startsWith('10.') || normalized.startsWith('192.168.')) {
    return true
  }

  if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(normalized)) {
    return true
  }

  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) {
    return true
  }

  return false
}

function resolvePublicRequestOrigin(event: H3Event): string {
  try {
    const requestUrl = getRequestURL(event)
    const protocol = String(requestUrl.protocol || '').toLowerCase()
    if (protocol !== 'http:' && protocol !== 'https:') {
      return ''
    }

    const hostname = String(requestUrl.hostname || '').trim()
    if (!hostname || isPrivateHostname(hostname)) {
      return ''
    }

    return `${protocol}//${requestUrl.host}`
  }
  catch {
    return ''
  }
}

function buildS3EndpointObjectUrl(config: PilotS3Config, key: string): string {
  const encodedKey = encodeObjectKey(key)
  if (config.forcePathStyle) {
    return `${config.endpoint}/${encodeURIComponent(config.bucket)}/${encodedKey}`
  }

  const endpointUrl = new URL(config.endpoint)
  endpointUrl.hostname = `${config.bucket}.${endpointUrl.hostname}`
  endpointUrl.pathname = `/${encodedKey}`
  endpointUrl.search = ''
  return endpointUrl.toString()
}

function buildS3PublicObjectUrl(config: PilotS3Config, key: string): string {
  const encodedKey = encodeObjectKey(key)
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl}/${encodedKey}`
  }
  return buildS3EndpointObjectUrl(config, key)
}

function resolveStorageProviderMode(event: H3Event, adminProvider: string | undefined): StorageProviderMode {
  const fromAdmin = normalizeStorageProviderMode(adminProvider)
  if (fromAdmin !== 'auto') {
    return fromAdmin
  }

  const fromEnv = resolvePilotConfigString(event, 'attachmentProvider', STORAGE_PROVIDER_ENV_KEYS, 'auto')
  return normalizeStorageProviderMode(fromEnv)
}

function resolvePilotS3Config(event: H3Event, adminConfig: Awaited<ReturnType<typeof getPilotAdminStorageSettings>>): PilotS3Config | null {
  const endpoint = normalizeUrl(adminConfig.minioEndpoint || resolvePilotConfigString(event, 'minioEndpoint', S3_ENDPOINT_ENV_KEYS))
  const bucket = String(adminConfig.minioBucket || resolvePilotConfigString(event, 'minioBucket', S3_BUCKET_ENV_KEYS)).trim()
  const accessKeyId = String(adminConfig.minioAccessKey || resolvePilotConfigString(event, 'minioAccessKey', S3_ACCESS_KEY_ENV_KEYS)).trim()
  const secretAccessKey = String(adminConfig.minioSecretKey || resolvePilotConfigString(event, 'minioSecretKey', S3_SECRET_KEY_ENV_KEYS)).trim()

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null
  }

  const region = String(adminConfig.minioRegion || resolvePilotConfigString(event, 'minioRegion', S3_REGION_ENV_KEYS, S3_REGION_FALLBACK)).trim() || S3_REGION_FALLBACK
  const forcePathStyleRaw = adminConfig.minioForcePathStyle === undefined
    ? resolvePilotConfigString(event, 'minioForcePathStyle', S3_FORCE_PATH_STYLE_ENV_KEYS, 'true')
    : (adminConfig.minioForcePathStyle ? 'true' : 'false')
  const publicBaseUrl = normalizeUrl(adminConfig.minioPublicBaseUrl || resolvePilotConfigString(event, 'minioPublicBaseUrl', S3_PUBLIC_BASE_URL_ENV_KEYS))

  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region,
    forcePathStyle: toBoolean(forcePathStyleRaw, true),
    publicBaseUrl,
  }
}

function resolveAttachmentPublicBaseUrl(event: H3Event, adminConfig: Awaited<ReturnType<typeof getPilotAdminStorageSettings>>): string {
  const configured = normalizeUrl(adminConfig.attachmentPublicBaseUrl || resolvePilotConfigString(event, 'attachmentPublicBaseUrl', ATTACHMENT_PUBLIC_BASE_URL_ENV_KEYS))
  if (configured) {
    return configured
  }
  return normalizeUrl(resolvePublicRequestOrigin(event))
}

function resolveAttachmentSigningSecret(event: H3Event): string {
  return String(resolvePilotConfigString(event, 'attachmentSigningSecret', ATTACHMENT_SIGNING_SECRET_ENV_KEYS)).trim()
}

async function resolvePilotAttachmentRuntimeConfig(event: H3Event): Promise<PilotAttachmentRuntimeConfig> {
  const context = event.context as PilotEventContext
  if (!context.__pilotAttachmentRuntimeConfigPromise) {
    context.__pilotAttachmentRuntimeConfigPromise = (async () => {
      const adminConfig = await getPilotAdminStorageSettings(event).catch(
        (): Awaited<ReturnType<typeof getPilotAdminStorageSettings>> => ({}),
      )
      return {
        providerMode: resolveStorageProviderMode(event, adminConfig.attachmentProvider),
        s3Config: resolvePilotS3Config(event, adminConfig),
        attachmentPublicBaseUrl: resolveAttachmentPublicBaseUrl(event, adminConfig),
        attachmentSigningSecret: resolveAttachmentSigningSecret(event),
      }
    })()
  }

  return await context.__pilotAttachmentRuntimeConfigPromise
}

async function putObjectToS3(
  config: PilotS3Config,
  key: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<void> {
  const normalizedBytes = Uint8Array.from(bytes)
  const body = new Blob([normalizedBytes], {
    type: mimeType,
  })
  const client = createS3Client(config)
  const targetUrl = buildS3EndpointObjectUrl(config, key)
  const response = await client.fetch(targetUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
    },
    body,
  })
  if (!response.ok) {
    throw new Error(`S3 put failed: ${response.status}`)
  }
}

async function readObjectFromS3(config: PilotS3Config, key: string): Promise<PilotAttachmentObject | null> {
  const client = createS3Client(config)
  const targetUrl = buildS3EndpointObjectUrl(config, key)
  const response = await client.fetch(targetUrl, {
    method: 'GET',
  })
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`S3 get failed: ${response.status}`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  return {
    provider: 's3',
    key,
    bytes,
    mimeType: normalizeMimeType(response.headers.get('content-type')),
    size: bytes.byteLength,
  }
}

async function deleteObjectFromS3(config: PilotS3Config, key: string): Promise<void> {
  const client = createS3Client(config)
  const targetUrl = buildS3EndpointObjectUrl(config, key)
  const response = await client.fetch(targetUrl, {
    method: 'DELETE',
  })
  if (!response.ok && response.status !== 404) {
    throw new Error(`S3 delete failed: ${response.status}`)
  }
}

async function createS3SignedReadUrl(config: PilotS3Config, key: string): Promise<string> {
  if (config.publicBaseUrl) {
    return buildS3PublicObjectUrl(config, key)
  }

  const client = createS3Client(config)
  const targetUrl = buildS3EndpointObjectUrl(config, key)
  const signedRequest = await client.sign(targetUrl, {
    method: 'GET',
    aws: {
      service: 's3',
      region: config.region,
      signQuery: true,
    },
  })
  return signedRequest.url
}

function buildAttachmentSignature(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

function buildAttachmentSignaturePayload(sessionId: string, attachmentId: string, expiresAt: number): string {
  return `${sessionId}:${attachmentId}:${expiresAt}`
}

export function createPilotAttachmentRef(provider: PilotAttachmentStorageProvider, key: string): string {
  return `${provider}://${key}`
}

export function parsePilotAttachmentRef(ref: string | null | undefined): PilotAttachmentRef | null {
  const raw = String(ref || '').trim()
  if (!raw) {
    return null
  }

  const matched = raw.match(/^([a-z0-9+.-]+):\/\/(.+)$/i)
  if (matched) {
    const scheme = String(matched[1] || '').toLowerCase()
    const key = String(matched[2] || '').trim()
    if (!key) {
      return null
    }
    if (scheme === 'memory' || scheme === 'r2' || scheme === 's3') {
      return {
        provider: scheme,
        key,
      }
    }
    if (scheme === 'minio') {
      return {
        provider: 's3',
        key,
      }
    }
    return null
  }

  if (raw.startsWith('pilot/')) {
    return {
      provider: 'r2',
      key: raw,
    }
  }

  return null
}

export function buildPilotAttachmentPreviewUrl(sessionId: string, attachmentId: string): string {
  const normalizedSessionId = encodeURIComponent(String(sessionId || '').trim())
  const normalizedAttachmentId = encodeURIComponent(String(attachmentId || '').trim())
  return `/api/pilot/chat/sessions/${normalizedSessionId}/attachments/${normalizedAttachmentId}/content`
}

function resolveWriteProvider(
  mode: StorageProviderMode,
  bucket: R2Bucket | null,
  s3Config: PilotS3Config | null,
): PilotAttachmentStorageProvider {
  if (mode === 'memory' || mode === 'r2' || mode === 's3') {
    return mode
  }
  if (bucket) {
    return 'r2'
  }
  if (s3Config) {
    return 's3'
  }
  return 'memory'
}

export async function getPilotAttachmentUploadAvailability(event: H3Event): Promise<PilotAttachmentUploadAvailability> {
  const runtimeConfig = await resolvePilotAttachmentRuntimeConfig(event)
  const bucket = getPilotAttachmentBucket(event)
  const provider = resolveWriteProvider(runtimeConfig.providerMode, bucket, runtimeConfig.s3Config)
  const hasS3Config = Boolean(runtimeConfig.s3Config)
  const hasPublicBaseUrl = Boolean(runtimeConfig.attachmentPublicBaseUrl)

  if (provider === 's3' && !hasS3Config) {
    return {
      allowed: false,
      reason: 'Attachment provider is set to s3/minio but MinIO configuration is incomplete.',
      provider,
      hasS3Config,
      hasPublicBaseUrl,
    }
  }

  if (hasS3Config || hasPublicBaseUrl) {
    return {
      allowed: true,
      provider,
      hasS3Config,
      hasPublicBaseUrl,
    }
  }

  return {
    allowed: false,
    reason: 'Attachments are disabled on local/private environments without MinIO or attachment public base URL.',
    provider,
    hasS3Config,
    hasPublicBaseUrl,
  }
}

export async function putPilotAttachmentObject(
  event: H3Event,
  input: PutPilotAttachmentObjectInput,
): Promise<PutPilotAttachmentObjectResult> {
  const key = String(input.key || '').trim()
  if (!key) {
    throw new Error('Attachment key is required.')
  }

  const mimeType = normalizeMimeType(input.mimeType)
  const bytes = cloneBytes(input.bytes)
  const runtimeConfig = await resolvePilotAttachmentRuntimeConfig(event)
  const bucket = getPilotAttachmentBucket(event)
  const provider = resolveWriteProvider(runtimeConfig.providerMode, bucket, runtimeConfig.s3Config)

  if (provider === 'r2') {
    if (!bucket) {
      throw new Error('R2 is not configured.')
    }
    await bucket.put(key, bytes, {
      httpMetadata: {
        contentType: mimeType,
      },
    })
    return {
      provider: 'r2',
      key,
      ref: createPilotAttachmentRef('r2', key),
    }
  }

  if (provider === 's3') {
    if (!runtimeConfig.s3Config) {
      throw new Error('S3/MinIO is not configured.')
    }
    await putObjectToS3(runtimeConfig.s3Config, key, bytes, mimeType)
    return {
      provider: 's3',
      key,
      ref: createPilotAttachmentRef('s3', key),
    }
  }

  memoryStorage.set(key, {
    bytes,
    mimeType,
  })

  return {
    provider: 'memory',
    key,
    ref: createPilotAttachmentRef('memory', key),
  }
}

async function readObjectFromR2(bucket: R2Bucket, key: string): Promise<PilotAttachmentObject | null> {
  const object = await bucket.get(key)
  if (!object) {
    return null
  }

  const buffer = new Uint8Array(await object.arrayBuffer())
  const mimeType = normalizeMimeType(object.httpMetadata?.contentType)
  return {
    provider: 'r2',
    key,
    bytes: buffer,
    mimeType,
    size: buffer.byteLength,
  }
}

function readObjectFromMemory(key: string): PilotAttachmentObject | null {
  const object = memoryStorage.get(key)
  if (!object) {
    return null
  }

  const bytes = cloneBytes(object.bytes)
  return {
    provider: 'memory',
    key,
    bytes,
    mimeType: normalizeMimeType(object.mimeType),
    size: bytes.byteLength,
  }
}

export async function getPilotAttachmentObject(event: H3Event, ref: string): Promise<PilotAttachmentObject | null> {
  const parsed = parsePilotAttachmentRef(ref)
  if (!parsed) {
    return null
  }

  if (parsed.provider === 'memory') {
    return readObjectFromMemory(parsed.key)
  }

  if (parsed.provider === 's3') {
    const runtimeConfig = await resolvePilotAttachmentRuntimeConfig(event)
    if (!runtimeConfig.s3Config) {
      return null
    }
    return await readObjectFromS3(runtimeConfig.s3Config, parsed.key)
  }

  const bucket = getPilotAttachmentBucket(event)
  if (bucket) {
    return await readObjectFromR2(bucket, parsed.key)
  }

  return null
}

export async function deletePilotAttachmentObject(event: H3Event, ref: string): Promise<void> {
  const parsed = parsePilotAttachmentRef(ref)
  if (!parsed) {
    return
  }

  if (parsed.provider === 'memory') {
    memoryStorage.delete(parsed.key)
    return
  }

  if (parsed.provider === 's3') {
    const runtimeConfig = await resolvePilotAttachmentRuntimeConfig(event)
    if (runtimeConfig.s3Config) {
      await deleteObjectFromS3(runtimeConfig.s3Config, parsed.key)
    }
    return
  }

  const bucket = getPilotAttachmentBucket(event)
  if (bucket) {
    await bucket.delete(parsed.key)
  }
}

export interface ResolvePilotAttachmentModelUrlInput {
  sessionId: string
  attachmentId: string
  ref: string
}

export interface VerifyPilotAttachmentSignedAccessInput {
  sessionId: string
  attachmentId: string
  expiresAt: number
  signature: string
}

export async function buildPilotAttachmentSignedPreviewUrl(
  event: H3Event,
  sessionId: string,
  attachmentId: string,
): Promise<string> {
  const previewPath = buildPilotAttachmentPreviewUrl(sessionId, attachmentId)
  const runtimeConfig = await resolvePilotAttachmentRuntimeConfig(event)
  if (!runtimeConfig.attachmentPublicBaseUrl) {
    return previewPath
  }

  const absoluteUrl = joinBaseUrl(runtimeConfig.attachmentPublicBaseUrl, previewPath)
  if (!runtimeConfig.attachmentSigningSecret) {
    return absoluteUrl
  }

  const expiresAt = Date.now() + ATTACHMENT_SIGN_EXPIRES_MS
  const payload = buildAttachmentSignaturePayload(sessionId, attachmentId, expiresAt)
  const signature = buildAttachmentSignature(runtimeConfig.attachmentSigningSecret, payload)
  return `${absoluteUrl}?exp=${expiresAt}&sig=${signature}`
}

export function verifyPilotAttachmentSignedAccess(
  event: H3Event,
  input: VerifyPilotAttachmentSignedAccessInput,
): boolean {
  const secret = resolveAttachmentSigningSecret(event)
  if (!secret) {
    return false
  }

  const expiresAt = Number(input.expiresAt)
  if (!Number.isFinite(expiresAt)) {
    return false
  }

  const now = Date.now()
  if (expiresAt <= now || expiresAt - now > ATTACHMENT_SIGN_MAX_SKEW_MS) {
    return false
  }

  const payload = buildAttachmentSignaturePayload(input.sessionId, input.attachmentId, expiresAt)
  const expected = buildAttachmentSignature(secret, payload)
  return expected === String(input.signature || '')
}

export async function resolvePilotAttachmentModelUrl(
  event: H3Event,
  input: ResolvePilotAttachmentModelUrlInput,
): Promise<string> {
  const fallback = await buildPilotAttachmentSignedPreviewUrl(event, input.sessionId, input.attachmentId)
  const parsed = parsePilotAttachmentRef(input.ref)
  if (!parsed) {
    return fallback
  }

  if (parsed.provider !== 's3') {
    return fallback
  }

  const runtimeConfig = await resolvePilotAttachmentRuntimeConfig(event)
  if (!runtimeConfig.s3Config) {
    return fallback
  }

  try {
    return await createS3SignedReadUrl(runtimeConfig.s3Config, parsed.key)
  }
  catch {
    return fallback
  }
}
