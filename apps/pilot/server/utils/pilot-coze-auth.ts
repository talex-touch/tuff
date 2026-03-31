import type { PilotChannelConfig, PilotCozeAuthMode } from './pilot-channel'
import { createHash, randomUUID } from 'node:crypto'
import { networkClient } from '@talex-touch/utils/network'
import jwt from 'jsonwebtoken'
import { normalizePilotCozeAuthMode } from './pilot-channel'

export const PILOT_COZE_OAUTH_FAILED_CODE = 'PILOT_COZE_OAUTH_FAILED'
export const PILOT_COZE_AUTH_FAILED_CODE = PILOT_COZE_OAUTH_FAILED_CODE

const ALL_HTTP_STATUS = Array.from({ length: 500 }, (_, index) => index + 100)
const TOKEN_REFRESH_SKEW_MS = 60_000
const DEFAULT_TIMEOUT_MS = 90_000
const DEFAULT_JWT_DURATION_SECONDS = 900
const DEFAULT_JWT_EXPIRY_SECONDS = 3600

interface PilotCozeTokenCacheEntry {
  accessToken: string
  expiresAt: number
  refreshAt: number
}

interface PilotCozeTokenState extends Partial<PilotCozeTokenCacheEntry> {
  inflight?: Promise<PilotCozeTokenCacheEntry>
}

interface PilotCozeBaseTokenRequestConfig {
  channelId: string
  cacheKey: string
  authMode: PilotCozeAuthMode
  oauthTokenUrl: string
  timeoutMs: number
}

interface PilotCozeOAuthTokenRequestConfig extends PilotCozeBaseTokenRequestConfig {
  authMode: 'oauth_client'
  oauthClientId: string
  oauthClientSecret: string
}

interface PilotCozeJwtTokenRequestConfig extends PilotCozeBaseTokenRequestConfig {
  authMode: 'jwt_service'
  jwtAppId: string
  jwtKeyId: string
  jwtPrivateKey: string
  jwtAudience: string
}

type PilotCozeTokenRequestConfig = PilotCozeOAuthTokenRequestConfig | PilotCozeJwtTokenRequestConfig

const cozeTokenCache = new Map<string, PilotCozeTokenState>()

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeTimeoutMs(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS
  }
  return Math.min(Math.max(Math.floor(parsed), 3_000), 10 * 60 * 1000)
}

function safeJsonParse(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'string') {
    return {}
  }
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  }
  catch {
    return {}
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value) {
    return {}
  }
  if (typeof value === 'string') {
    return safeJsonParse(value)
  }
  return typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function resolveErrorPayloadText(value: unknown): string {
  if (typeof value === 'string') {
    return value.slice(0, 320)
  }
  try {
    return JSON.stringify(value).slice(0, 320)
  }
  catch {
    return ''
  }
}

function getExpiresInSeconds(payload: Record<string, unknown>): number {
  const parsed = Number(payload.expires_in)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_JWT_EXPIRY_SECONDS
  }
  return Math.max(60, Math.floor(parsed))
}

function createCredentialFingerprint(parts: unknown[]): string {
  return createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('hex')
    .slice(0, 16)
}

export class PilotCozeAuthError extends Error {
  readonly code = PILOT_COZE_AUTH_FAILED_CODE
  readonly statusCode = 502
  readonly data: Record<string, unknown>

  constructor(message: string, data: Record<string, unknown>) {
    super(message)
    this.name = 'PilotCozeAuthError'
    this.data = {
      code: PILOT_COZE_AUTH_FAILED_CODE,
      ...data,
    }
  }
}

export class PilotCozeOAuthError extends PilotCozeAuthError {
  constructor(message: string, data: Record<string, unknown>) {
    super(message, data)
    this.name = 'PilotCozeOAuthError'
  }
}

function createMissingConfigError(
  channelId: string,
  authMode: PilotCozeAuthMode,
  missing: string[],
): PilotCozeAuthError {
  return new PilotCozeAuthError('Coze 渠道鉴权配置不完整。', {
    reason: 'missing_config',
    channelId,
    authMode,
    missing,
  })
}

