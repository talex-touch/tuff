import type { StoreHttpRequestOptions, StoreHttpResponse } from '@talex-touch/utils/store'
import { getNetworkService } from '../modules/network'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const DEFAULT_STORE_HTTP_TIMEOUT_MS = 20_000
const STORE_HTTP_RETRY_DELAY_MS = 800

function normalizeHeaders(headers: Record<string, unknown> | undefined): Record<string, string> {
  const normalized: Record<string, string> = {}
  if (!headers) {
    return normalized
  }

  for (const [key, value] of Object.entries(headers)) {
    if (value === null || typeof value === 'undefined') {
      continue
    }

    if (Array.isArray(value)) {
      normalized[key] = value.map(String).join(', ')
      continue
    }

    normalized[key] = String(value)
  }

  return normalized
}

function mapResponseType(
  responseType: StoreHttpRequestOptions['responseType']
): 'json' | 'text' | 'arrayBuffer' {
  if (responseType === 'text') {
    return 'text'
  }
  if (responseType === 'arraybuffer') {
    return 'arrayBuffer'
  }
  return 'json'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableStoreHttpError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message || ''
  return (
    message.includes('NETWORK_TIMEOUT') ||
    message.includes('NETWORK_COOLDOWN') ||
    message.includes('fetch failed') ||
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT')
  )
}

function toStoreHttpError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith('STORE_HTTP_')) {
    return error
  }

  if (error instanceof Error && error.message.startsWith('NETWORK_HTTP_STATUS_')) {
    const status = error.message.replace('NETWORK_HTTP_STATUS_', '')
    return new Error(`STORE_HTTP_STATUS_${status}`)
  }

  const message = error instanceof Error ? error.message : ''
  return new Error(message.length > 0 ? message : 'STORE_HTTP_REQUEST_FAILED')
}

async function executeStoreHttpRequest<T = unknown>(
  options: StoreHttpRequestOptions,
  method: string,
  timeout: number
): Promise<StoreHttpResponse<T>> {
  const response = await getNetworkService().request<T>({
    url: options.url,
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS',
    headers: options.headers,
    query: options.params,
    body: options.data,
    timeoutMs: timeout,
    responseType: mapResponseType(options.responseType)
  })

  return {
    status: response.status,
    statusText: response.statusText,
    headers: normalizeHeaders(response.headers),
    data: response.data,
    url: response.url || options.url
  }
}

export async function performStoreHttpRequest<T = unknown>(
  options: StoreHttpRequestOptions
): Promise<StoreHttpResponse<T>> {
  if (!options || typeof options.url !== 'string' || options.url.trim().length === 0) {
    throw new Error('STORE_HTTP_INVALID_URL')
  }

  let parsed: URL
  try {
    parsed = new URL(options.url)
  } catch {
    throw new Error('STORE_HTTP_INVALID_URL')
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error('STORE_HTTP_UNSUPPORTED_PROTOCOL')
  }

  const method = (options.method ?? 'GET').toUpperCase()
  const timeout =
    typeof options.timeout === 'number' ? options.timeout : DEFAULT_STORE_HTTP_TIMEOUT_MS

  try {
    return await executeStoreHttpRequest<T>(options, method, timeout)
  } catch (firstError: unknown) {
    let error = firstError
    if (method === 'GET' && isRetryableStoreHttpError(firstError)) {
      await delay(STORE_HTTP_RETRY_DELAY_MS)
      try {
        return await executeStoreHttpRequest<T>(options, method, timeout)
      } catch (retryError) {
        error = retryError
      }
    }

    throw toStoreHttpError(error)
  }
}
