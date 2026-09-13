import { VOICE_ASR_PROTOCOLS, type VoiceAsrProtocol } from '../intelligence/voice-asr'
import {
  CATALOG_CLIENT_SDKAPI,
  CATALOG_CONTRACT_VERSION,
  CATALOG_ERROR_CODES,
  CATALOG_MAX_PACK_BYTES,
  CATALOG_SCHEMA_VERSION,
  CatalogContractError,
  type CatalogErrorCode
} from './catalog'
import { isAppLocale, type AppLocale } from './locale'
import type { LocalizedText } from './localized'

/**
 * Declarative, signed voice-provider descriptor pack.
 *
 * The payload is data only: it may move endpoints, header allowlists, model lists and limits, but
 * it never carries credentials and it never defines protocol semantics. There is no code path in
 * this module (or its consumers) that evaluates remote content.
 */

export const VOICE_PROVIDER_PACK_TYPE = 'voice-provider' as const

export const VOICE_PROVIDER_MAX_PROVIDERS = 32
export const VOICE_PROVIDER_MAX_MODELS = 32
export const VOICE_PROVIDER_MAX_LANGUAGES = 16
export const VOICE_PROVIDER_MAX_HEADERS = 16
export const VOICE_PROVIDER_MAX_STRING_LENGTH = 256
export const VOICE_PROVIDER_MAX_ID_LENGTH = 128
export const VOICE_PROVIDER_MAX_PATH_LENGTH = 512
export const VOICE_PROVIDER_MAX_BASE_URL_LENGTH = 512
export const VOICE_PROVIDER_MAX_LIMIT_BYTES = 1024 * 1024 * 1024
export const VOICE_PROVIDER_MAX_LIMIT_DURATION_SEC = 86_400
export const VOICE_PROVIDER_MAX_LIMIT_TIMEOUT_MS = 3_600_000

export const VOICE_PROVIDER_TRANSPORTS = ['http-upload', 'http-realtime', 'ws-realtime'] as const
export type VoiceProviderTransport = (typeof VOICE_PROVIDER_TRANSPORTS)[number]

export const VOICE_PROVIDER_AUTH_MODES = ['nexus-session', 'secure-store-ref'] as const
export type VoiceProviderAuthMode = (typeof VOICE_PROVIDER_AUTH_MODES)[number]

export const VOICE_PROVIDER_REQUEST_BODIES = ['raw-bytes', 'multipart'] as const
export type VoiceProviderRequestBody = (typeof VOICE_PROVIDER_REQUEST_BODIES)[number]

export const VOICE_PROVIDER_CONTENT_TYPE_POLICY = 'audio/*' as const

/**
 * Header names a pack may set. `authorization`, `cookie`, and every credential-bearing header stay
 * client-owned and are rejected even if a future entry is added here by mistake.
 */
export const VOICE_PROVIDER_ALLOWED_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'x-idempotency-key',
  'x-request-id',
  'x-client-version',
  'x-app-version',
  'x-audio-format',
  'x-audio-sample-rate',
  'x-audio-channels',
  'x-audio-duration-ms'
] as const

/** Credential-bearing headers that a pack may never set, allowlist or not. */
export const VOICE_PROVIDER_FORBIDDEN_HEADERS = [
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'x-api-key'
] as const

export const VOICE_PROVIDER_REJECTION_REASONS = [
  'unknown-key',
  'invalid-schema',
  'bad-endpoint',
  'bad-protocol',
  'bad-header',
  'duplicate-provider',
  'sdkapi-too-new',
  'expired',
  'too-large'
] as const

export type VoiceProviderRejectionReason =
  (typeof VOICE_PROVIDER_REJECTION_REASONS)[number]

export interface VoiceProviderEndpointV1 {
  baseUrl: string
  submitPath: string
  pollPath?: string
}

export interface VoiceProviderAuthV1 {
  mode: VoiceProviderAuthMode
  ref?: string
}