function buildTokenCacheEntry(accessToken: string, expiresInSeconds: number): PilotCozeTokenCacheEntry {
  const now = Date.now()
  return {
    accessToken,
    expiresAt: now + expiresInSeconds * 1000,
    refreshAt: now + Math.max(0, expiresInSeconds * 1000 - TOKEN_REFRESH_SKEW_MS),
  }
}

function resolveTokenConfig(channel: Pick<
  PilotChannelConfig,
  | 'id'
  | 'cozeAuthMode'
  | 'oauthClientId'
  | 'oauthClientSecret'
  | 'oauthTokenUrl'
  | 'jwtAppId'
  | 'jwtKeyId'
  | 'jwtPrivateKey'
  | 'jwtAudience'
  | 'timeoutMs'
>): PilotCozeTokenRequestConfig {
  const channelId = normalizeText(channel.id)
  const authMode = normalizePilotCozeAuthMode(channel.cozeAuthMode)
  const oauthTokenUrl = normalizeText(channel.oauthTokenUrl)
  const timeoutMs = normalizeTimeoutMs(channel.timeoutMs)
  const missing = [
    !channelId ? 'channelId' : '',
    !oauthTokenUrl ? 'oauthTokenUrl' : '',
  ].filter(Boolean)

  if (authMode === 'jwt_service') {
    const jwtAppId = normalizeText(channel.jwtAppId)
    const jwtKeyId = normalizeText(channel.jwtKeyId)
    const jwtPrivateKey = String(channel.jwtPrivateKey || '').trim()
    const jwtAudience = normalizeText(channel.jwtAudience)
    const missingFields = missing.concat([
      !jwtAppId ? 'jwtAppId' : '',
      !jwtKeyId ? 'jwtKeyId' : '',
      !jwtPrivateKey ? 'jwtPrivateKey' : '',
      !jwtAudience ? 'jwtAudience' : '',
    ]).filter(Boolean)

    if (missingFields.length > 0) {
      throw createMissingConfigError(channelId || '(unknown)', authMode, missingFields)
    }

    return {
      channelId,
      cacheKey: `${channelId}::${createCredentialFingerprint([
        authMode,
        oauthTokenUrl,
        jwtAppId,
        jwtKeyId,
        jwtAudience,
        jwtPrivateKey,
      ])}`,
      authMode,
      oauthTokenUrl,
      timeoutMs,
      jwtAppId,
      jwtKeyId,
      jwtPrivateKey,
      jwtAudience,
    }
  }

  const oauthClientId = normalizeText(channel.oauthClientId)
  const oauthClientSecret = normalizeText(channel.oauthClientSecret)
  const missingFields = missing.concat([
    !oauthClientId ? 'oauthClientId' : '',
    !oauthClientSecret ? 'oauthClientSecret' : '',
  ]).filter(Boolean)

  if (missingFields.length > 0) {
    throw createMissingConfigError(channelId || '(unknown)', authMode, missingFields)
  }

  return {
    channelId,
    cacheKey: `${channelId}::${createCredentialFingerprint([
      authMode,
      oauthTokenUrl,
      oauthClientId,
      oauthClientSecret,
    ])}`,
    authMode,
    oauthClientId,
    oauthClientSecret,
    oauthTokenUrl,
    timeoutMs,
  }
}

