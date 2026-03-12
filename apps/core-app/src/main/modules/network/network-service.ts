import type {
  NetworkConfigSnapshot,
  NetworkCooldownPolicy,
  NetworkFileOptions,
  NetworkProxyConfig,
  NetworkRequestOptions,
  NetworkResponse,
  NetworkRetryPolicy
} from '@talex-touch/utils/network'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { ProxyConfig, Session } from 'electron'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { StorageList } from '@talex-touch/utils'
import {
  NetworkCooldownError,
  NetworkHttpStatusError,
  NetworkTimeoutError,
  createNetworkGuard,
  isHttpSource,
  isTimeoutLikeError,
  resolveLocalFilePath,
  toTfileUrl
} from '@talex-touch/utils/network'
import { normalizeAbsolutePath, resolveSafePath } from '@talex-touch/utils/common/utils/safe-path'
import { app, safeStorage, session } from 'electron'
import { APP_FOLDER_NAME } from '../../config/default'
import { getMainConfig, saveMainConfig } from '../storage'
import { createLogger } from '../../utils/logger'

const log = createLogger('NetworkService')

const DEFAULT_NETWORK_CONFIG: NetworkConfigSnapshot = {
  proxy: {
    mode: 'system',
    custom: {
      httpProxy: '',
      httpsProxy: '',
      socksProxy: '',
      pacUrl: '',
      bypass: []
    },
    authRef: ''
  },
  retry: {
    maxRetries: 2,
    baseDelayMs: 400,
    maxDelayMs: 5000,
    backoffFactor: 2,
    retryOnNetworkError: true,
    retryOnTimeout: true,
    retryableStatusCodes: [408, 425, 429, 500, 502, 503, 504]
  },
  cooldown: {
    failureThreshold: 1,
    cooldownMs: 3000,
    autoResetOnSuccess: true
  },
  timeoutMs: 15000
}

const SECURE_STORE_FILE = 'secure-store.json'
const SECURE_STORE_KEY_PATTERN = /^[a-z0-9._-]{1,80}$/i

interface NetworkStreamResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  url: string
  stream: NodeJS.ReadableStream
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeNumber(value: unknown, fallback: number, min = 0): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.max(min, Math.floor(num))
}

function normalizeRetryPolicy(value: unknown): NetworkRetryPolicy {
  const source = isRecord(value) ? value : {}
  return {
    maxRetries: normalizeNumber(source.maxRetries, DEFAULT_NETWORK_CONFIG.retry.maxRetries ?? 0),
    baseDelayMs: normalizeNumber(
      source.baseDelayMs,
      DEFAULT_NETWORK_CONFIG.retry.baseDelayMs ?? 400
    ),
    maxDelayMs: normalizeNumber(source.maxDelayMs, DEFAULT_NETWORK_CONFIG.retry.maxDelayMs ?? 5000),
    backoffFactor:
      typeof source.backoffFactor === 'number' && Number.isFinite(source.backoffFactor)
        ? Math.max(1, source.backoffFactor)
        : DEFAULT_NETWORK_CONFIG.retry.backoffFactor,
    retryOnNetworkError:
      typeof source.retryOnNetworkError === 'boolean'
        ? source.retryOnNetworkError
        : DEFAULT_NETWORK_CONFIG.retry.retryOnNetworkError,
    retryOnTimeout:
      typeof source.retryOnTimeout === 'boolean'
        ? source.retryOnTimeout
        : DEFAULT_NETWORK_CONFIG.retry.retryOnTimeout,
    retryableStatusCodes: Array.isArray(source.retryableStatusCodes)
      ? source.retryableStatusCodes.filter(
          (item): item is number => typeof item === 'number' && Number.isInteger(item)
        )
      : [...(DEFAULT_NETWORK_CONFIG.retry.retryableStatusCodes ?? [])]
  }
}

function normalizeCooldownPolicy(value: unknown): NetworkCooldownPolicy {
  const source = isRecord(value) ? value : {}
  return {
    key: typeof source.key === 'string' ? source.key.trim() : undefined,
    failureThreshold: normalizeNumber(
      source.failureThreshold,
      DEFAULT_NETWORK_CONFIG.cooldown.failureThreshold ?? 1,
      1
    ),
    cooldownMs: normalizeNumber(source.cooldownMs, DEFAULT_NETWORK_CONFIG.cooldown.cooldownMs ?? 0),
    autoResetOnSuccess:
      typeof source.autoResetOnSuccess === 'boolean'
        ? source.autoResetOnSuccess
        : DEFAULT_NETWORK_CONFIG.cooldown.autoResetOnSuccess
  }
}