export interface VoiceProviderRequestV1 {
  body: VoiceProviderRequestBody
  contentTypePolicy: typeof VOICE_PROVIDER_CONTENT_TYPE_POLICY
  headers?: Record<string, string>
  idempotencyHeader?: string
}

export interface VoiceProviderModelV1 {
  id: string
  label?: string
  languages?: readonly string[]
}

export interface VoiceProviderLimitsV1 {
  maxBytes: number
  maxDurationSec: number
  timeoutMs: number
}

export interface VoiceProviderDescriptorV1 {
  id: string
  displayName: LocalizedText
  protocol: VoiceAsrProtocol
  transport: VoiceProviderTransport
  endpoint: VoiceProviderEndpointV1
  auth: VoiceProviderAuthV1
  request: VoiceProviderRequestV1
  models: readonly VoiceProviderModelV1[]
  limits: VoiceProviderLimitsV1
}

export interface VoiceProviderPackV1 {
  contractVersion: typeof CATALOG_CONTRACT_VERSION
  type: typeof VOICE_PROVIDER_PACK_TYPE
  packId: string
  version: string
  schemaVersion: typeof CATALOG_SCHEMA_VERSION
  createdAt: string
  minSdkApi: number
  expiry?: string
  providers: readonly VoiceProviderDescriptorV1[]
}

export type VoiceProviderNormalizeResult =
  | { readonly ok: true; readonly pack: VoiceProviderPackV1 }
  | {
      readonly ok: false
      readonly reason: VoiceProviderRejectionReason
      readonly message: string
    }

export interface VoiceProviderNormalizeOptions {
  /** Overrides the clock used for the `expired` rule (tests pass a fixed value). */
  now?: number
  /** Overrides the client sdkapi used for the `sdkapi-too-new` rule. */
  clientSdkApi?: number
}

const PACK_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/
const VERSION_PATTERN = /^(?:0|[1-9][0-9]*)$/
const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/
const HEADER_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

class VoiceProviderRejection extends Error {
  constructor(
    readonly reason: VoiceProviderRejectionReason,
    message: string
  ) {
    super(message)
    this.name = 'VoiceProviderRejection'
  }
}

function reject(reason: VoiceProviderRejectionReason, message: string): never {
  throw new VoiceProviderRejection(reason, message)
}

/**
 * Normalizes one pack payload. Never throws for invalid input: every rejection is reported as a
 * typed reason so callers can project it without parsing messages.
 */
export function normalizeVoiceProviderPack(
  value: unknown,
  options: VoiceProviderNormalizeOptions = {}
): VoiceProviderNormalizeResult {
  try {
    return { ok: true, pack: normalizeVoiceProviderPackValue(value, options) }
  } catch (error) {
    if (error instanceof VoiceProviderRejection) {
      return { ok: false, reason: error.reason, message: error.message }
    }
    throw error
  }
}

/** Throwing wrapper used by verification and persistence paths. */
export function parseVoiceProviderCatalogPackBytes(
  bytes: Uint8Array,
  options: VoiceProviderNormalizeOptions = {}
): VoiceProviderPackV1 {
  if (bytes.byteLength > CATALOG_MAX_PACK_BYTES) {
    throw new CatalogContractError(
      CATALOG_ERROR_CODES.payloadTooLarge,
      'Voice provider payload exceeds the supported byte limit'
    )
  }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new CatalogContractError(
      CATALOG_ERROR_CODES.packInvalid,
      'Voice provider payload is not valid UTF-8 JSON'
    )
  }
  return unwrapVoiceProviderPack(normalizeVoiceProviderPack(value, options))
}

/** Canonical byte projection; hashing these bytes is what the signed manifest commits to. */
export function serializeVoiceProviderCatalogPack(pack: VoiceProviderPackV1): Uint8Array {
  const result = normalizeVoiceProviderPack(pack)
  if (!result.ok) {
    throw new CatalogContractError(
      voiceProviderRejectionToErrorCode(result.reason),
      result.message
    )
  }
  return encodeUtf8(stableStringify(result.pack))
}