async function requestOAuthAccessToken(
  config: PilotCozeOAuthTokenRequestConfig,
): Promise<PilotCozeTokenCacheEntry> {
  const attempts: Array<{
    label: string
    headers: Record<string, string>
    body: Record<string, unknown> | string
  }> = [
    {
      label: 'json_with_secret_body',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
      },
      body: {
        grant_type: 'client_credentials',
        client_id: config.oauthClientId,
        client_secret: config.oauthClientSecret,
      },
    },
    {
      label: 'json_with_bearer_secret',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
        'authorization': `Bearer ${config.oauthClientSecret}`,
      },
      body: {
        grant_type: 'client_credentials',
        client_id: config.oauthClientId,
      },
    },
    {
      label: 'form_with_secret_body',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.oauthClientId,
        client_secret: config.oauthClientSecret,
      }).toString(),
    },
  ]

  let lastStatus = 0
  let lastPayload: unknown = null
  let lastError: unknown = null

  for (const attempt of attempts) {
    try {
      const response = await networkClient.request<Record<string, unknown> | string>({
        method: 'POST',
        url: config.oauthTokenUrl,
        timeoutMs: config.timeoutMs,
        headers: attempt.headers,
        body: attempt.body,
        validateStatus: ALL_HTTP_STATUS,
      })

      lastStatus = response.status
      lastPayload = response.data

      if (response.status < 200 || response.status >= 300) {
        continue
      }

      const payload = toRecord(response.data)
      const accessToken = normalizeText(payload.access_token)
      if (!accessToken) {
        continue
      }

      return buildTokenCacheEntry(accessToken, getExpiresInSeconds(payload))
    }
    catch (error) {
      lastError = error
      console.warn('[pilot][coze-auth] token request failed', {
        channelId: config.channelId,
        authMode: config.authMode,
        attempt: attempt.label,
        message: error instanceof Error ? error.message : String(error || 'unknown_error'),
      })
    }
  }

  throw new PilotCozeAuthError('Coze OAuth access token 获取失败。', {
    reason: lastError ? 'request_failed' : 'invalid_response',
    channelId: config.channelId,
    authMode: config.authMode,
    oauthTokenUrl: config.oauthTokenUrl,
    upstreamStatus: lastStatus || undefined,
    upstreamPayload: resolveErrorPayloadText(lastPayload) || undefined,
    errorMessage: lastError instanceof Error ? lastError.message : undefined,
  })
}

function createJwtAssertion(config: PilotCozeJwtTokenRequestConfig): string {
  const isSupportedPem = config.jwtPrivateKey.includes('BEGIN RSA PRIVATE KEY')
    || config.jwtPrivateKey.includes('BEGIN PRIVATE KEY')
  if (!isSupportedPem) {
    throw new PilotCozeAuthError('Coze 服务身份私钥格式无效，仅支持 PEM（RSA / PKCS8）。', {
      reason: 'invalid_private_key_format',
      channelId: config.channelId,
      authMode: config.authMode,
    })
  }

  const now = Math.floor(Date.now() / 1000)
  return jwt.sign({
    iss: config.jwtAppId,
    aud: config.jwtAudience,
    iat: now,
    exp: now + DEFAULT_JWT_EXPIRY_SECONDS,
    jti: randomUUID(),
  }, config.jwtPrivateKey, {
    algorithm: 'RS256',
    keyid: config.jwtKeyId,
  })
}

async function requestJwtAccessToken(
  config: PilotCozeJwtTokenRequestConfig,
): Promise<PilotCozeTokenCacheEntry> {
  let lastStatus = 0
  let lastPayload: unknown = null

  try {
    const assertion = createJwtAssertion(config)
    const response = await networkClient.request<Record<string, unknown> | string>({
      method: 'POST',
      url: config.oauthTokenUrl,
      timeoutMs: config.timeoutMs,
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
        'authorization': `Bearer ${assertion}`,
      },
      body: {
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        duration_seconds: DEFAULT_JWT_DURATION_SECONDS,
      },
      validateStatus: ALL_HTTP_STATUS,
    })

    lastStatus = response.status
    lastPayload = response.data

    if (response.status < 200 || response.status >= 300) {
      throw new PilotCozeAuthError('Coze 服务身份 access token 获取失败。', {
        reason: 'upstream_http_error',
        channelId: config.channelId,
        authMode: config.authMode,
        oauthTokenUrl: config.oauthTokenUrl,
        upstreamStatus: response.status,
        upstreamPayload: resolveErrorPayloadText(response.data) || undefined,
      })
    }

    const payload = toRecord(response.data)
    const accessToken = normalizeText(payload.access_token)
    if (!accessToken) {
      throw new PilotCozeAuthError('Coze 服务身份 access token 返回为空。', {
        reason: 'invalid_response',
        channelId: config.channelId,
        authMode: config.authMode,
        oauthTokenUrl: config.oauthTokenUrl,
        upstreamStatus: response.status,
        upstreamPayload: resolveErrorPayloadText(response.data) || undefined,
      })
    }

    return buildTokenCacheEntry(accessToken, getExpiresInSeconds(payload))
  }
  catch (error) {
    if (error instanceof PilotCozeAuthError) {
      throw error
    }
    throw new PilotCozeAuthError('Coze 服务身份 access token 获取失败。', {
      reason: 'request_failed',
      channelId: config.channelId,
      authMode: config.authMode,
      oauthTokenUrl: config.oauthTokenUrl,
      upstreamStatus: lastStatus || undefined,
      upstreamPayload: resolveErrorPayloadText(lastPayload) || undefined,
      errorMessage: error instanceof Error ? error.message : undefined,
    })
  }
}

