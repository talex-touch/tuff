import type { H3Event } from 'h3'
import type { Buffer } from 'node:buffer'
import { createError } from 'h3'
import { createHash, createHmac } from 'node:crypto'
import { networkClient } from '@talex-touch/utils/network'
import type { ProviderRegistryRecord } from './providerRegistryStore'
import { assertSecretPairCredential, getProviderCredential } from './providerCredentialStore'

const TENCENT_TMT_DEFAULT_ENDPOINT = 'https://tmt.tencentcloudapi.com'
const TENCENT_TMT_SERVICE = 'tmt'
const TENCENT_TMT_VERSION = '2018-03-21'
const TENCENT_TMT_ACTION = 'TextTranslate'
const TENCENT_TMT_DEFAULT_REGION = 'ap-shanghai'
const DEFAULT_CHECK_CAPABILITY = 'text.translate'
const DEFAULT_CHECK_PAYLOAD = {
  SourceText: 'hello',
  Source: 'en',
  Target: 'zh',
  ProjectId: 0,
}

interface TencentCloudError {
  Code?: string
  Message?: string
}

interface TencentTextTranslateResponse {
  Response?: {
    TargetText?: string
    RequestId?: string
    Error?: TencentCloudError
  }
}

export interface ProviderCheckOptions {
  capability?: string
}

export interface ProviderCheckResult {
  success: boolean
  providerId: string
  capability: string
  latency: number
  endpoint: string
  requestId?: string
  message: string
  error?: {
    code?: string
    message: string
    status?: number
  }
}

export interface TencentTextTranslateInput {
  text: unknown
  sourceLang?: unknown
  targetLang: unknown
  projectId?: unknown
}

export interface TencentTextTranslateResult {
  translatedText: string
  providerRequestId?: string
  latencyMs: number
  usage: {
    unit: 'character'
    quantity: number
    billable: boolean
    estimated: boolean
  }
}

function sha256Hex(value: string) {
  return createHash('sha256').update(value, 'utf-8').digest('hex')
}

function hmacSha256(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value, 'utf-8').digest()
}

function trimEndpoint(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
  return trimmed || TENCENT_TMT_DEFAULT_ENDPOINT
}

function resolveEndpointHost(endpoint: string) {
  try {
    return new URL(endpoint).host
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Provider endpoint is invalid.' })
  }
}