export function unwrapVoiceProviderPack(
  result: VoiceProviderNormalizeResult
): VoiceProviderPackV1 {
  if (result.ok) return result.pack
  throw new CatalogContractError(
    voiceProviderRejectionToErrorCode(result.reason),
    result.message
  )
}

export function voiceProviderRejectionToErrorCode(
  reason: VoiceProviderRejectionReason
): CatalogErrorCode {
  switch (reason) {
    case 'sdkapi-too-new':
      return CATALOG_ERROR_CODES.sdkIncompatible
    case 'expired':
      return CATALOG_ERROR_CODES.packExpired
    case 'too-large':
      return CATALOG_ERROR_CODES.payloadTooLarge
    default:
      return CATALOG_ERROR_CODES.packInvalid
  }
}

/**
 * Read-only active registry facade. Consumers resolve descriptors by id; the pack identity and
 * limits stay alongside so the runtime can fail closed without re-reading remote input.
 */
export class VoiceProviderRegistry {
  private readonly byId: ReadonlyMap<string, VoiceProviderDescriptorV1>
  readonly packId: string
  readonly version: string
  readonly schemaVersion: typeof CATALOG_SCHEMA_VERSION
  readonly createdAt: string
  readonly minSdkApi: number
  readonly expiry?: string
  readonly providers: readonly VoiceProviderDescriptorV1[]

  constructor(pack: VoiceProviderPackV1) {
    const byId = new Map<string, VoiceProviderDescriptorV1>()
    for (const provider of pack.providers) {
      if (byId.has(provider.id)) {
        throw new Error(`Voice provider registry contains a duplicate id: ${provider.id}`)
      }
      byId.set(provider.id, provider)
    }
    this.byId = byId
    this.packId = pack.packId
    this.version = pack.version
    this.schemaVersion = pack.schemaVersion
    this.createdAt = pack.createdAt
    this.minSdkApi = pack.minSdkApi
    this.expiry = pack.expiry
    this.providers = Object.freeze([...pack.providers])
    Object.freeze(this)
  }

  get size(): number {
    return this.providers.length
  }

  list(): readonly VoiceProviderDescriptorV1[] {
    return this.providers
  }

  get(id: string): VoiceProviderDescriptorV1 | undefined {
    return this.byId.get(id)
  }

  has(id: string): boolean {
    return this.byId.has(id)
  }
}

function normalizeVoiceProviderPackValue(
  value: unknown,
  options: VoiceProviderNormalizeOptions
): VoiceProviderPackV1 {
  const record = requireRecord(value, 'invalid-schema', 'Voice provider pack must be an object')
  assertExactKeys(
    record,
    [
      'contractVersion',
      'type',
      'packId',
      'version',
      'schemaVersion',
      'createdAt',
      'minSdkApi',
      'expiry',
      'providers'
    ],
    'voice provider pack',
    ['expiry']
  )

  requireLiteral(record.contractVersion, CATALOG_CONTRACT_VERSION, 'contractVersion')
  requireLiteral(record.type, VOICE_PROVIDER_PACK_TYPE, 'type')
  requireLiteral(record.schemaVersion, CATALOG_SCHEMA_VERSION, 'schemaVersion')

  const packId = normalizeId(record.packId, PACK_ID_PATTERN, 'packId')
  const version = normalizeVersion(record.version)
  const createdAt = normalizeTimestamp(record.createdAt, 'createdAt')
  const minSdkApi = normalizeInteger(record.minSdkApi, 0, 'minSdkApi')

  const clientSdkApi = options.clientSdkApi ?? CATALOG_CLIENT_SDKAPI
  if (minSdkApi > clientSdkApi) {
    reject('sdkapi-too-new', 'Voice provider pack requires a newer client sdkapi')
  }

  let expiry: string | undefined
  if (record.expiry !== undefined) {
    expiry = normalizeTimestamp(record.expiry, 'expiry')
    const now = options.now ?? Date.now()
    if (Date.parse(expiry) <= now) {
      reject('expired', 'Voice provider pack is expired')
    }
  }

  if (!Array.isArray(record.providers)) {
    reject('invalid-schema', 'Voice provider pack providers must be an array')
  }
  if (record.providers.length === 0) {
    reject('invalid-schema', 'Voice provider pack must declare at least one provider')
  }
  if (record.providers.length > VOICE_PROVIDER_MAX_PROVIDERS) {
    reject('too-large', 'Voice provider pack declares too many providers')
  }

  const providers: VoiceProviderDescriptorV1[] = []
  const ids = new Set<string>()
  for (const provider of record.providers) {
    const descriptor = normalizeProvider(provider)
    if (ids.has(descriptor.id)) {
      reject('duplicate-provider', 'Voice provider pack contains a duplicate provider id')
    }
    ids.add(descriptor.id)
    providers.push(descriptor)
  }

  return Object.freeze({
    contractVersion: CATALOG_CONTRACT_VERSION,
    type: VOICE_PROVIDER_PACK_TYPE,
    packId,
    version,
    schemaVersion: CATALOG_SCHEMA_VERSION,
    createdAt,
    minSdkApi,
    ...(expiry === undefined ? {} : { expiry }),
    providers: Object.freeze(providers)
  })
}

