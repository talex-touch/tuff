import type { H3Event } from 'h3'
import { createHmac } from 'node:crypto'
import { AwsClient } from 'aws4fetch'
import { getRequestURL } from 'h3'
import { getPilotAdminStorageSettings } from './pilot-admin-storage-config'
import { resolvePilotConfigString } from './pilot-config'

export type PilotAttachmentStorageProvider = 'memory' | 's3'

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
const ATTACHMENT_SIGN_EXPIRES_MS = 10 * 60 * 1000
const ATTACHMENT_SIGN_MAX_SKEW_MS = 24 * 60 * 60 * 1000
let hasWarnedS3Fallback = false

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
  if (normalized === 'memory' || normalized === 's3') {
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

function logS3Fallback(message: string): void {
  if (hasWarnedS3Fallback) {
    return
  }
  hasWarnedS3Fallback = true
  console.warn(`[pilot][attachment] ${message}; fallback to memory storage`)
}

function resolveStorageProviderMode(adminProvider: string | undefined): StorageProviderMode {
  const fromAdmin = normalizeStorageProviderMode(adminProvider)
  if (fromAdmin !== 'auto') {
    return fromAdmin
  }
  return 'auto'
}

function resolveStorageProviderModeWithEnv(
  event: H3Event,
  adminProvider: string | undefined,
): StorageProviderMode {
  const fromAdmin = resolveStorageProviderMode(adminProvider)
  if (fromAdmin !== 'auto') {
    return fromAdmin
  }
  const fromEnv = normalizeStorageProviderMode(
    resolvePilotConfigString(event, 'attachmentProvider', ['PILOT_ATTACHMENT_PROVIDER']),
  )
  if (fromEnv !== 'auto') {
    return fromEnv
  }
  return 'auto'
}

function resolvePilotS3Config(
  event: H3Event,
  adminConfig: Awaited<ReturnType<typeof getPilotAdminStorageSettings>>,
): PilotS3Config | null {
  const endpoint = normalizeUrl(adminConfig.minioEndpoint || resolvePilotConfigString(event, 'minioEndpoint', ['PILOT_MINIO_ENDPOINT']))
  const bucket = String(adminConfig.minioBucket || resolvePilotConfigString(event, 'minioBucket', ['PILOT_MINIO_BUCKET'])).trim()
  const accessKeyId = String(adminConfig.minioAccessKey || resolvePilotConfigString(event, 'minioAccessKey', ['PILOT_MINIO_ACCESS_KEY'])).trim()
  const secretAccessKey = String(adminConfig.minioSecretKey || resolvePilotConfigString(event, 'minioSecretKey', ['PILOT_MINIO_SECRET_KEY'])).trim()

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null
  }

  const region = String(adminConfig.minioRegion || resolvePilotConfigString(event, 'minioRegion', ['PILOT_MINIO_REGION'], S3_REGION_FALLBACK)).trim() || S3_REGION_FALLBACK
  const forcePathStyleRaw = adminConfig.minioForcePathStyle === undefined
    ? resolvePilotConfigString(event, 'minioForcePathStyle', ['PILOT_MINIO_FORCE_PATH_STYLE'], 'true')
    : (adminConfig.minioForcePathStyle ? 'true' : 'false')
  const publicBaseUrl = normalizeUrl(adminConfig.minioPublicBaseUrl || resolvePilotConfigString(event, 'minioPublicBaseUrl', ['PILOT_MINIO_PUBLIC_BASE_URL']))

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
  const configured = normalizeUrl(
    adminConfig.attachmentPublicBaseUrl
    || resolvePilotConfigString(event, 'attachmentPublicBaseUrl', ['PILOT_ATTACHMENT_PUBLIC_BASE_URL']),
  )
  if (configured) {
    return configured
  }
  return normalizeUrl(resolvePublicRequestOrigin(event))
}