function buildTencentAuthorization(input: {
  secretId: string
  secretKey: string
  host: string
  timestamp: number
  payload: string
}) {
  const date = new Date(input.timestamp * 1000).toISOString().slice(0, 10)
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${input.host}\n`
  const signedHeaders = 'content-type;host'
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256Hex(input.payload),
  ].join('\n')
  const credentialScope = `${date}/${TENCENT_TMT_SERVICE}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(input.timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const secretDate = hmacSha256(`TC3${input.secretKey}`, date)
  const secretService = hmacSha256(secretDate, TENCENT_TMT_SERVICE)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = createHmac('sha256', secretSigning).update(stringToSign, 'utf-8').digest('hex')

  return `TC3-HMAC-SHA256 Credential=${input.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
}

function buildTencentTextTranslateHeaders(input: {
  credentials: { secretId: string, secretKey: string }
  endpoint: string
  region: string
  payload: string
  timestamp: number
}) {
  const host = resolveEndpointHost(input.endpoint)
  return {
    Authorization: buildTencentAuthorization({
      secretId: input.credentials.secretId,
      secretKey: input.credentials.secretKey,
      host,
      timestamp: input.timestamp,
      payload: input.payload,
    }),
    'Content-Type': 'application/json; charset=utf-8',
    'X-TC-Action': TENCENT_TMT_ACTION,
    'X-TC-Timestamp': String(input.timestamp),
    'X-TC-Version': TENCENT_TMT_VERSION,
    'X-TC-Region': input.region,
  }
}

function hasCapability(provider: ProviderRegistryRecord, capability: string) {
  return provider.capabilities.some(item => item.capability === capability)
}

function mapTencentError(error: TencentCloudError | undefined) {
  const message = error?.Message || 'Tencent Cloud Machine Translation check failed.'
  return {
    code: error?.Code,
    message,
  }
}

function parseTencentTextTranslateResponse(data: TencentTextTranslateResponse | string): TencentTextTranslateResponse {
  return typeof data === 'string'
    ? JSON.parse(data) as TencentTextTranslateResponse
    : data
}

function normalizeTranslateText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'input.text is required.' })
  }
  return value
}

function normalizeLanguageCode(value: unknown, field: string, fallback?: string): string {
  if (value == null || value === '') {
    if (fallback)
      return fallback
    throw createError({ statusCode: 400, statusMessage: `${field} is required.` })
  }
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 32) {
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  }
  return value.trim()
}

function normalizeProjectId(value: unknown): number {
  if (value == null || value === '')
    return 0
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw createError({ statusCode: 400, statusMessage: 'input.projectId is invalid.' })
  }
  return numeric
}

async function resolveSecretPairCredential(event: H3Event, provider: ProviderRegistryRecord) {
  if (!provider.authRef) {
    throw createError({ statusCode: 401, statusMessage: 'Provider authRef is missing.' })
  }

  const credentialPayload = await getProviderCredential(event, provider.authRef)
  try {
    return assertSecretPairCredential(credentialPayload)
  }
  catch {
    throw createError({ statusCode: 401, statusMessage: 'Provider secret_pair credential is missing.' })
  }
}

function createProviderRequestError(message: string, status?: number) {
  return createError({
    statusCode: 502,
    statusMessage: message,
    data: {
      code: 'PROVIDER_REQUEST_FAILED',
      message,
      status,
    },
  })
}

export async function invokeTencentTextTranslate(
  event: H3Event,
  provider: ProviderRegistryRecord,
  input: TencentTextTranslateInput,
): Promise<TencentTextTranslateResult> {
  if (provider.vendor !== 'tencent-cloud' || provider.authType !== 'secret_pair') {
    throw createError({ statusCode: 400, statusMessage: 'Tencent Cloud Machine Translation adapter requires a tencent-cloud secret_pair provider.' })
  }
  if (!hasCapability(provider, DEFAULT_CHECK_CAPABILITY)) {
    throw createError({ statusCode: 409, statusMessage: 'Provider capability is not supported.' })
  }

  const endpoint = trimEndpoint(provider.endpoint)
  const credentials = await resolveSecretPairCredential(event, provider)
  const region = provider.region || TENCENT_TMT_DEFAULT_REGION
  const text = normalizeTranslateText(input.text)
  const requestedSourceLang = normalizeLanguageCode(input.sourceLang, 'input.sourceLang', 'auto')
  const targetLang = normalizeLanguageCode(input.targetLang, 'input.targetLang')
  const sourceLang = requestedSourceLang === 'auto' ? 'auto' : requestedSourceLang
  const payload = JSON.stringify({
    SourceText: text,
    Source: sourceLang,
    Target: targetLang,
    ProjectId: normalizeProjectId(input.projectId),
  })
  const startedAt = Date.now()
  const response = await networkClient.request<TencentTextTranslateResponse | string>({
    method: 'POST',
    url: endpoint,
    headers: buildTencentTextTranslateHeaders({
      credentials,
      endpoint,
      region,
      payload,
      timestamp: Math.floor(Date.now() / 1000),
    }),
    body: payload,
    timeoutMs: 15000,
    validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
  })
  const latencyMs = Date.now() - startedAt
  const data = parseTencentTextTranslateResponse(response.data)
  const tencentResponse = data.Response

  if (response.status < 200 || response.status >= 300 || tencentResponse?.Error) {
    const mapped = mapTencentError(tencentResponse?.Error)
    throw createProviderRequestError(mapped.message, response.status)
  }

  if (typeof tencentResponse?.TargetText !== 'string') {
    throw createProviderRequestError('Tencent Cloud Machine Translation response is missing TargetText.', response.status)
  }

  return {
    translatedText: tencentResponse.TargetText,
    providerRequestId: tencentResponse.RequestId,
    latencyMs,
    usage: {
      unit: 'character',
      quantity: text.length,
      billable: true,
      estimated: true,
    },
  }
}

export async function checkTencentMachineTranslationProvider(
  event: H3Event,
  provider: ProviderRegistryRecord,
  options: ProviderCheckOptions = {},
): Promise<ProviderCheckResult> {
  const capability = options.capability?.trim() || DEFAULT_CHECK_CAPABILITY
  const endpoint = trimEndpoint(provider.endpoint)

  if (provider.status === 'disabled') {
    return {
      success: false,
      providerId: provider.id,
      capability,
      latency: 0,
      endpoint,
      message: 'Provider is disabled.',
      error: { code: 'PROVIDER_DISABLED', message: 'Provider is disabled.' },
    }
  }

  if (provider.vendor !== 'tencent-cloud' || provider.authType !== 'secret_pair') {
    return {
      success: false,
      providerId: provider.id,
      capability,
      latency: 0,
      endpoint,
      message: 'Provider check is not supported for this provider.',
      error: { code: 'PROVIDER_CHECK_UNSUPPORTED', message: 'Provider check is not supported for this provider.' },
    }
  }

  if (capability !== DEFAULT_CHECK_CAPABILITY || !hasCapability(provider, capability)) {
    return {
      success: false,
      providerId: provider.id,
      capability,
      latency: 0,
      endpoint,
      message: 'Provider capability is not supported.',
      error: { code: 'CAPABILITY_UNSUPPORTED', message: 'Provider capability is not supported.' },
    }
  }

  if (!provider.authRef) {
    return {
      success: false,
      providerId: provider.id,
      capability,
      latency: 0,
      endpoint,
      message: 'Provider authRef is missing.',
      error: { code: 'AUTH_REQUIRED', message: 'Provider authRef is missing.' },
    }
  }

  const credentialPayload = await getProviderCredential(event, provider.authRef)
  if (!credentialPayload) {
    return {
      success: false,
      providerId: provider.id,
      capability,
      latency: 0,
      endpoint,
      message: 'Provider credential is missing.',
      error: { code: 'AUTH_REQUIRED', message: 'Provider credential is missing.' },
    }
  }

  let credentials: ReturnType<typeof assertSecretPairCredential>
  try {
    credentials = assertSecretPairCredential(credentialPayload)
  }
  catch {
    return {
      success: false,
      providerId: provider.id,
      capability,
      latency: 0,
      endpoint,
      message: 'Provider secret_pair credential is missing.',
      error: { code: 'AUTH_REQUIRED', message: 'Provider secret_pair credential is missing.' },
    }
  }

  const region = provider.region || TENCENT_TMT_DEFAULT_REGION
  const host = resolveEndpointHost(endpoint)
  const payload = JSON.stringify(DEFAULT_CHECK_PAYLOAD)
  const timestamp = Math.floor(Date.now() / 1000)
  const headers = {
    Authorization: buildTencentAuthorization({
      secretId: credentials.secretId,
      secretKey: credentials.secretKey,
      host,
      timestamp,
      payload,
    }),
    'Content-Type': 'application/json; charset=utf-8',
    'X-TC-Action': TENCENT_TMT_ACTION,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': TENCENT_TMT_VERSION,
    'X-TC-Region': region,
  }

  const startedAt = Date.now()
  try {
    const response = await networkClient.request<TencentTextTranslateResponse | string>({
      method: 'POST',
      url: endpoint,
      headers,
      body: payload,
      timeoutMs: 15000,
      validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
    })
    const latency = Date.now() - startedAt
    const data = typeof response.data === 'string'
      ? JSON.parse(response.data) as TencentTextTranslateResponse
      : response.data
    const tencentResponse = data.Response
    const requestId = tencentResponse?.RequestId

    if (response.status < 200 || response.status >= 300 || tencentResponse?.Error) {
      const mapped = mapTencentError(tencentResponse?.Error)
      return {
        success: false,
        providerId: provider.id,
        capability,
        latency,
        endpoint,
        requestId,
        message: mapped.message,
        error: {
          ...mapped,
          status: response.status,
        },
      }
    }

    return {
      success: true,
      providerId: provider.id,
      capability,
      latency,
      endpoint,
      requestId,
      message: 'Tencent Cloud Machine Translation check succeeded.',
    }
  }
  catch (error) {
    return {
      success: false,
      providerId: provider.id,
      capability,
      latency: Date.now() - startedAt,
      endpoint,
      message: error instanceof Error ? error.message : 'Tencent Cloud Machine Translation check failed.',
      error: {
        code: 'PROVIDER_REQUEST_FAILED',
        message: error instanceof Error ? error.message : 'Tencent Cloud Machine Translation check failed.',
      },
    }
  }
}