function normalizeProvider(value: unknown): VoiceProviderDescriptorV1 {
  const record = requireRecord(value, 'invalid-schema', 'Voice provider must be an object')
  assertExactKeys(
    record,
    [
      'id',
      'displayName',
      'protocol',
      'transport',
      'endpoint',
      'auth',
      'request',
      'models',
      'limits'
    ],
    'voice provider'
  )

  const protocol = record.protocol
  if (
    typeof protocol !== 'string' ||
    !(VOICE_ASR_PROTOCOLS as readonly string[]).includes(protocol)
  ) {
    reject('bad-protocol', 'Voice provider protocol is not a supported ASR protocol')
  }

  const transport = record.transport
  if (
    typeof transport !== 'string' ||
    !(VOICE_PROVIDER_TRANSPORTS as readonly string[]).includes(transport)
  ) {
    reject('invalid-schema', 'Voice provider transport is invalid')
  }

  const endpoint = normalizeEndpoint(record.endpoint)
  const auth = normalizeAuth(record.auth)
  const request = normalizeRequest(record.request)
  if (
    protocol === 'nexus-pack' &&
    (transport !== 'http-upload' ||
      auth.mode !== 'nexus-session' ||
      request.body !== 'raw-bytes' ||
      request.idempotencyHeader !== 'x-idempotency-key' ||
      !endpoint.pollPath)
  ) {
    reject('bad-protocol', 'Nexus voice catalog route has an incompatible descriptor shape')
  }

  return Object.freeze({
    id: normalizeId(record.id, ID_PATTERN, 'provider id'),
    displayName: normalizeDisplayName(record.displayName),
    protocol: protocol as VoiceAsrProtocol,
    transport: transport as VoiceProviderTransport,
    endpoint,
    auth,
    request,
    models: normalizeModels(record.models),
    limits: normalizeLimits(record.limits)
  })
}

function normalizeEndpoint(value: unknown): VoiceProviderEndpointV1 {
  const record = requireRecord(value, 'invalid-schema', 'Voice provider endpoint must be an object')
  assertExactKeys(record, ['baseUrl', 'submitPath', 'pollPath'], 'voice provider endpoint', [
    'pollPath'
  ])

  const baseUrl = normalizeBaseUrl(record.baseUrl)
  const submitPath = normalizeEndpointPath(record.submitPath, 'submitPath', false)
  const normalized: VoiceProviderEndpointV1 = { baseUrl, submitPath }
  if (record.pollPath !== undefined) {
    normalized.pollPath = normalizeEndpointPath(record.pollPath, 'pollPath', true)
  }
  return Object.freeze(normalized)
}

