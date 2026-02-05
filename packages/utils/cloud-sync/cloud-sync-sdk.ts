import { getTelemetryApiBase, normalizeBaseUrl } from '../env'
import type {
  ConflictItem,
  HandshakeResponse,
  KeyRegisterResponse,
  KeyRotateResponse,
  PullResponse,
  PushResponse,
  QuotaInfo,
  QuotaValidateResponse,
  SyncErrorCode,
  SyncItemInput,
  UploadResponse,
} from '../types/cloud-sync'

const DEFAULT_SYNC_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7

export interface CloudSyncSDKOptions {
  apiBaseUrl?: string
  getAuthToken: () => string | Promise<string>
  getDeviceId: () => string | Promise<string>
  fetch?: typeof fetch
  now?: () => number
  syncTokenCache?: { token?: string, expiresAt?: string }
  onSyncTokenUpdate?: (token: string, expiresAt: string) => void
  formDataFactory?: () => FormData
}

export class CloudSyncError extends Error {
  status: number
  errorCode?: SyncErrorCode | string
  data?: unknown

  constructor(message: string, status: number, errorCode?: SyncErrorCode | string, data?: unknown) {
    super(message)
    this.name = 'CloudSyncError'
    this.status = status
    this.errorCode = errorCode
    this.data = data
  }
}

export class CloudSyncSDK {
  private apiBaseUrl: string
  private getAuthToken: () => Promise<string>
  private getDeviceId: () => Promise<string>
  private fetchFn: typeof fetch | null
  private now: () => number
  private syncTokenCache: { token?: string, expiresAt?: string }
  private onSyncTokenUpdate?: (token: string, expiresAt: string) => void
  private formDataFactory?: () => FormData
  private handshakePromise: Promise<HandshakeResponse> | null = null