function normalizeProxyConfig(value: unknown): NetworkProxyConfig {
  const source = isRecord(value) ? value : {}
  const mode = source.mode === 'direct' || source.mode === 'custom' ? source.mode : 'system'
  const customSource = isRecord(source.custom) ? source.custom : {}

  const custom = {
    httpProxy: typeof customSource.httpProxy === 'string' ? customSource.httpProxy.trim() : '',
    httpsProxy: typeof customSource.httpsProxy === 'string' ? customSource.httpsProxy.trim() : '',
    socksProxy: typeof customSource.socksProxy === 'string' ? customSource.socksProxy.trim() : '',
    pacUrl: typeof customSource.pacUrl === 'string' ? customSource.pacUrl.trim() : '',
    bypass: Array.isArray(customSource.bypass)
      ? customSource.bypass.filter((item): item is string => typeof item === 'string')
      : []
  }

  return {
    mode,
    custom,
    authRef: typeof source.authRef === 'string' ? source.authRef : ''
  }
}

export function normalizeNetworkConfig(value: unknown): NetworkConfigSnapshot {
  const source = isRecord(value) ? value : {}
  return {
    proxy: normalizeProxyConfig(source.proxy),
    retry: normalizeRetryPolicy(source.retry),
    cooldown: normalizeCooldownPolicy(source.cooldown),
    timeoutMs: normalizeNumber(source.timeout, DEFAULT_NETWORK_CONFIG.timeoutMs, 100)
  }
}

function mergeRetryPolicy(
  base: NetworkRetryPolicy,
  override?: NetworkRetryPolicy
): NetworkRetryPolicy {
  return normalizeRetryPolicy({
    ...base,
    ...(override ?? {})
  })
}

function mergeCooldownPolicy(
  base: NetworkCooldownPolicy,
  override?: NetworkCooldownPolicy
): NetworkCooldownPolicy {
  return normalizeCooldownPolicy({
    ...base,
    ...(override ?? {})
  })
}

function mergeProxyConfig(
  base: NetworkProxyConfig,
  override?: NetworkProxyConfig
): NetworkProxyConfig {
  if (!override) {
    return normalizeProxyConfig(base)
  }

  return normalizeProxyConfig({
    ...base,
    ...override,
    custom: {
      ...(base.custom ?? {}),
      ...(override.custom ?? {})
    }
  })
}

function appendQuery(
  url: string,
  query: Record<string, string | number | boolean | null | undefined> | undefined
): string {
  if (!query || Object.keys(query).length === 0) {
    return url
  }

  const parsed = new URL(url)
  for (const [key, value] of Object.entries(query)) {
    if (value === null || typeof value === 'undefined') {
      continue
    }
    parsed.searchParams.set(key, String(value))
  }

  return parsed.toString()
}

function normalizeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key] = value
  })
  return result
}

function getBody(method: string, body: unknown, headers: Headers): BodyInit | undefined {
  if (!body || method === 'GET' || method === 'HEAD') {
    return undefined
  }

  if (
    typeof body === 'string' ||
    body instanceof ArrayBuffer ||
    body instanceof URLSearchParams ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ReadableStream
  ) {
    return body as BodyInit
  }

  if (ArrayBuffer.isView(body)) {
    return body as BodyInit
  }

  if (isRecord(body) || Array.isArray(body)) {
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }
    return JSON.stringify(body)
  }

  return String(body)
}

function isSuccessStatus(status: number, validateStatus?: number[]): boolean {
  if (Array.isArray(validateStatus) && validateStatus.length > 0) {
    return validateStatus.includes(status)
  }
  return status >= 200 && status < 300
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copied = new Uint8Array(bytes.byteLength)
  copied.set(bytes)
  return copied.buffer
}