function normalizeBaseUrl(value: unknown): string {
  const text = boundedText(value, VOICE_PROVIDER_MAX_BASE_URL_LENGTH, 'endpoint baseUrl', 'invalid-schema')
  let url: URL
  try {
    url = new URL(text)
  } catch {
    reject('bad-endpoint', 'Voice provider baseUrl is not a valid URL')
  }
  if (url.protocol !== 'https:') {
    reject('bad-endpoint', 'Voice provider baseUrl must use https')
  }
  if (url.username || url.password) {
    reject('bad-endpoint', 'Voice provider baseUrl must not carry userinfo')
  }
  if (url.search) {
    reject('bad-endpoint', 'Voice provider baseUrl must not carry a query string')
  }
  if (url.hash) {
    reject('bad-endpoint', 'Voice provider baseUrl must not carry a fragment')
  }
  if (!url.hostname) {
    reject('bad-endpoint', 'Voice provider baseUrl must carry a host')
  }
  return text
}

function normalizeEndpointPath(value: unknown, label: string, requiresPlaceholder: boolean): string {
  const text = boundedText(value, VOICE_PROVIDER_MAX_PATH_LENGTH, label, 'invalid-schema')
  if (!text.startsWith('/') || text.includes('://') || /[?#]/.test(text) || /\s/.test(text)) {
    reject('invalid-schema', `Voice provider ${label} must be a relative path`)
  }
  if (requiresPlaceholder && !text.includes(':requestId')) {
    reject('invalid-schema', 'Voice provider pollPath must carry a :requestId placeholder')
  }
  return text
}

function normalizeAuth(value: unknown): VoiceProviderAuthV1 {
  const record = requireRecord(value, 'invalid-schema', 'Voice provider auth must be an object')
  assertExactKeys(record, ['mode', 'ref'], 'voice provider auth', ['ref'])
  const mode = record.mode
  if (
    typeof mode !== 'string' ||
    !(VOICE_PROVIDER_AUTH_MODES as readonly string[]).includes(mode)
  ) {
    reject('invalid-schema', 'Voice provider auth mode is invalid')
  }
  if (mode === 'secure-store-ref') {
    if (record.ref === undefined) {
      reject('invalid-schema', 'Voice provider secure-store-ref auth requires a ref')
    }
    return Object.freeze({
      mode: 'secure-store-ref' as const,
      ref: normalizeId(record.ref, ID_PATTERN, 'auth ref')
    })
  }
  if (record.ref !== undefined) {
    reject('invalid-schema', 'Voice provider nexus-session auth must not carry a ref')
  }
  return Object.freeze({ mode: 'nexus-session' as const })
}

function normalizeRequest(value: unknown): VoiceProviderRequestV1 {
  const record = requireRecord(value, 'invalid-schema', 'Voice provider request must be an object')
  assertExactKeys(
    record,
    ['body', 'contentTypePolicy', 'headers', 'idempotencyHeader'],
    'voice provider request',
    ['headers', 'idempotencyHeader']
  )

  const body = record.body
  if (
    typeof body !== 'string' ||
    !(VOICE_PROVIDER_REQUEST_BODIES as readonly string[]).includes(body)
  ) {
    reject('invalid-schema', 'Voice provider request body is invalid')
  }
  if (record.contentTypePolicy !== VOICE_PROVIDER_CONTENT_TYPE_POLICY) {
    reject('invalid-schema', 'Voice provider contentTypePolicy is invalid')
  }

  const normalized: VoiceProviderRequestV1 = {
    body: body as VoiceProviderRequestBody,
    contentTypePolicy: VOICE_PROVIDER_CONTENT_TYPE_POLICY
  }
  if (record.headers !== undefined) {
    normalized.headers = normalizeHeaders(record.headers)
  }
  if (record.idempotencyHeader !== undefined) {
    normalized.idempotencyHeader = normalizeHeaderName(
      record.idempotencyHeader,
      'idempotencyHeader'
    )
  }
  return Object.freeze(normalized)
}

function normalizeHeaders(value: unknown): Record<string, string> {
  const record = requireRecord(value, 'invalid-schema', 'Voice provider headers must be an object')
  const keys = Object.keys(record)
  if (keys.length > VOICE_PROVIDER_MAX_HEADERS) {
    reject('too-large', 'Voice provider headers exceed the supported count')
  }
  const normalized: Record<string, string> = {}
  for (const key of keys) {
    const name = normalizeHeaderName(key, 'header name')
    if (name in normalized) {
      reject('bad-header', 'Voice provider headers contain a duplicate name')
    }
    normalized[name] = boundedText(
      record[key],
      VOICE_PROVIDER_MAX_STRING_LENGTH,
      'header value',
      'invalid-schema'
    )
  }
  return Object.freeze(normalized)
}

function normalizeHeaderName(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    reject('bad-header', `Voice provider ${label} is invalid`)
  }
  const name = value.trim().toLowerCase()
  if (!name || !HEADER_NAME_PATTERN.test(name)) {
    reject('bad-header', `Voice provider ${label} is malformed`)
  }
  if ((VOICE_PROVIDER_FORBIDDEN_HEADERS as readonly string[]).includes(name)) {
    reject('bad-header', 'Voice provider headers must not carry credentials')
  }
  if (!(VOICE_PROVIDER_ALLOWED_HEADERS as readonly string[]).includes(name)) {
    reject('bad-header', 'Voice provider header is not allowlisted')
  }
  return name
}

