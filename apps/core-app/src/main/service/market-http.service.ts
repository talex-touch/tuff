import type { Method } from 'axios'
import axios from 'axios'
import type { MarketHttpRequestOptions, MarketHttpResponse } from '@talex-touch/utils/market'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

function normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const normalized: Record<string, string> = {}

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'undefined') {
      continue
    }

    normalized[key] = Array.isArray(value) ? value.join(', ') : value
  }

  return normalized
}

export async function performMarketHttpRequest<T = unknown>(
  options: MarketHttpRequestOptions,
): Promise<MarketHttpResponse<T>> {
  if (!options || typeof options.url !== 'string' || options.url.trim().length === 0) {
    throw new Error('MARKET_HTTP_INVALID_URL')
  }

  let parsed: URL
  try {
    parsed = new URL(options.url)
  }
  catch {
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
      validateStatus: () => true,
    })

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`MARKET_HTTP_STATUS_${response.status}`)
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: normalizeHeaders(response.headers),
      data: response.data,
      url: response.config.url ?? options.url,
    }
  }
  catch (error: any) {
    if (error?.message?.startsWith?.('MARKET_HTTP_')) {
      throw error
    }
    throw new Error(
      typeof error?.message === 'string' && error.message.length > 0
        ? error.message
        : 'MARKET_HTTP_REQUEST_FAILED',
    )
  }
}
