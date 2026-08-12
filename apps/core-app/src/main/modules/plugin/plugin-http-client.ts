import type {
  NetworkMethod,
  NetworkRequestOptions,
  NetworkResponseType
} from '@talex-touch/utils/network'
import { getNetworkService } from '../network'

/**
 * The HTTP client handed to plugins.
 *
 * Lifted out of `plugin.ts` for #339. That file is a multi-owner coordination hotspot -- 4068
 * lines when this moved, up 976 since the issue was filed -- and this is one of the parts with a
 * boundary of its own: it takes a request config, hands it to the network service, and hands the
 * response back. It reads no plugin state and touches nothing on `TouchPlugin`.
 *
 * The narrowing that matters is `ALLOWED_HTTP_METHODS`. A plugin supplies `method` as a free
 * string, and anything outside the set becomes `GET` rather than reaching the network service --
 * so the allowlist is the reason this file is worth being able to read on its own.
 */

export type PluginHttpResponseType = Extract<NetworkResponseType, 'json' | 'text'> | 'arraybuffer'
export interface PluginHttpRequestConfig {
  url: string
  method?: string
  headers?: Record<string, string>
  params?: Record<string, string | number | boolean | null | undefined>
  data?: unknown
  signal?: AbortSignal
  timeout?: number
  timeoutMs?: number
  responseType?: PluginHttpResponseType
}

export interface PluginHttpResponse<T = unknown> {
  data: T
  status: number
  statusText: string
  headers: Record<string, string>
  config: PluginHttpRequestConfig
  url: string
}

export interface PluginHttpClient {
  request: <T = unknown>(config: PluginHttpRequestConfig) => Promise<PluginHttpResponse<T>>
  get: <T = unknown>(
    url: string,
    config?: Omit<PluginHttpRequestConfig, 'url' | 'method' | 'data'>
  ) => Promise<PluginHttpResponse<T>>
  post: <T = unknown>(
    url: string,
    data?: unknown,
    config?: Omit<PluginHttpRequestConfig, 'url' | 'method' | 'data'>
  ) => Promise<PluginHttpResponse<T>>
  put: <T = unknown>(
    url: string,
    data?: unknown,
    config?: Omit<PluginHttpRequestConfig, 'url' | 'method' | 'data'>
  ) => Promise<PluginHttpResponse<T>>
  patch: <T = unknown>(
    url: string,
    data?: unknown,
    config?: Omit<PluginHttpRequestConfig, 'url' | 'method' | 'data'>
  ) => Promise<PluginHttpResponse<T>>
  delete: <T = unknown>(
    url: string,
    config?: Omit<PluginHttpRequestConfig, 'url' | 'method' | 'data'>
  ) => Promise<PluginHttpResponse<T>>
}

export const ALLOWED_HTTP_METHODS = new Set<NetworkMethod>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS'
])

export function normalizeNetworkMethod(method?: string): NetworkMethod {
  const normalized = typeof method === 'string' ? method.trim().toUpperCase() : 'GET'
  if (ALLOWED_HTTP_METHODS.has(normalized as NetworkMethod)) {
    return normalized as NetworkMethod
  }
  return 'GET'
}

export function normalizeResponseType(
  responseType: PluginHttpResponseType | undefined
): NetworkRequestOptions['responseType'] {
  if (responseType === 'arraybuffer') {
    return 'arrayBuffer'
  }
  return responseType
}

export function createPluginHttpClient(): PluginHttpClient {
  const networkService = getNetworkService()

  const send = async <T>(config: PluginHttpRequestConfig): Promise<PluginHttpResponse<T>> => {
    const method = normalizeNetworkMethod(config.method)
    const timeoutMs =
      typeof config.timeoutMs === 'number'
        ? config.timeoutMs
        : typeof config.timeout === 'number'
          ? config.timeout
          : undefined
    const response = await networkService.request<T>({
      method,
      url: config.url,
      headers: config.headers,
      query: config.params,
      body: config.data,
      signal: config.signal,
      timeoutMs,
      responseType: normalizeResponseType(config.responseType)
    })

    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      config,
      url: response.url
    }
  }

  return {
    request: send,
    get: (url, config = {}) => send({ ...config, url, method: 'GET' }),
    post: (url, data, config = {}) => send({ ...config, url, method: 'POST', data }),
    put: (url, data, config = {}) => send({ ...config, url, method: 'PUT', data }),
    patch: (url, data, config = {}) => send({ ...config, url, method: 'PATCH', data }),
    delete: (url, config = {}) => send({ ...config, url, method: 'DELETE' })
  }
}