function buildAllowedRoots(): string[] {
  const platform = process.platform
  const winRoots =
    platform === 'win32'
      ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.SystemRoot].filter(
          (value): value is string => Boolean(value)
        )
      : []
  const linuxRoots = platform === 'linux' ? ['/usr/share', '/usr/local/share', '/opt'] : []

  const candidates = [
    process.cwd(),
    appPathSafe('home'),
    appPathSafe('userData'),
    appPathSafe('temp'),
    os.tmpdir(),
    ...winRoots,
    ...linuxRoots,
    '/Applications',
    '/System/Applications',
    '/System/Library/CoreServices'
  ]

  const roots: string[] = []
  for (const candidate of candidates) {
    const normalized = normalizeAbsolutePath(candidate)
    if (normalized && !roots.includes(normalized)) {
      roots.push(normalized)
    }
  }
  return roots
}

function appPathSafe(name: 'home' | 'userData' | 'temp'): string {
  try {
    return app.getPath(name)
  } catch {
    return name === 'temp' ? os.tmpdir() : process.cwd()
  }
}

function isAllowedPath(filePath: string, roots: string[]): boolean {
  const normalized = normalizeAbsolutePath(filePath)
  if (!normalized) {
    return false
  }

  if (process.platform === 'darwin') {
    const lower = normalized.toLowerCase()
    return roots.some((root) => {
      const normalizedRoot = normalizeAbsolutePath(root)
      if (!normalizedRoot) return false
      const lowerRoot = normalizedRoot.toLowerCase()
      return lower === lowerRoot || lower.startsWith(`${lowerRoot}/`)
    })
  }

  return roots.some((root) => {
    const normalizedRoot = normalizeAbsolutePath(root)
    if (!normalizedRoot) {
      return false
    }

    return Boolean(
      resolveSafePath(normalizedRoot, normalized, {
        allowAbsolute: true,
        allowRoot: true
      }).resolvedPath
    )
  })
}

function resolveAppRootPath(): string {
  if (app.isPackaged) {
    return path.join(appPathSafe('userData'), APP_FOLDER_NAME)
  }

  try {
    return path.join(app.getAppPath(), APP_FOLDER_NAME)
  } catch {
    return path.join(process.cwd(), APP_FOLDER_NAME)
  }
}

async function readSecureStore(): Promise<Record<string, string>> {
  const storePath = path.join(resolveAppRootPath(), 'config', SECURE_STORE_FILE)
  try {
    const raw = await fs.readFile(storePath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        result[key] = value
      }
    }
    return result
  } catch (error) {
    const code = isRecord(error) && typeof error.code === 'string' ? error.code : ''
    if (code === 'ENOENT') {
      return {}
    }
    log.warn('Failed to read secure store for network proxy auth', { error })
    return {}
  }
}

async function resolveProxyCredential(
  authRef?: string | null
): Promise<{ username: string; password: string } | null> {
  const key = typeof authRef === 'string' ? authRef.trim() : ''
  if (!key || !SECURE_STORE_KEY_PATTERN.test(key)) {
    return null
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return null
  }

  const store = await readSecureStore()
  const encrypted = store[key]
  if (!encrypted) {
    return null
  }

  try {
    const decrypted = safeStorage.decryptString(Buffer.from(encrypted, 'base64')).trim()
    if (!decrypted) {
      return null
    }

    if (decrypted.startsWith('{')) {
      const parsed = JSON.parse(decrypted) as { username?: unknown; password?: unknown }
      const username = typeof parsed.username === 'string' ? parsed.username : ''
      const password = typeof parsed.password === 'string' ? parsed.password : ''
      if (username) {
        return { username, password }
      }
      return null
    }

    const sep = decrypted.indexOf(':')
    if (sep <= 0) {
      return null
    }

    const username = decrypted.slice(0, sep).trim()
    const password = decrypted.slice(sep + 1)
    if (!username) {
      return null
    }
    return { username, password }
  } catch (error) {
    log.warn('Failed to parse proxy auth from secure store', { error })
    return null
  }
}