async function requestAccessToken(
  config: PilotCozeTokenRequestConfig,
): Promise<PilotCozeTokenCacheEntry> {
  return config.authMode === 'jwt_service'
    ? await requestJwtAccessToken(config)
    : await requestOAuthAccessToken(config)
}

async function ensureAccessToken(
  config: PilotCozeTokenRequestConfig,
): Promise<PilotCozeTokenCacheEntry> {
  const cached = cozeTokenCache.get(config.cacheKey)
  const now = Date.now()

  if (
    cached?.accessToken
    && typeof cached.refreshAt === 'number'
    && typeof cached.expiresAt === 'number'
    && now < cached.refreshAt
  ) {
    return {
      accessToken: cached.accessToken,
      expiresAt: cached.expiresAt,
      refreshAt: cached.refreshAt,
    }
  }

  if (cached?.inflight) {
    return await cached.inflight
  }

  const inflight = requestAccessToken(config)
  cozeTokenCache.set(config.cacheKey, {
    ...(cached || {}),
    inflight,
  })

  try {
    const next = await inflight
    cozeTokenCache.set(config.cacheKey, next)
    return next
  }
  catch (error) {
    cozeTokenCache.delete(config.cacheKey)
    throw error
  }
}

export async function getPilotCozeAccessToken(
  channel: Pick<
    PilotChannelConfig,
    | 'id'
    | 'cozeAuthMode'
    | 'oauthClientId'
    | 'oauthClientSecret'
    | 'oauthTokenUrl'
    | 'jwtAppId'
    | 'jwtKeyId'
    | 'jwtPrivateKey'
    | 'jwtAudience'
    | 'timeoutMs'
  >,
): Promise<string> {
  const config = resolveTokenConfig(channel)
  const token = await ensureAccessToken(config)
  return token.accessToken
}

export function invalidatePilotCozeAccessToken(channelId: string): void {
  const normalized = normalizeText(channelId)
  if (!normalized) {
    return
  }
  for (const key of cozeTokenCache.keys()) {
    if (key === normalized || key.startsWith(`${normalized}::`)) {
      cozeTokenCache.delete(key)
    }
  }
}

export async function probePilotCozeBaseUrl(
  channel: Pick<PilotChannelConfig, 'baseUrl' | 'timeoutMs'>,
): Promise<{
  url: string
  status: number
}> {
  const baseUrl = normalizeText(channel.baseUrl).replace(/\/+$/, '')
  if (!baseUrl) {
    throw new PilotCozeOAuthError('Coze API Base URL 不能为空。', {
      reason: 'missing_base_url',
    })
  }

  const response = await networkClient.request<string>({
    method: 'GET',
    url: baseUrl,
    timeoutMs: normalizeTimeoutMs(channel.timeoutMs),
    validateStatus: ALL_HTTP_STATUS,
  })

  return {
    url: baseUrl,
    status: response.status,
  }
}