function normalizeModels(value: unknown): readonly VoiceProviderModelV1[] {
  if (!Array.isArray(value)) {
    reject('invalid-schema', 'Voice provider models must be an array')
  }
  if (value.length === 0) {
    reject('invalid-schema', 'Voice provider must declare at least one model')
  }
  if (value.length > VOICE_PROVIDER_MAX_MODELS) {
    reject('too-large', 'Voice provider models exceed the supported count')
  }
  const models: VoiceProviderModelV1[] = []
  const ids = new Set<string>()
  for (const model of value) {
    const record = requireRecord(model, 'invalid-schema', 'Voice provider model must be an object')
    assertExactKeys(record, ['id', 'label', 'languages'], 'voice provider model', [
      'label',
      'languages'
    ])
    const id = normalizeId(record.id, ID_PATTERN, 'model id')
    if (ids.has(id)) {
      reject('invalid-schema', 'Voice provider contains a duplicate model id')
    }
    ids.add(id)
    const normalized: VoiceProviderModelV1 = { id }
    if (record.label !== undefined) {
      normalized.label = boundedText(
        record.label,
        VOICE_PROVIDER_MAX_STRING_LENGTH,
        'model label',
        'invalid-schema'
      )
    }
    if (record.languages !== undefined) {
      normalized.languages = normalizeLanguages(record.languages)
    }
    models.push(Object.freeze(normalized))
  }
  return Object.freeze(models)
}

function normalizeLanguages(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    reject('invalid-schema', 'Voice provider model languages must be an array')
  }
  if (value.length === 0 || value.length > VOICE_PROVIDER_MAX_LANGUAGES) {
    reject('too-large', 'Voice provider model languages exceed the supported count')
  }
  const languages: string[] = []
  for (const language of value) {
    languages.push(
      boundedText(language, VOICE_PROVIDER_MAX_STRING_LENGTH, 'model language', 'invalid-schema')
    )
  }
  return Object.freeze(languages)
}

function normalizeDisplayName(value: unknown): LocalizedText {
  const record = requireRecord(value, 'invalid-schema', 'Voice provider displayName must be an object')
  assertExactKeys(record, ['default', 'locales'], 'voice provider displayName', ['locales'])
  const normalized: { default: string; locales?: Partial<Record<AppLocale, string>> } = {
    default: boundedText(
      record.default,
      VOICE_PROVIDER_MAX_STRING_LENGTH,
      'displayName default',
      'invalid-schema'
    )
  }
  if (record.locales !== undefined) {
    const locales = requireRecord(
      record.locales,
      'invalid-schema',
      'Voice provider displayName locales must be an object'
    )
    const mapped: Partial<Record<AppLocale, string>> = {}
    for (const key of Object.keys(locales)) {
      if (!isAppLocale(key)) {
        reject('invalid-schema', 'Voice provider displayName contains an unsupported locale')
      }
      mapped[key] = boundedText(
        locales[key],
        VOICE_PROVIDER_MAX_STRING_LENGTH,
        'displayName locale',
        'invalid-schema'
      )
    }
    normalized.locales = Object.freeze(mapped)
  }
  return Object.freeze(normalized)
}