function applyProxyCredential(
  rawProxy: string,
  credential: { username: string; password: string } | null
): string {
  if (!rawProxy || !credential) {
    return rawProxy
  }

  const normalized = rawProxy.trim()
  if (!normalized) {
    return normalized
  }

  try {
    const parsed = new URL(normalized.includes('://') ? normalized : `http://${normalized}`)
    if (parsed.username) {
      return normalized
    }
    parsed.username = credential.username
    parsed.password = credential.password
    return normalized.includes('://')
      ? parsed.toString()
      : parsed.toString().replace(/^http:\/\//, '')
  } catch {
    return normalized
  }
}

export class NetworkService {
  private readonly guard = createNetworkGuard(DEFAULT_NETWORK_CONFIG.cooldown)
  private readonly sessionCache = new Map<string, Session>()
  private readonly sessionProxyCache = new Map<string, string>()
  private readonly allowedRoots = buildAllowedRoots()

  private getConfigFromSettings(): NetworkConfigSnapshot {
    const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting | undefined
    return normalizeNetworkConfig(appSettings?.network)
  }

  getConfig(): NetworkConfigSnapshot {
    return this.getConfigFromSettings()
  }

  updateConfig(patch: {
    proxy?: NetworkProxyConfig
    retry?: NetworkRetryPolicy
    cooldown?: NetworkCooldownPolicy
    timeoutMs?: number
  }): NetworkConfigSnapshot {
    const appSettings = (getMainConfig(StorageList.APP_SETTING) ?? {}) as AppSetting
    const current = this.getConfigFromSettings()
    const nextConfig: NetworkConfigSnapshot = {
      ...current,
      proxy: mergeProxyConfig(current.proxy, patch.proxy),
      retry: mergeRetryPolicy(current.retry, patch.retry),
      cooldown: mergeCooldownPolicy(current.cooldown, patch.cooldown),
      timeoutMs:
        typeof patch.timeoutMs === 'number' && Number.isFinite(patch.timeoutMs)
          ? Math.max(100, Math.floor(patch.timeoutMs))
          : current.timeoutMs
    }

    saveMainConfig(StorageList.APP_SETTING, {
      ...appSettings,
      network: {
        timeout: nextConfig.timeoutMs,
        proxy: nextConfig.proxy,
        retry: nextConfig.retry,
        cooldown: nextConfig.cooldown
      } as AppSetting['network']
    })

    return nextConfig
  }

  toTfileUrl(source: string): string {
    return toTfileUrl(source)
  }

  async readText(source: string, options: NetworkFileOptions = {}): Promise<string> {
    if (isHttpSource(source)) {
      const response = await this.request<string>({
        method: 'GET',
        url: source,
        timeoutMs: options.timeoutMs,
        responseType: 'text',
        retryPolicy: options.retryPolicy,
        cooldownPolicy: options.cooldownPolicy,
        proxyOverride: options.proxyOverride
      })
      return response.data
    }

    const localPath = resolveLocalFilePath(source)
    if (!localPath) {
      throw new Error('NETWORK_UNSUPPORTED_FILE_SOURCE')
    }

    if (!isAllowedPath(localPath, this.allowedRoots)) {
      throw new Error('NETWORK_FILE_FORBIDDEN')
    }

    try {
      const encoding = (options.encoding || 'utf-8') as BufferEncoding
      const timeoutMs =
        typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
          ? Math.max(100, Math.floor(options.timeoutMs))
          : 0
      return await fs.readFile(localPath, {
        encoding,
        signal: timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined
      })
    } catch (error) {
      if (
        typeof options.timeoutMs === 'number' &&
        Number.isFinite(options.timeoutMs) &&
        isTimeoutLikeError(error)
      ) {
        throw new NetworkTimeoutError(options.timeoutMs)
      }
      const code = isRecord(error) && typeof error.code === 'string' ? error.code : ''
      if (options.allowMissing && code === 'ENOENT') {
        return ''
      }
      throw error
    }
  }

  async readBinary(source: string, options: NetworkFileOptions = {}): Promise<ArrayBuffer> {
    if (isHttpSource(source)) {
      const response = await this.request<ArrayBuffer>({
        method: 'GET',
        url: source,
        timeoutMs: options.timeoutMs,
        responseType: 'arrayBuffer',
        retryPolicy: options.retryPolicy,
        cooldownPolicy: options.cooldownPolicy,
        proxyOverride: options.proxyOverride
      })
      return response.data
    }

    const localPath = resolveLocalFilePath(source)
    if (!localPath) {
      throw new Error('NETWORK_UNSUPPORTED_FILE_SOURCE')
    }

    if (!isAllowedPath(localPath, this.allowedRoots)) {
      throw new Error('NETWORK_FILE_FORBIDDEN')
    }

    try {
      const timeoutMs =
        typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
          ? Math.max(100, Math.floor(options.timeoutMs))
          : 0
      const bytes = await fs.readFile(localPath, {
        signal: timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined
      })
      return toArrayBuffer(bytes)
    } catch (error) {
      if (
        typeof options.timeoutMs === 'number' &&
        Number.isFinite(options.timeoutMs) &&
        isTimeoutLikeError(error)
      ) {
        throw new NetworkTimeoutError(options.timeoutMs)
      }
      const code = isRecord(error) && typeof error.code === 'string' ? error.code : ''
      if (options.allowMissing && code === 'ENOENT') {
        return new ArrayBuffer(0)
      }
      throw error
    }
  }

  async request<T = unknown>(options: NetworkRequestOptions): Promise<NetworkResponse<T>> {
    const responseType = options.responseType ?? 'json'
    if (responseType === 'stream') {
      throw new Error('NETWORK_STREAM_NOT_SUPPORTED_FOR_TYPED_RESPONSE')
    }

    return await this.executeWithPolicies(options, async () => {
      const response = await this.executeFetch(options)
      const headers = normalizeHeaders(response.headers)
      const data = (await this.parseResponseBody(response, responseType)) as T

      return {
        status: response.status,
        statusText: response.statusText,
        headers,
        data,
        url: response.url,
        ok: response.ok
      }
    })
  }

  async requestStream(options: NetworkRequestOptions): Promise<NetworkStreamResponse> {
    return await this.executeWithPolicies(options, async () => {
      const response = await this.executeFetch(options)
      const stream = response.body
        ? Readable.fromWeb(response.body as unknown as NodeReadableStream)
        : null
      if (!stream) {
        throw new Error('NETWORK_EMPTY_STREAM_BODY')
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: normalizeHeaders(response.headers),
        url: response.url,
        stream
      }
    })
  }

  private async executeWithPolicies<T>(
    options: NetworkRequestOptions,
    executor: () => Promise<T>
  ): Promise<T> {
    const method = (options.method ?? 'GET').toUpperCase()
    const url = appendQuery(options.url, options.query)
    const baseConfig = this.getConfigFromSettings()
    const retryPolicy = mergeRetryPolicy(baseConfig.retry, options.retryPolicy)
    const cooldownPolicy = mergeCooldownPolicy(baseConfig.cooldown, options.cooldownPolicy)
    const cooldownKey = cooldownPolicy.key || `${method}:${url}`

    const gate = this.guard.canRequest(cooldownKey)
    if (!gate.allowed) {
      throw new NetworkCooldownError(cooldownKey, gate.retryAfterMs ?? 0)
    }

    let attempt = 0
    while (true) {
      attempt += 1
      try {
        const result = await executor()
        this.guard.recordSuccess(cooldownKey, cooldownPolicy)
        return result
      } catch (error) {
        const shouldRetry = this.shouldRetry(error, attempt, retryPolicy)
        if (!shouldRetry) {
          this.guard.recordFailure(cooldownKey, cooldownPolicy)
          throw error
        }

        const delay = this.getRetryDelay(attempt, retryPolicy)
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }
  }

  private shouldRetry(error: unknown, attempt: number, retryPolicy: NetworkRetryPolicy): boolean {
    const maxRetries = retryPolicy.maxRetries ?? 0
    if (attempt > maxRetries) {
      return false
    }

    if (error instanceof NetworkCooldownError) {
      return false
    }

    if (error instanceof NetworkHttpStatusError) {
      return (retryPolicy.retryableStatusCodes ?? []).includes(error.status)
    }

    if (isTimeoutLikeError(error)) {
      return retryPolicy.retryOnTimeout !== false
    }

    return retryPolicy.retryOnNetworkError !== false
  }

  private getRetryDelay(attempt: number, retryPolicy: NetworkRetryPolicy): number {
    const baseDelay = retryPolicy.baseDelayMs ?? 0
    const backoffFactor = retryPolicy.backoffFactor ?? 1
    const maxDelay = retryPolicy.maxDelayMs ?? baseDelay

    const delay = baseDelay * Math.pow(backoffFactor, Math.max(0, attempt - 1))
    return Math.min(Math.max(0, Math.floor(delay)), Math.max(0, maxDelay))
  }

  private async executeFetch(options: NetworkRequestOptions): Promise<Response> {
    const config = this.getConfigFromSettings()
    const proxyConfig = mergeProxyConfig(config.proxy, options.proxyOverride)
    const targetUrl = appendQuery(options.url, options.query)
    const timeoutMs =
      typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
        ? Math.max(100, Math.floor(options.timeoutMs))
        : config.timeoutMs

    const sessionInstance = await this.getSession(proxyConfig)
    const method = (options.method ?? 'GET').toUpperCase()
    const headers = new Headers(options.headers ?? {})
    const body = getBody(method, options.body, headers)

    let response: Response
    try {
      response = await sessionInstance.fetch(targetUrl, {
        method,
        headers,
        body,
        signal: options.signal ?? AbortSignal.timeout(timeoutMs)
      })
    } catch (error) {
      if (isTimeoutLikeError(error)) {
        throw new NetworkTimeoutError(timeoutMs)
      }
      throw error
    }

    if (!isSuccessStatus(response.status, options.validateStatus)) {
      throw new NetworkHttpStatusError(response.status, response.statusText, response.url)
    }

    return response
  }

  private async parseResponseBody(
    response: Response,
    responseType: NetworkRequestOptions['responseType']
  ): Promise<unknown> {
    if (responseType === 'text') {
      return await response.text()
    }

    if (responseType === 'arrayBuffer') {
      return await response.arrayBuffer()
    }

    const text = await response.text()
    if (!text) {
      return null
    }

    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  private async getSession(proxyConfig: NetworkProxyConfig): Promise<Session> {
    const key = this.getProxyConfigKey(proxyConfig)
    const existing = this.sessionCache.get(key)
    if (existing) {
      await this.ensureProxy(existing, key, proxyConfig)
      return existing
    }

    const partition = `persist:tuff-network-${createHash('sha1').update(key).digest('hex').slice(0, 16)}`
    const created = session.fromPartition(partition)
    this.sessionCache.set(key, created)
    await this.ensureProxy(created, key, proxyConfig)
    return created
  }

  private getProxyConfigKey(proxyConfig: NetworkProxyConfig): string {
    return JSON.stringify(normalizeProxyConfig(proxyConfig))
  }

  private async ensureProxy(
    sessionInstance: Session,
    sessionKey: string,
    proxyConfig: NetworkProxyConfig
  ): Promise<void> {
    const electronConfig = await this.toElectronProxyConfig(proxyConfig)
    const signature = JSON.stringify(electronConfig)
    const current = this.sessionProxyCache.get(sessionKey)

    if (current === signature) {
      return
    }

    await sessionInstance.setProxy(electronConfig)
    this.sessionProxyCache.set(sessionKey, signature)
  }

  private async toElectronProxyConfig(proxyConfig: NetworkProxyConfig): Promise<ProxyConfig> {
    if (proxyConfig.mode === 'direct') {
      return { mode: 'direct' }
    }

    if (proxyConfig.mode === 'system') {
      return { mode: 'system' }
    }

    const custom = proxyConfig.custom ?? {}
    const credential = await resolveProxyCredential(proxyConfig.authRef)
    const bypass = Array.isArray(custom.bypass) ? custom.bypass.filter(Boolean) : []

    if (custom.pacUrl) {
      return {
        mode: 'pac_script',
        pacScript: custom.pacUrl,
        proxyBypassRules: bypass.join(',')
      }
    }

    const rules: string[] = []
    if (custom.httpProxy) {
      rules.push(`http=${applyProxyCredential(custom.httpProxy, credential)}`)
    }
    if (custom.httpsProxy) {
      rules.push(`https=${applyProxyCredential(custom.httpsProxy, credential)}`)
    }
    if (custom.socksProxy) {
      rules.push(`socks=${applyProxyCredential(custom.socksProxy, credential)}`)
    }

    if (rules.length === 0) {
      return { mode: 'direct' }
    }

    return {
      mode: 'fixed_servers',
      proxyRules: rules.join(';'),
      proxyBypassRules: bypass.join(',')
    }
  }
}

let networkServiceInstance: NetworkService | null = null

export function getNetworkService(): NetworkService {
  if (!networkServiceInstance) {
    networkServiceInstance = new NetworkService()
    log.info('NetworkService initialized')
  }

  return networkServiceInstance
}

export function setNetworkServiceInstance(instance: NetworkService): void {
  networkServiceInstance = instance
}

export { DEFAULT_NETWORK_CONFIG }
