import type {
  CloudShareErrorCode,
  PluginContentInstallResponse,
  PluginContentListQuery,
  PluginContentListResponse,
  PluginContentPackage,
  PluginContentPackageResponse,
  PluginContentPublishInput,
} from '../types/cloud-share'
import { getTuffBaseUrl, normalizeBaseUrl } from '../env'

export interface CloudShareSDKOptions {
  baseUrl?: string
  serviceBaseUrl?: string
  apiBaseUrl?: string
  pluginId?: string
  getAuthToken?: () => string | null | undefined | Promise<string | null | undefined>
  fetch?: typeof fetch
}

export class CloudShareError extends Error {
  status: number
  errorCode?: CloudShareErrorCode | string
  data?: unknown

  constructor(message: string, status: number, errorCode?: CloudShareErrorCode | string, data?: unknown) {
    super(message)
    this.name = 'CloudShareError'
    this.status = status
    this.errorCode = errorCode
    this.data = data
  }
}

export class CloudShareSDK {
  private baseUrl: string
  private pluginId?: string
  private getAuthToken?: () => string | null | undefined | Promise<string | null | undefined>
  private fetchFn: typeof fetch | null

  constructor(options: CloudShareSDKOptions = {}) {
    const baseUrl = options.baseUrl ?? options.serviceBaseUrl ?? options.apiBaseUrl ?? getTuffBaseUrl()
    this.baseUrl = normalizeBaseUrl(baseUrl)
    this.pluginId = options.pluginId
    this.getAuthToken = options.getAuthToken
    this.fetchFn = options.fetch ?? (globalThis as any).fetch ?? null
  }

  async publish(input: Omit<PluginContentPublishInput, 'pluginId'> & { pluginId?: string }): Promise<PluginContentPackage> {
    const pluginId = input.pluginId ?? this.pluginId
    if (!pluginId)
      throw new Error('[CloudShareSDK] pluginId is required to publish plugin content.')

    const response = await this.request<PluginContentPackageResponse>('/api/store/plugin-content', {
      method: 'POST',
      auth: true,
      json: {
        ...input,
        pluginId,
      },
    })
    return response.package
  }

  async list(query: PluginContentListQuery = {}): Promise<PluginContentListResponse> {
    const params = new URLSearchParams()
    const pluginId = query.pluginId ?? this.pluginId
    if (pluginId)
      params.set('pluginId', pluginId)
    if (query.kind)
      params.set('kind', query.kind)
    if (query.visibility)
      params.set('visibility', query.visibility)
    if (query.status)
      params.set('status', query.status)
    if (typeof query.limit === 'number')
      params.set('limit', String(query.limit))
    if (typeof query.offset === 'number')
      params.set('offset', String(query.offset))

    const suffix = params.toString()
    return this.request<PluginContentListResponse>(`/api/store/plugin-content${suffix ? `?${suffix}` : ''}`, {
      method: 'GET',
      auth: false,
    })
  }

  async get(id: string): Promise<PluginContentPackage> {
    const response = await this.request<PluginContentPackageResponse>(
      `/api/store/plugin-content/${encodeURIComponent(id)}`,
      { method: 'GET', auth: false },
    )
    return response.package
  }

  async install(id: string): Promise<PluginContentInstallResponse> {
    return this.request<PluginContentInstallResponse>(
      `/api/store/plugin-content/${encodeURIComponent(id)}/install`,
      { method: 'POST', auth: false },
    )
  }

  private async buildHeaders(auth: boolean): Promise<Record<string, string>> {
    const headers: Record<string, string> = {}
    if (!auth)
      return headers

    if (!this.getAuthToken)
      throw new Error('[CloudShareSDK] Auth token resolver is required for this request.')

    const token = await this.getAuthToken()
    const trimmed = typeof token === 'string' ? token.trim() : ''
    if (!trimmed)
      throw new Error('[CloudShareSDK] Auth token is not available.')

    headers.authorization = trimmed.startsWith('Bearer ') ? trimmed : `Bearer ${trimmed}`
    return headers
  }

  private async request<T>(
    path: string,
    init: RequestInit & { auth: boolean, json?: unknown },
  ): Promise<T> {
    const fetchFn = this.fetchFn ?? (globalThis as any).fetch
    if (!fetchFn)
      throw new Error('[CloudShareSDK] Fetch API not available. Provide fetch in options.')

    const headers = new Headers(await this.buildHeaders(init.auth))
    if (init.json !== undefined) {
      headers.set('content-type', 'application/json')
      init.body = JSON.stringify(init.json)
    }

    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
    const response = await fetchFn(url, { ...init, headers })
    const contentType = response.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null)

    if (!response.ok) {
      const errorCode = (payload?.errorCode ?? payload?.data?.errorCode) as CloudShareErrorCode | undefined
      const message = errorCode ?? response.statusText ?? 'Cloud share request failed'
      throw new CloudShareError(message, response.status, errorCode, payload)
    }

    return payload as T
  }
}
