import type { MarketHttpRequestOptions, MarketHttpResponse } from '@talex-touch/utils/market'
import type { AxiosHeaderValue, AxiosResponseHeaders, Method, RawAxiosResponseHeaders } from 'axios'
import axios from 'axios'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

type HeaderSource = AxiosResponseHeaders | RawAxiosResponseHeaders | undefined

function normalizeHeaders(headers: HeaderSource): Record<string, string> {
  const normalized: Record<string, string> = {}

  if (!headers) {
    return normalized
  }

  const raw = isAxiosHeaders(headers)
    ? headers.toJSON()
    : (headers as Record<string, AxiosHeaderValue | undefined>)

  for (const [key, value] of Object.entries(raw)) {
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

function isAxiosHeaders(
  headers: AxiosResponseHeaders | RawAxiosResponseHeaders
): headers is AxiosResponseHeaders {
  return typeof (headers as AxiosResponseHeaders).toJSON === 'function'
}

export async function performMarketHttpRequest<T = unknown>(
  options: MarketHttpRequestOptions
): Promise<MarketHttpResponse<T>> {
  if (!options || typeof options.url !== 'string' || options.url.trim().length === 0) {
    throw new Error('MARKET_HTTP_INVALID_URL')
  }

  let parsed: URL
  try {
    parsed = new URL(options.url)
  } catch {
    throw new Error('MARKET_HTTP_INVALID_URL')
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error('MARKET_HTTP_UNSUPPORTED_PROTOCOL')
  }

  const method: Method = (options.method ?? 'GET').toUpperCase() as Method
  const timeout = typeof options.timeout === 'number' ? options.timeout : 15_000

  try {
    const response = await axios.request<T>({
      url: options.url,
      method,
      headers: options.headers,
      params: options.params,
      data: options.data,
      timeout,
      responseType: options.responseType ?? 'json',
      proxy: false,
      validateStatus: () => true
    })

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`MARKET_HTTP_STATUS_${response.status}`)
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: normalizeHeaders(response.headers),
      data: response.data,
      url: response.config.url ?? options.url
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('MARKET_HTTP_')) {
      throw error
    }
    const message = error instanceof Error ? error.message : ''
    throw new Error(message.length > 0 ? message : 'MARKET_HTTP_REQUEST_FAILED')
  }
}