function normalizeLimits(value: unknown): VoiceProviderLimitsV1 {
  const record = requireRecord(value, 'invalid-schema', 'Voice provider limits must be an object')
  assertExactKeys(record, ['maxBytes', 'maxDurationSec', 'timeoutMs'], 'voice provider limits')
  return Object.freeze({
    maxBytes: normalizeLimit(record.maxBytes, VOICE_PROVIDER_MAX_LIMIT_BYTES, 'maxBytes'),
    maxDurationSec: normalizeLimit(
      record.maxDurationSec,
      VOICE_PROVIDER_MAX_LIMIT_DURATION_SEC,
      'maxDurationSec'
    ),
    timeoutMs: normalizeLimit(record.timeoutMs, VOICE_PROVIDER_MAX_LIMIT_TIMEOUT_MS, 'timeoutMs')
  })
}

function normalizeLimit(value: unknown, maximum: number, label: string): number {
  const parsed = normalizeInteger(value, 1, label)
  if (parsed > maximum) {
    reject('too-large', `Voice provider limit ${label} exceeds the supported bound`)
  }
  return parsed
}

function normalizeId(value: unknown, pattern: RegExp, label: string): string {
  const text = boundedText(value, VOICE_PROVIDER_MAX_ID_LENGTH, `${label}`, 'invalid-schema')
  if (!pattern.test(text)) {
    reject('invalid-schema', `Voice provider ${label} is malformed`)
  }
  return text
}

function normalizeVersion(value: unknown): string {
  const text = boundedText(value, 64, 'version', 'invalid-schema')
  if (!VERSION_PATTERN.test(text)) {
    reject('invalid-schema', 'Voice provider version must be a decimal string')
  }
  return text
}

function normalizeTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ISO_TIMESTAMP_PATTERN.test(value)) {
    reject('invalid-schema', `Voice provider ${label} is malformed`)
  }
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    reject('invalid-schema', `Voice provider ${label} is invalid`)
  }
  return value
}

function normalizeInteger(value: unknown, minimum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    reject('invalid-schema', `Voice provider ${label} must be a non-negative integer`)
  }
  return value as number
}

function requireLiteral<T extends string | number>(
  value: unknown,
  expected: T,
  label: string
): T {
  if (value !== expected) {
    reject('invalid-schema', `Voice provider ${label} is unsupported`)
  }
  return expected
}

function boundedText(
  value: unknown,
  maxLength: number,
  label: string,
  typeReason: VoiceProviderRejectionReason
): string {
  if (typeof value !== 'string') {
    reject(typeReason, `Voice provider ${label} must be a string`)
  }
  const text = value.trim()
  if (!text || hasControlCharacter(text)) {
    reject(typeReason, `Voice provider ${label} is invalid`)
  }
  if (text.length > maxLength) {
    reject('too-large', `Voice provider ${label} exceeds the supported length`)
  }
  return text
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function requireRecord(
  value: unknown,
  reason: VoiceProviderRejectionReason,
  message: string
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    reject(reason, message)
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    reject(reason, message)
  }
  return value as Record<string, unknown>
}

function assertExactKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
  optional: readonly string[] = []
): void {
  const allowedKeys = new Set(allowed)
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      reject('unknown-key', `${label} contains an unknown field`)
    }
  }
  const optionalKeys = new Set(optional)
  for (const key of allowed) {
    if (!(key in record) && !optionalKeys.has(key)) {
      reject('invalid-schema', `${label} is missing a required field`)
    }
  }
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value))
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue)
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortJsonValue(record[key])])
    )
  }
  return value
}