function resolveAttachmentSigningSecret(event: H3Event): string {
  const attachmentSigningSecret = String(
    resolvePilotConfigString(event, 'attachmentSigningSecret', ['PILOT_ATTACHMENT_SIGNING_SECRET']),
  ).trim()
  if (attachmentSigningSecret) {
    return attachmentSigningSecret
  }
  return String(resolvePilotConfigString(event, 'cookieSecret', ['PILOT_COOKIE_SECRET'])).trim()
}

async function resolvePilotAttachmentRuntimeConfig(event: H3Event): Promise<PilotAttachmentRuntimeConfig> {
  const context = event.context as PilotEventContext
  if (!context.__pilotAttachmentRuntimeConfigPromise) {
    context.__pilotAttachmentRuntimeConfigPromise = (async () => {
      const adminConfig = await getPilotAdminStorageSettings(event).catch(
        (): Awaited<ReturnType<typeof getPilotAdminStorageSettings>> => ({}),
      )
      return {
        providerMode: resolveStorageProviderModeWithEnv(event, adminConfig.attachmentProvider),
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
    if (scheme === 'memory' || scheme === 's3') {
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

  return null
}

export function buildPilotAttachmentPreviewUrl(sessionId: string, attachmentId: string): string {
  const normalizedSessionId = encodeURIComponent(String(sessionId || '').trim())
  const normalizedAttachmentId = encodeURIComponent(String(attachmentId || '').trim())
  return `/api/pilot/chat/sessions/${normalizedSessionId}/attachments/${normalizedAttachmentId}/content`
}

function resolveWriteProvider(
  mode: StorageProviderMode,
  s3Config: PilotS3Config | null,
): PilotAttachmentStorageProvider {
  if (mode === 'memory') {
    return 'memory'
  }
  if (mode === 's3') {
    if (s3Config) {
      return 's3'
    }
    logS3Fallback('attachment provider is s3/minio but MinIO config is incomplete')
    return 'memory'
  }
  if (s3Config) {
    return 's3'
  }
  return 'memory'
}

export async function getPilotAttachmentUploadAvailability(event: H3Event): Promise<PilotAttachmentUploadAvailability> {
  const runtimeConfig = await resolvePilotAttachmentRuntimeConfig(event)
  const provider = resolveWriteProvider(runtimeConfig.providerMode, runtimeConfig.s3Config)
  const hasS3Config = Boolean(runtimeConfig.s3Config)
  const hasPublicBaseUrl = Boolean(runtimeConfig.attachmentPublicBaseUrl)
  const reason = runtimeConfig.providerMode === 's3' && !hasS3Config
    ? 'Attachment provider is set to s3/minio but MinIO configuration is incomplete. Fallback to memory.'
    : undefined

  return {
    allowed: true,
    reason,
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
  const provider = resolveWriteProvider(runtimeConfig.providerMode, runtimeConfig.s3Config)

  if (provider === 's3') {
    if (!runtimeConfig.s3Config) {
      logS3Fallback('attachment provider resolved to s3 but runtime MinIO config is missing')
    }
    else {
      try {
        await putObjectToS3(runtimeConfig.s3Config, key, bytes, mimeType)
        return {
          provider: 's3',
          key,
          ref: createPilotAttachmentRef('s3', key),
        }
      }
      catch (error) {
        console.error('[pilot][attachment] failed to upload object to MinIO/S3, fallback to memory storage', {
          key,
          error: error instanceof Error ? error.message : String(error),
        })
      }
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

  const runtimeConfig = await resolvePilotAttachmentRuntimeConfig(event)
  if (!runtimeConfig.s3Config) {
    return null
  }
  return await readObjectFromS3(runtimeConfig.s3Config, parsed.key)
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

  const runtimeConfig = await resolvePilotAttachmentRuntimeConfig(event)
  if (runtimeConfig.s3Config) {
    await deleteObjectFromS3(runtimeConfig.s3Config, parsed.key)
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
  if (!parsed || parsed.provider !== 's3') {
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