  constructor(options: CloudSyncSDKOptions) {
    this.apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl ?? getTelemetryApiBase())
    this.getAuthToken = async () => options.getAuthToken()
    this.getDeviceId = async () => options.getDeviceId()
    this.fetchFn = options.fetch ?? (globalThis as any).fetch ?? null
    this.now = options.now ?? (() => Date.now())
    this.syncTokenCache = options.syncTokenCache ?? {}
    this.onSyncTokenUpdate = options.onSyncTokenUpdate
    this.formDataFactory = options.formDataFactory
  }

  async handshake(): Promise<HandshakeResponse> {
    if (this.handshakePromise)
      return this.handshakePromise

    this.handshakePromise = (async () => {
      const headers = await this.buildHeaders()
      const response = await this.request<HandshakeResponse>('/api/v1/sync/handshake', {
        method: 'POST',
        headers,
      })
      this.updateSyncToken(response.sync_token)
      return response
    })()

    try {
      return await this.handshakePromise
    }
    finally {
      this.handshakePromise = null
    }
  }

  async push(items: SyncItemInput[]): Promise<PushResponse> {
    return this.requestWithSyncToken<PushResponse>('/api/v1/sync/push', {
      method: 'POST',
      json: { items },
    })
  }

  async pull(params?: { cursor?: number, limit?: number }): Promise<PullResponse> {
    const cursor = params?.cursor ?? 0
    const limit = params?.limit ?? 200
    const query = new URLSearchParams()
    query.set('cursor', String(cursor))
    query.set('limit', String(limit))
    return this.requestWithSyncToken<PullResponse>(`/api/v1/sync/pull?${query.toString()}`, {
      method: 'GET',
    })
  }

  async uploadBlob(file: Blob | File, opts?: { filename?: string, contentType?: string }): Promise<UploadResponse> {
    const formData = this.createFormData()
    const name = opts?.filename ?? (file as File).name ?? 'blob'
    formData.append('file', file, name)
    return this.requestWithSyncToken<UploadResponse>('/api/v1/sync/blobs/upload', {
      method: 'POST',
      body: formData,
    })
  }

  async getQuotas(): Promise<QuotaInfo> {
    const headers = await this.buildHeaders()
    return this.request<QuotaInfo>('/api/v1/quotas', { method: 'GET', headers })
  }

  async validateQuotas(payload: { storage_bytes_delta: number, objects_delta: number }): Promise<QuotaValidateResponse> {
    const headers = await this.buildHeaders()
    return this.request<QuotaValidateResponse>('/api/v1/quotas/validate', {
      method: 'POST',
      headers,
      json: payload,
    })
  }

  async registerKey(payload: { key_type: string, encrypted_key: string, recovery_code_hash?: string | null }): Promise<KeyRegisterResponse> {
    const headers = await this.buildHeaders()
    return this.request<KeyRegisterResponse>('/api/v1/keys/register', {
      method: 'POST',
      headers,
      json: payload,
    })
  }

  async rotateKey(payload: { key_type: string, encrypted_key: string }): Promise<KeyRotateResponse> {
    const headers = await this.buildHeaders()
    return this.request<KeyRotateResponse>('/api/v1/keys/rotate', {
      method: 'POST',
      headers,
      json: payload,
    })
  }

  private async requestWithSyncToken<T>(path: string, init: RequestInit & { json?: any }): Promise<T> {
    const hadToken = Boolean(this.syncTokenCache.token)
    const syncToken = await this.ensureSession()
    try {
      const headers = this.mergeHeaders(await this.buildHeaders(), init.headers)
      return await this.request<T>(path, { ...init, headers, syncToken })
    }
    catch (error) {
      if (hadToken && error instanceof CloudSyncError && error.errorCode === 'SYNC_INVALID_PAYLOAD') {
        const refreshed = await this.handshake()
        const headers = this.mergeHeaders(await this.buildHeaders(), init.headers)
        return this.request<T>(path, { ...init, headers, syncToken: refreshed.sync_token })
      }
      throw error
    }
  }

  private async ensureSession(): Promise<string> {
    const cachedToken = this.syncTokenCache.token
    if (cachedToken && !this.isTokenExpired(this.syncTokenCache.expiresAt))
      return cachedToken
    const response = await this.handshake()
    return response.sync_token
  }

  private updateSyncToken(token: string) {
    const expiresAt = this.syncTokenCache.expiresAt ?? new Date(this.now() + DEFAULT_SYNC_TOKEN_TTL_MS).toISOString()
    this.syncTokenCache.token = token
    this.syncTokenCache.expiresAt = expiresAt
    this.onSyncTokenUpdate?.(token, expiresAt)
  }

  private isTokenExpired(expiresAt?: string) {
    if (!expiresAt)
      return false
    const timestamp = Date.parse(expiresAt)
    if (!Number.isFinite(timestamp))
      return false
    return timestamp <= this.now()
  }

  private createFormData(): FormData {
    if (this.formDataFactory)
      return this.formDataFactory()
    if (typeof FormData !== 'undefined')
      return new FormData()
    throw new Error('[CloudSyncSDK] FormData is not available. Provide formDataFactory in Node/Electron main.')
  }

  private async buildHeaders(extra?: Record<string, string>) {
    const token = await this.getAuthToken()
    const deviceId = await this.getDeviceId()
    const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`
    return {
      authorization: authHeader,
      'x-device-id': deviceId,
      ...(extra ?? {}),
    }
  }

  private mergeHeaders(base: Record<string, string>, extra?: HeadersInit) {
    const headers = new Headers(base)
    if (extra) {
      const extraHeaders = new Headers(extra)
      extraHeaders.forEach((value, key) => {
        headers.set(key, value)
      })
    }
    return headers
  }

  private async request<T>(path: string, init: RequestInit & { json?: any, syncToken?: string }): Promise<T> {
    const fetchFn = this.fetchFn ?? (globalThis as any).fetch
    if (!fetchFn)
      throw new Error('[CloudSyncSDK] Fetch API not available. Provide fetch in options.')

    const headers = new Headers(init.headers ?? {})
    if (init.syncToken)
      headers.set('x-sync-token', init.syncToken)
    if (init.json !== undefined) {
      headers.set('content-type', 'application/json')
      init.body = JSON.stringify(init.json)
    }

    const url = `${this.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
    const response = await fetchFn(url, { ...init, headers })
    const contentType = response.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null)

    if (!response.ok) {
      const errorCode = payload?.errorCode as SyncErrorCode | undefined
      const message = errorCode ?? response.statusText ?? 'Cloud sync request failed'
      throw new CloudSyncError(message, response.status, errorCode, payload)
    }

    return payload as T
  }
}

export type { ConflictItem }
